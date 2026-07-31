import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductResponse, ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtiene el catálogo y el stock disponible.' })
  @ApiOkResponse({ description: 'Catálogo de productos.' })
  getAll(): Promise<ProductResponse[]> {
    return this.productsService.getAll();
  }

  @Get('featured')
  @ApiOperation({ summary: 'Obtiene el producto destacado y su stock.' })
  @ApiOkResponse({ description: 'Producto destacado.' })
  getFeatured(): Promise<ProductResponse> {
    return this.productsService.getFeatured();
  }
}
