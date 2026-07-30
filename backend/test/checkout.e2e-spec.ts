import { BadGatewayException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import {
  PAYMENT_GATEWAY,
  CreateGatewayTransaction,
  GatewayTransaction,
  MerchantContracts,
  PaymentGateway,
} from '../src/checkout/domain/payment-gateway.port';
import { PrismaService } from '../src/database/prisma.service';

class FakePaymentGateway implements PaymentGateway {
  private readonly pendingPolls = new Map<string, number>();

  getMerchantContracts(): Promise<MerchantContracts> {
    return Promise.resolve({
      acceptanceToken: 'acceptance',
      personalDataToken: 'personal',
      termsUrl: 'https://contracts.example/terms',
      personalDataUrl: 'https://contracts.example/privacy',
    });
  }

  getTokenizationKey(): Promise<string> {
    return Promise.resolve('public-encryption-key');
  }

  tokenizeEncryptedCard(): Promise<string> {
    return Promise.resolve('tok_test_approved');
  }

  createTransaction(
    input: CreateGatewayTransaction,
  ): Promise<GatewayTransaction> {
    if (input.paymentToken === 'tok_test_network') {
      throw new BadGatewayException('upstream unavailable');
    }

    const id = `provider-${input.reference}`;
    if (input.paymentToken === 'tok_test_pending') {
      this.pendingPolls.set(id, 0);
      return Promise.resolve({ id, status: 'PENDING' });
    }
    if (input.paymentToken === 'tok_test_declined') {
      return Promise.resolve({ id, status: 'DECLINED' });
    }
    return Promise.resolve({ id, status: 'APPROVED' });
  }

  getTransaction(id: string): Promise<GatewayTransaction> {
    const polls = this.pendingPolls.get(id) ?? 0;
    this.pendingPolls.set(id, polls + 1);
    return Promise.resolve({
      id,
      status: polls === 0 ? 'PENDING' : 'APPROVED',
    });
  }
}

interface CheckoutResponseBody {
  reference: string;
  status: string;
}

describe('Checkout flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let productId: string;

  const payload = (paymentToken: string) => ({
    productId,
    customer: {
      fullName: 'E2E Customer',
      email: `checkout-${randomUUID()}@e2e.invalid`,
      phone: '3001234567',
    },
    delivery: {
      recipientName: 'E2E Customer',
      address: 'E2E Street 123',
      city: 'Bogota',
      department: 'Cundinamarca',
    },
    paymentToken,
    installments: 1,
    acceptedTerms: true,
    acceptedPersonalData: true,
  });

  beforeAll(async () => {
    process.env.PAYMENT_INTEGRITY_SECRET = 'e2e-integrity-placeholder';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PAYMENT_GATEWAY)
      .useValue(new FakePaymentGateway())
      .compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    const product = await prisma.product.create({
      data: {
        slug: `e2e-${randomUUID()}`,
        name: 'E2E Product',
        description: 'Product isolated for end-to-end tests',
        price: 100_000,
        stock: 1,
      },
    });
    productId = product.id;
  });

  afterEach(async () => {
    const transactions = await prisma.transaction.findMany({
      where: { productId },
      select: { customerId: true, deliveryId: true },
    });
    await prisma.transaction.deleteMany({ where: { productId } });
    await prisma.customer.deleteMany({
      where: { id: { in: transactions.map(({ customerId }) => customerId) } },
    });
    await prisma.delivery.deleteMany({
      where: { id: { in: transactions.map(({ deliveryId }) => deliveryId) } },
    });
    await prisma.product.deleteMany({ where: { id: productId } });
  });

  afterAll(async () => {
    delete process.env.PAYMENT_INTEGRITY_SECRET;
    await app.close();
  });

  it('approves payment and decrements inventory exactly once', async () => {
    const result = await request(app.getHttpServer())
      .post('/checkout')
      .send(payload('tok_test_approved'))
      .expect(201);

    expect(result.body).toMatchObject({
      status: 'APPROVED',
      total: 110_000,
      product: { stock: 0 },
    });
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: productId } }),
    ).resolves.toMatchObject({ stock: 0, reservedStock: 0 });
  });

  it('keeps inventory for declined and network-error payments', async () => {
    const declined = await request(app.getHttpServer())
      .post('/checkout')
      .send(payload('tok_test_declined'))
      .expect(201);
    expect((declined.body as CheckoutResponseBody).status).toBe('DECLINED');

    await prisma.product.update({
      where: { id: productId },
      data: { stock: 2 },
    });
    const networkError = await request(app.getHttpServer())
      .post('/checkout')
      .send(payload('tok_test_network'))
      .expect(502);
    expect(JSON.stringify(networkError.body)).not.toContain(
      'upstream unavailable',
    );

    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: productId } }),
    ).resolves.toMatchObject({ stock: 2, reservedStock: 0 });
  });

  it('rejects checkout when no inventory is available', async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { stock: 0 },
    });

    await request(app.getHttpServer())
      .post('/checkout')
      .send(payload('tok_test_approved'))
      .expect(409);
  });

  it('recovers a pending transaction after refresh without a second decrement', async () => {
    const created = await request(app.getHttpServer())
      .post('/checkout')
      .send(payload('tok_test_pending'))
      .expect(201);
    const createdBody = created.body as CheckoutResponseBody;
    expect(createdBody.status).toBe('PENDING');

    const recovered = await request(app.getHttpServer())
      .get(`/transactions/${createdBody.reference}`)
      .expect(200);
    expect((recovered.body as CheckoutResponseBody).status).toBe('APPROVED');

    await request(app.getHttpServer())
      .get(`/transactions/${createdBody.reference}`)
      .expect(200);
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: productId } }),
    ).resolves.toMatchObject({ stock: 0, reservedStock: 0 });
  });

  it('allows only one concurrent checkout for the last unit', async () => {
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/checkout')
        .send(payload('tok_test_approved')),
      request(app.getHttpServer())
        .post('/checkout')
        .send(payload('tok_test_approved')),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      await prisma.transaction.count({
        where: { productId, status: 'APPROVED' },
      }),
    ).toBe(1);
    await expect(
      prisma.product.findUniqueOrThrow({ where: { id: productId } }),
    ).resolves.toMatchObject({ stock: 0, reservedStock: 0 });
  });

  it('rejects raw card fields and invalid recovery references', async () => {
    await request(app.getHttpServer())
      .post('/checkout')
      .send({
        ...payload('tok_test_approved'),
        cardNumber: 'not-accepted',
        cvc: 'not-accepted',
      })
      .expect(400);
    await request(app.getHttpServer())
      .get('/transactions/invalid-reference')
      .expect(400);
  });

  it('serves security and restricted CORS headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/')
      .set('Origin', 'https://untrusted.example')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['access-control-allow-origin']).toBe(
      process.env.FRONTEND_URL ?? 'http://localhost:5173',
    );
    expect(response.headers['access-control-allow-origin']).not.toBe(
      'https://untrusted.example',
    );
  });

  it('rate-limits abusive request bursts', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 105; attempt += 1) {
      statuses.push(
        (await request(app.getHttpServer()).get('/products/featured')).status,
      );
    }

    expect(statuses).toContain(429);
  });
});
