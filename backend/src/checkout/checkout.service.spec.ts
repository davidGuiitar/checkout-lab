import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
    stock: 2,
    reservedStock: 2,
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
    quantity: 2,
    productAmount: product.price * 2,
    baseFee: 2_000,
    deliveryFee: 8_000,
    total: 210_000,
    providerTransactionId: null,
    failureReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const transactionItem = {
    id: 'transaction-item-id',
    transactionId: pendingTransaction.id,
    productId: product.id,
    quantity: 2,
    unitPrice: product.price,
    amount: product.price * 2,
  };
  const dto: CreateCheckoutDto = {
    productId: product.id,
    quantity: 2,
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
    countProducts.mockResolvedValue(1);
    createLocalTransaction.mockResolvedValue(pendingTransaction);
    updateLocalStatus.mockResolvedValue({ count: 1 });
    findLocalTransaction.mockResolvedValue({
      ...pendingTransaction,
      items: [transactionItem],
    });
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
      items: [
        {
          ...transactionItem,
          product: { ...product, stock: 0, reservedStock: 0 },
        },
      ],
    });

    await expect(
      new CheckoutService(prisma, gateway).create(dto),
    ).resolves.toMatchObject({
      status: TransactionStatus.APPROVED,
      total: 210_000,
      quantity: 2,
      product: { stock: 0 },
    });

    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: product.id },
      data: {
        stock: { decrement: 2 },
        reservedStock: { decrement: 2 },
      },
    });
    expect(createGatewayTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amountInCents: 21_000_000 }),
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
      data: { reservedStock: { decrement: 2 } },
    });
  });

  it('polls a pending provider transaction and finalizes approval once', async () => {
    createGatewayTransaction.mockResolvedValue({
      id: 'provider-id',
      status: 'PENDING',
    });
    getGatewayTransaction.mockResolvedValue({
      id: 'provider-id',
      status: 'APPROVED',
    });
    findTransactionByReference
      .mockResolvedValueOnce({
        ...pendingTransaction,
        providerTransactionId: 'provider-id',
        product,
        items: [{ ...transactionItem, product }],
      })
      .mockResolvedValueOnce({
        ...pendingTransaction,
        providerTransactionId: 'provider-id',
        status: TransactionStatus.APPROVED,
        product: { ...product, stock: 0, reservedStock: 0 },
        items: [
          {
            ...transactionItem,
            product: { ...product, stock: 0, reservedStock: 0 },
          },
        ],
      });

    await expect(
      new CheckoutService(prisma, gateway).create(dto),
    ).resolves.toMatchObject({ status: TransactionStatus.APPROVED });
    expect(getGatewayTransaction).toHaveBeenCalledWith('provider-id');
    expect(updateProduct).toHaveBeenCalledTimes(1);
  });

  it('releases reserved inventory for a declined payment', async () => {
    createGatewayTransaction.mockResolvedValue({
      id: 'provider-id',
      status: 'DECLINED',
    });
    findTransactionByReference.mockResolvedValue({
      ...pendingTransaction,
      providerTransactionId: 'provider-id',
      status: TransactionStatus.DECLINED,
      product: { ...product, reservedStock: 0 },
      items: [
        {
          ...transactionItem,
          product: { ...product, reservedStock: 0 },
        },
      ],
    });

    await expect(
      new CheckoutService(prisma, gateway).create(dto),
    ).resolves.toMatchObject({ status: TransactionStatus.DECLINED });
    expect(updateProduct).toHaveBeenCalledWith({
      where: { id: product.id },
      data: { reservedStock: { decrement: 2 } },
    });
  });

  it('distinguishes a missing product from sold-out inventory', async () => {
    reserveProduct.mockResolvedValue([]);
    countProducts.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const service = new CheckoutService(prisma, gateway);

    await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    await expect(service.create(dto)).rejects.toThrow(ConflictException);
    expect(createGatewayTransaction).not.toHaveBeenCalled();
  });

  it('maps unexpected provider failures without exposing their details', async () => {
    createGatewayTransaction.mockRejectedValue(
      new Error('provider implementation detail'),
    );

    await expect(
      new CheckoutService(prisma, gateway).create(dto),
    ).rejects.toThrow(
      'No fue posible completar la comunicación con la pasarela.',
    );
  });

  it('returns terminal transactions without querying the provider', async () => {
    findTransactionByReference.mockResolvedValue({
      ...pendingTransaction,
      status: TransactionStatus.APPROVED,
      providerTransactionId: 'provider-id',
      product: { ...product, stock: 1, reservedStock: 0 },
      items: [
        {
          ...transactionItem,
          product: { ...product, stock: 1, reservedStock: 0 },
        },
      ],
    });

    await expect(
      new CheckoutService(prisma, gateway).getByReference(
        pendingTransaction.reference,
      ),
    ).resolves.toMatchObject({
      status: TransactionStatus.APPROVED,
      product: { stock: 1 },
    });
    expect(getGatewayTransaction).not.toHaveBeenCalled();
  });

  it('returns not found for an unknown reference', async () => {
    findTransactionByReference.mockResolvedValue(null);

    await expect(
      new CheckoutService(prisma, gateway).getByReference(
        pendingTransaction.reference,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('does not mutate inventory twice when a transaction is already final', async () => {
    createGatewayTransaction.mockResolvedValue({
      id: 'provider-id',
      status: 'APPROVED',
    });
    updateLocalStatus.mockResolvedValue({ count: 0 });
    findTransactionByReference.mockResolvedValue({
      ...pendingTransaction,
      status: TransactionStatus.APPROVED,
      providerTransactionId: 'provider-id',
      product: { ...product, stock: 0, reservedStock: 0 },
      items: [
        {
          ...transactionItem,
          product: { ...product, stock: 0, reservedStock: 0 },
        },
      ],
    });

    await new CheckoutService(prisma, gateway).create(dto);
    expect(updateProduct).not.toHaveBeenCalled();
  });

  it('reserves and finalizes different products in one cart', async () => {
    const secondProduct = {
      ...product,
      id: '40d333d9-d196-4b31-9777-07b18c12ad1f',
      name: 'Second Product',
      price: 50_000,
      stock: 5,
      reservedStock: 1,
    };
    const cartDto: CreateCheckoutDto = {
      ...dto,
      productId: undefined,
      quantity: undefined,
      items: [
        { productId: product.id, quantity: 2 },
        { productId: secondProduct.id, quantity: 1 },
      ],
    };
    reserveProduct
      .mockResolvedValueOnce([secondProduct])
      .mockResolvedValueOnce([product]);
    createLocalTransaction.mockResolvedValue({
      ...pendingTransaction,
      quantity: 3,
      productAmount: 250_000,
      total: 260_000,
    });
    findLocalTransaction.mockResolvedValue({
      ...pendingTransaction,
      quantity: 3,
      items: [
        { ...transactionItem, productId: secondProduct.id, quantity: 1 },
        transactionItem,
      ],
    });
    createGatewayTransaction.mockResolvedValue({
      id: 'provider-id',
      status: 'APPROVED',
    });
    findTransactionByReference.mockResolvedValue({
      ...pendingTransaction,
      status: TransactionStatus.APPROVED,
      quantity: 3,
      productAmount: 250_000,
      total: 260_000,
      product: secondProduct,
      items: [
        {
          ...transactionItem,
          productId: secondProduct.id,
          quantity: 1,
          unitPrice: secondProduct.price,
          amount: secondProduct.price,
          product: secondProduct,
        },
        { ...transactionItem, product },
      ],
    });

    await expect(
      new CheckoutService(prisma, gateway).create(cartDto),
    ).resolves.toMatchObject({
      total: 260_000,
      quantity: 3,
      items: [
        { productId: secondProduct.id, quantity: 1 },
        { productId: product.id, quantity: 2 },
      ],
    });
    expect(reserveProduct).toHaveBeenCalledTimes(2);
    expect(updateProduct).toHaveBeenCalledTimes(2);
    expect(createLocalTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects ambiguous, empty and oversized carts before reserving stock', async () => {
    const service = new CheckoutService(prisma, gateway);
    await expect(
      service.create({
        ...dto,
        items: [{ productId: product.id, quantity: 1 }],
      }),
    ).rejects.toThrow('pero no ambos formatos');
    await expect(
      service.create({ ...dto, productId: undefined, quantity: undefined }),
    ).rejects.toThrow('debe contener productos');
    await expect(
      service.create({
        ...dto,
        productId: undefined,
        quantity: undefined,
        items: [
          { productId: product.id, quantity: 100 },
          {
            productId: '40d333d9-d196-4b31-9777-07b18c12ad1f',
            quantity: 1,
          },
        ],
      }),
    ).rejects.toThrow('no puede superar 100 unidades');
    expect(reserveProduct).not.toHaveBeenCalled();
  });
});
