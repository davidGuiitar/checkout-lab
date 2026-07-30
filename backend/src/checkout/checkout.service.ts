import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  Prisma,
  Product,
  Transaction,
  TransactionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PAYMENT_GATEWAY } from './domain/payment-gateway.port';
import type {
  PaymentGateway,
  PaymentStatus,
} from './domain/payment-gateway.port';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { BASE_FEE, DELIVERY_FEE } from './checkout-config.service';

type TransactionWithProduct = Transaction & { product: Product };
const CENTS_PER_PESO = 100;

export interface CheckoutResult {
  reference: string;
  status: TransactionStatus;
  total: number;
  product: {
    id: string;
    name: string;
    stock: number;
  };
}

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
  ) {}

  async create(
    dto: CreateCheckoutDto,
    customerIp?: string,
  ): Promise<CheckoutResult> {
    const localTransaction = await this.reserveProduct(dto);

    try {
      const contracts = await this.gateway.getMerchantContracts();
      const providerAmountInCents = localTransaction.total * CENTS_PER_PESO;
      const providerTransaction = await this.gateway.createTransaction({
        reference: localTransaction.reference,
        amountInCents: providerAmountInCents,
        customerEmail: dto.customer.email,
        paymentToken: dto.paymentToken,
        installments: dto.installments,
        signature: this.signature(
          localTransaction.reference,
          providerAmountInCents,
        ),
        acceptanceToken: contracts.acceptanceToken,
        personalDataToken: contracts.personalDataToken,
        customerIp,
      });

      await this.prisma.transaction.update({
        where: { id: localTransaction.id },
        data: { providerTransactionId: providerTransaction.id },
      });
      await this.finalize(localTransaction.id, providerTransaction.status);
    } catch (error: unknown) {
      await this.finalize(localTransaction.id, 'ERROR');
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(
        'No fue posible completar la comunicación con la pasarela.',
      );
    }

    return this.getByReference(localTransaction.reference);
  }

  async getByReference(reference: string): Promise<CheckoutResult> {
    let transaction = await this.findTransaction(reference);

    if (
      transaction.status === TransactionStatus.PENDING &&
      transaction.providerTransactionId
    ) {
      const providerTransaction = await this.gateway.getTransaction(
        transaction.providerTransactionId,
      );
      await this.finalize(transaction.id, providerTransaction.status);
      transaction = await this.findTransaction(reference);
    }

    return this.toResult(transaction);
  }

  private async reserveProduct(dto: CreateCheckoutDto): Promise<Transaction> {
    const reference = `CHK-${randomUUID()}`;

    return this.prisma.$transaction(async (database) => {
      const products = await database.$queryRaw<Product[]>(Prisma.sql`
        UPDATE "Product"
        SET "reservedStock" = "reservedStock" + 1
        WHERE "id" = ${dto.productId}
          AND "stock" > "reservedStock"
        RETURNING *
      `);
      const product = products[0];

      if (!product) {
        const exists = await database.product.count({
          where: { id: dto.productId },
        });
        if (!exists) throw new NotFoundException('Producto no encontrado.');
        throw new ConflictException('No hay unidades disponibles.');
      }

      return database.transaction.create({
        data: {
          reference,
          productAmount: product.price,
          baseFee: BASE_FEE,
          deliveryFee: DELIVERY_FEE,
          total: product.price + BASE_FEE + DELIVERY_FEE,
          product: {
            connect: { id: product.id },
          },
          customer: {
            create: {
              fullName: dto.customer.fullName,
              email: dto.customer.email,
              phone: dto.customer.phone,
            },
          },
          delivery: {
            create: {
              recipientName: dto.delivery.recipientName,
              address: dto.delivery.address,
              city: dto.delivery.city,
              department: dto.delivery.department,
              notes: dto.delivery.notes || null,
            },
          },
        },
      });
    });
  }

  private async finalize(
    transactionId: string,
    status: PaymentStatus,
  ): Promise<void> {
    if (status === 'PENDING') return;

    await this.prisma.$transaction(async (database) => {
      const updated = await database.transaction.updateMany({
        where: {
          id: transactionId,
          status: TransactionStatus.PENDING,
        },
        data: {
          status,
          failureReason: status === 'APPROVED' ? null : `PAYMENT_${status}`,
        },
      });

      if (!updated.count) return;

      const transaction = await database.transaction.findUniqueOrThrow({
        where: { id: transactionId },
      });
      await database.product.update({
        where: { id: transaction.productId },
        data:
          status === 'APPROVED'
            ? {
                stock: { decrement: 1 },
                reservedStock: { decrement: 1 },
              }
            : { reservedStock: { decrement: 1 } },
      });
    });
  }

  private signature(reference: string, total: number): string {
    const secret = process.env.PAYMENT_INTEGRITY_SECRET;
    if (!secret) {
      throw new BadGatewayException('Configuración de pagos incompleta.');
    }
    return createHash('sha256')
      .update(`${reference}${total}COP${secret}`)
      .digest('hex');
  }

  private async findTransaction(
    reference: string,
  ): Promise<TransactionWithProduct> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { reference },
      include: { product: true },
    });
    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada.');
    }
    return transaction;
  }

  private toResult(transaction: TransactionWithProduct): CheckoutResult {
    return {
      reference: transaction.reference,
      status: transaction.status,
      total: transaction.total,
      product: {
        id: transaction.product.id,
        name: transaction.product.name,
        stock: Math.max(
          0,
          transaction.product.stock - transaction.product.reservedStock,
        ),
      },
    };
  }
}
