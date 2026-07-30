import { BadGatewayException } from '@nestjs/common';
import { Product, TransactionStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentGateway } from './domain/payment-gateway.port';

describe('CheckoutService', () => {
  const product = {
    id: 'f91a45dc-b838-4d0f-81bb-f1db46ca48fa',
    slug: 'product',
    name: 'Product',
    description: 'Description',
    price: 100_000,
    stock: 1,
    reservedStock: 1,
    isFeatured: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } satisfies Product;
  const pendingTransaction = {
    id: 'transaction-id',
    reference: 'CHK-9fe5923f-7fef-4a5c-99fc-20db7464c774',
    status: TransactionStatus.PENDING,
    productId: product.id,
    customerId: 'customer-id',
    deliveryId: 'delivery-id',
    productAmount: product.price,
    baseFee: 2_000,
    deliveryFee: 8_000,
    total: 110_000,
    providerTransactionId: null,
    failureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const dto: CreateCheckoutDto = {
    productId: product.id,
    customer: {
      fullName: 'Test Customer',
      email: 'test@example.com',
      phone: '3001234567',
    },
    delivery: {
      recipientName: 'Test Customer',
      address: 'Street 123',
      city: 'Bogota',
      department: 'Cundinamarca',
    },
    paymentToken: 'tok_test_safe',
    installments: 1,
    acceptedTerms: true,
    acceptedPersonalData: true,
  };

  const reserveProduct = jest.fn();
  const countProducts = jest.fn();
  const updateProduct = jest.fn();
  const createLocalTransaction = jest.fn();
  const updateLocalStatus = jest.fn();
  const findLocalTransaction = jest.fn();
  const attachProviderId = jest.fn();
  const findTransactionByReference = jest.fn();
  const getMerchantContracts = jest.fn();
  const createGatewayTransaction = jest.fn();
  const getGatewayTransaction = jest.fn();
  const getTokenizationKey = jest.fn();
  const tokenizeEncryptedCard = jest.fn();
  const database = {
    $queryRaw: reserveProduct,
    product: {
      count: countProducts,
      update: updateProduct,
    },
    transaction: {
      create: createLocalTransaction,
      updateMany: updateLocalStatus,
      findUniqueOrThrow: findLocalTransaction,
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: typeof database) => Promise<unknown>) =>
        callback(database),
    ),
    transaction: {
      update: attachProviderId,
      findUnique: findTransactionByReference,
    },
  } as unknown as PrismaService;
  const gateway = {
    getMerchantContracts,
    getTokenizationKey,
    tokenizeEncryptedCard,
    createTransaction: createGatewayTransaction,
    getTransaction: getGatewayTransaction,
  } as unknown as PaymentGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PAYMENT_INTEGRITY_SECRET = 'test_integrity_not_a_secret';
    reserveProduct.mockResolvedValue([product]);
    createLocalTransaction.mockResolvedValue(pendingTransaction);
    updateLocalStatus.mockResolvedValue({ count: 1 });
    findLocalTransaction.mockResolvedValue(pendingTransaction);
    updateProduct.mockResolvedValue(product);
    getMerchantContracts.mockResolvedValue({
      acceptanceToken: 'acceptance',
      personalDataToken: 'personal',
      termsUrl: 'https://contracts.example/terms',
      personalDataUrl: 'https://contracts.example/privacy',
    });
  });

  afterAll(() => delete process.env.PAYMENT_INTEGRITY_SECRET);

  it('decrements stock once when the payment is approved', async () => {
    createGatewayTransaction.mockResolvedValue({
      id: 'provider-id',
      status: 'APPROVED',
    });
    findTransactionByReference.mockResolvedValue({
      ...pendingTransaction,
      status: TransactionStatus.APPROVED,
      providerTransactionId: 'provider-id',
      product: { ...product, stock: 0, reservedStock: 0 },
    });

    await expect(
      new CheckoutService(prisma, gateway).create(dto),
    ).resolves.toMatchObject({
      status: TransactionStatus.APPROVED,
      total: 110_000,
      product: { stock: 0 },
    });

    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: product.id },
      data: {
        stock: { decrement: 1 },
        reservedStock: { decrement: 1 },
      },
    });
    expect(createGatewayTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amountInCents: 11_000_000 }),
    );
  });

  it('releases the reservation without decrementing stock on gateway error', async () => {
    createGatewayTransaction.mockRejectedValue(
      new BadGatewayException('gateway unavailable'),
    );

    await expect(
      new CheckoutService(prisma, gateway).create(dto),
    ).rejects.toThrow(BadGatewayException);
    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: product.id },
      data: { reservedStock: { decrement: 1 } },
    });
  });
});
