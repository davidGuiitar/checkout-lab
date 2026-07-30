import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const findFirst = jest.fn();
  const prisma = { product: { findFirst } } as unknown as PrismaService;
  const service = new ProductsService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('returns the featured product', async () => {
    const product = { id: 'product-1', stock: 3 };
    findFirst.mockResolvedValue(product);

    await expect(service.getFeatured()).resolves.toEqual(product);
    expect(findFirst).toHaveBeenCalledWith({
      where: { isFeatured: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('fails clearly when no featured product exists', async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.getFeatured()).rejects.toThrow(NotFoundException);
  });
});
