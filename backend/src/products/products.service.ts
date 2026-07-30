import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface FeaturedProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  stock: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async getFeatured(): Promise<FeaturedProduct> {
    const product = await this.prisma.product.findFirst({
      where: { isFeatured: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!product) {
      throw new NotFoundException('No hay producto destacado disponible.');
    }

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      price: product.price,
      stock: Math.max(0, product.stock - product.reservedStock),
    };
  }
}
