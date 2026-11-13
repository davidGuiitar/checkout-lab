import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/** Producto tal como lo ve el cliente (stock ya descontando reservas). */
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

  /** Catálogo completo: primero los destacados, luego por antigüedad. */
  async getAll(): Promise<ProductResponse[]> {
    const products = await this.prisma.product.findMany({
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'asc' }],
    });

    return products.map((product) => this.toResponse(product));
  }

  /** Producto destacado más antiguo; 404 si no hay ninguno. */
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

  /** Oculta campos internos y calcula el stock disponible. */
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
      // Las unidades reservadas por pagos en curso no se pueden vender.
      stock: Math.max(0, product.stock - product.reservedStock),
    };
  }
}
