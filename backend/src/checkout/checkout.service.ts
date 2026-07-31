import {
  BadRequestException,
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
import { CheckoutItemDto, CreateCheckoutDto } from './dto/create-checkout.dto';
import { BASE_FEE, DELIVERY_FEE } from './checkout-config.service';

type TransactionWithItems = Prisma.TransactionGetPayload<{
  include: { product: true; items: { include: { product: true } } };
}>;
const CENTS_PER_PESO = 100;

export interface CheckoutResult {
  reference: string;
  status: TransactionStatus;
  total: number;
  quantity: number;
  product: {
    id: string;
    name: string;
    stock: number;
  };
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    stock: number;
  }>;
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
    const localTransaction = await this.reserveProducts(dto);

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
    } catch {
      await this.finalize(localTransaction.id, 'ERROR');
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

  private requestedItems(dto: CreateCheckoutDto): CheckoutItemDto[] {
    if (dto.items?.length && (dto.productId || dto.quantity)) {
      throw new BadRequestException(
        'Envía items o productId/quantity, pero no ambos formatos.',
      );
    }
    const items = dto.items?.length
      ? dto.items
      : dto.productId && dto.quantity
        ? [{ productId: dto.productId, quantity: dto.quantity }]
        : [];
    if (!items.length) {
      throw new BadRequestException('El carrito debe contener productos.');
    }
    if (items.reduce((total, item) => total + item.quantity, 0) > 100) {
      throw new BadRequestException(
        'El carrito no puede superar 100 unidades.',
      );
    }
    return [...items].sort((left, right) =>
      left.productId.localeCompare(right.productId),
    );
  }

  private async reserveProducts(dto: CreateCheckoutDto): Promise<Transaction> {
    const reference = `CHK-${randomUUID()}`;
    const requestedItems = this.requestedItems(dto);

    return this.prisma.$transaction(async (database) => {
      const reservedItems: Array<CheckoutItemDto & { product: Product }> = [];
      for (const item of requestedItems) {
        const products = await database.$queryRaw<Product[]>(Prisma.sql`
          UPDATE "Product"
          SET "reservedStock" = "reservedStock" + ${item.quantity}
          WHERE "id" = ${item.productId}
            AND "stock" - "reservedStock" >= ${item.quantity}
          RETURNING *
        `);
        const product = products[0];

        if (!product) {
          const exists = await database.product.count({
            where: { id: item.productId },
          });
          if (!exists) throw new NotFoundException('Producto no encontrado.');
          throw new ConflictException(
            `No hay suficientes unidades disponibles para ${item.productId}.`,
          );
        }
        reservedItems.push({ ...item, product });
      }

      const productAmount = reservedItems.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      );
      const totalQuantity = reservedItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      const legacyProduct = reservedItems[0].product;

      return database.transaction.create({
        data: {
          reference,
          quantity: totalQuantity,
          productAmount,
          baseFee: BASE_FEE,
          deliveryFee: DELIVERY_FEE,
          total: productAmount + BASE_FEE + DELIVERY_FEE,
          product: {
            connect: { id: legacyProduct.id },
          },
          items: {
            create: reservedItems.map((item) => ({
              product: { connect: { id: item.product.id } },
              quantity: item.quantity,
              unitPrice: item.product.price,
              amount: item.product.price * item.quantity,
            })),
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
        include: { items: true },
      });
      const inventoryItems = transaction.items.length
        ? transaction.items
        : [
            {
              productId: transaction.productId,
              quantity: transaction.quantity,
            },
          ];
      for (const item of inventoryItems) {
        await database.product.update({
          where: { id: item.productId },
          data:
            status === 'APPROVED'
              ? {
                  stock: { decrement: item.quantity },
                  reservedStock: { decrement: item.quantity },
                }
              : { reservedStock: { decrement: item.quantity } },
        });
      }
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
  ): Promise<TransactionWithItems> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { reference },
      include: { product: true, items: { include: { product: true } } },
    });
    if (!transaction) {
      throw new NotFoundException('Transacción no encontrada.');
    }
    return transaction;
  }

  private toResult(transaction: TransactionWithItems): CheckoutResult {
    const items = transaction.items.length
      ? transaction.items
      : [
          {
            productId: transaction.productId,
            product: transaction.product,
            quantity: transaction.quantity,
            unitPrice: transaction.productAmount / transaction.quantity,
            amount: transaction.productAmount,
          },
        ];
    return {
      reference: transaction.reference,
      status: transaction.status,
      total: transaction.total,
      quantity: transaction.quantity,
      product: {
        id: transaction.product.id,
        name: transaction.product.name,
        stock: Math.max(
          0,
          transaction.product.stock - transaction.product.reservedStock,
        ),
      },
      items: items.map((item) => ({
        productId: item.productId,
        name: item.product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
        stock: Math.max(0, item.product.stock - item.product.reservedStock),
      })),
    };
  }
}
