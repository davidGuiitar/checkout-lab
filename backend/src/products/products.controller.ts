import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeaturedProduct, ProductsService } from './products.service';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('featured')
  @ApiOperation({ summary: 'Obtiene el producto destacado y su stock.' })
  @ApiOkResponse({ description: 'Producto destacado.' })
  getFeatured(): Promise<FeaturedProduct> {
    return this.productsService.getFeatured();
  }
}
