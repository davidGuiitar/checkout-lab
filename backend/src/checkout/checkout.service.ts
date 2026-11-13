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
import {
  BASE_FEE,
  DELIVERY_FEE,
  VAT_PERCENTAGE,
} from './checkout-config.service';

/** Transacción cargada junto con su producto principal y sus ítems. */
type TransactionWithItems = Prisma.TransactionGetPayload<{
  include: { product: true; items: { include: { product: true } } };
}>;
/** La pasarela trabaja en centavos; la base de datos guarda pesos. */
const CENTS_PER_PESO = 100;

/** Respuesta segura del checkout (sin datos sensibles del cliente ni de la tarjeta). */
export interface CheckoutResult {
  reference: string;
  status: TransactionStatus;
  total: number;
  vatAmount: number;
  quantity: number;
  /** Primer producto de la compra; se mantiene por compatibilidad. */
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

/**
 * Orquesta el checkout:
 * 1. Reserva el stock y crea la transacción local en estado PENDING.
 * 2. Crea el cobro en la pasarela.
 * 3. Finaliza la transacción según el resultado (descuenta o libera stock).
 */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
  ) {}

  /** Crea y procesa un checkout completo. */
  async create(
    dto: CreateCheckoutDto,
    customerIp?: string,
  ): Promise<CheckoutResult> {
    // Paso 1: reservar stock antes de cobrar, para no vender más de lo disponible.
    const localTransaction = await this.reserveProducts(dto);

    try {
      // Paso 2: cobrar en la pasarela con los tokens de aceptación vigentes.
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

      // Se guarda el id externo para poder consultar el estado más tarde.
      await this.prisma.transaction.update({
        where: { id: localTransaction.id },
        data: { providerTransactionId: providerTransaction.id },
      });
      // Paso 3: si la pasarela ya respondió con un estado final, se aplica.
      await this.finalize(localTransaction.id, providerTransaction.status);
    } catch {
      // Cualquier fallo marca la transacción como ERROR y libera la reserva.
      await this.finalize(localTransaction.id, 'ERROR');
      throw new BadGatewayException(
        'No fue posible completar la comunicación con la pasarela.',
      );
    }

    return this.getByReference(localTransaction.reference);
  }

  /**
   * Consulta una transacción por referencia. Si sigue PENDING, pregunta a la
   * pasarela por su estado actual y la sincroniza antes de responder.
   */
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

  /**
   * Normaliza los productos pedidos a una lista de ítems, aceptando el
   * formato carrito (`items`) o el heredado (`productId` + `quantity`).
   */
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
    // Se ordena por id para bloquear las filas siempre en el mismo orden y
    // evitar deadlocks entre compras simultáneas.
    return [...items].sort((left, right) =>
      left.productId.localeCompare(right.productId),
    );
  }

  /**
   * Reserva el stock de cada producto y crea la transacción PENDING, todo
   * dentro de una transacción de base de datos (si algo falla, nada se guarda).
   */
  private async reserveProducts(dto: CreateCheckoutDto): Promise<Transaction> {
    const reference = `CHK-${randomUUID()}`;
    const requestedItems = this.requestedItems(dto);

    return this.prisma.$transaction(async (database) => {
      const reservedItems: Array<CheckoutItemDto & { product: Product }> = [];
      for (const item of requestedItems) {
        // UPDATE atómico: solo reserva si hay unidades libres
        // (stock - reservedStock). Si no se actualiza ninguna fila, no hay stock.
        const products = await database.$queryRaw<Product[]>(Prisma.sql`
          UPDATE "Product"
          SET "reservedStock" = "reservedStock" + ${item.quantity}
          WHERE "id" = ${item.productId}
            AND "stock" - "reservedStock" >= ${item.quantity}
          RETURNING *
        `);
        const product = products[0];

        if (!product) {
          // Distingue entre producto inexistente (404) y sin stock (409).
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
      // IVA solo sobre los productos; se redondea a pesos enteros.
      const vatAmount = Math.round((productAmount * VAT_PERCENTAGE) / 100);
      // Columna productId heredada: se llena con el primer producto.
      const legacyProduct = reservedItems[0].product;

      return database.transaction.create({
        data: {
          reference,
          quantity: totalQuantity,
          productAmount,
          vatAmount,
          baseFee: BASE_FEE,
          deliveryFee: DELIVERY_FEE,
          // Total = productos + IVA + tarifa base + envío.
          total: productAmount + vatAmount + BASE_FEE + DELIVERY_FEE,
          product: {
            connect: { id: legacyProduct.id },
          },
          // Se guarda el precio unitario del momento de la compra.
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

  /**
   * Aplica un estado final a la transacción y ajusta el inventario:
   * - APPROVED: descuenta el stock y libera la reserva.
   * - Otro estado final: solo libera la reserva.
   * PENDING no hace nada (aún no hay resultado).
   */
  private async finalize(
    transactionId: string,
    status: PaymentStatus,
  ): Promise<void> {
    if (status === 'PENDING') return;

    await this.prisma.$transaction(async (database) => {
      // Solo actualiza si sigue PENDING; así el inventario se ajusta una sola
      // vez aunque finalize se llame varias veces (idempotente).
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

      // Otra petición ya la finalizó: no tocar el inventario de nuevo.
      if (!updated.count) return;

      const transaction = await database.transaction.findUniqueOrThrow({
        where: { id: transactionId },
        include: { items: true },
      });
      // Transacciones antiguas (sin ítems) usan productId/quantity directamente.
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

  /**
   * Firma de integridad exigida por la pasarela:
   * SHA-256 de referencia + monto en centavos + moneda + secreto.
   */
  private signature(reference: string, total: number): string {
    const secret = process.env.PAYMENT_INTEGRITY_SECRET;
    if (!secret) {
      throw new BadGatewayException('Configuración de pagos incompleta.');
    }
    return createHash('sha256')
      .update(`${reference}${total}COP${secret}`)
      .digest('hex');
  }

  /** Busca una transacción con sus ítems o lanza 404. */
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

  /** Convierte la transacción de base de datos en la respuesta pública. */
  private toResult(transaction: TransactionWithItems): CheckoutResult {
    // Transacciones antiguas sin ítems se representan como un único ítem.
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
      vatAmount: transaction.vatAmount,
      quantity: transaction.quantity,
      product: {
        id: transaction.product.id,
        name: transaction.product.name,
        // Stock disponible = stock total - unidades reservadas.
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
