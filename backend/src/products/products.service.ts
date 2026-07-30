import { Injectable, NotFoundException } from '@nestjs/common';
import { Product } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeatured(): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { isFeatured: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!product) {
      throw new NotFoundException('No hay producto destacado disponible.');
    }

    return product;
  }
}
