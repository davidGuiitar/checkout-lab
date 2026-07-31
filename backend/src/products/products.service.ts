import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface ProductResponse {
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

  async getAll(): Promise<ProductResponse[]> {
    const products = await this.prisma.product.findMany({
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'asc' }],
    });

    return products.map((product) => this.toResponse(product));
  }

  async getFeatured(): Promise<ProductResponse> {
    const product = await this.prisma.product.findFirst({
      where: { isFeatured: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!product) {
      throw new NotFoundException('No hay producto destacado disponible.');
    }

    return this.toResponse(product);
  }

  private toResponse(product: {
    id: string;
    slug: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    reservedStock: number;
  }): ProductResponse {
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
