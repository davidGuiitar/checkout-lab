import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CheckoutConfigService } from './checkout-config.service';
import type { CheckoutConfig } from './checkout-config.service';

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly configService: CheckoutConfigService) {}

  @Get('config')
  @ApiOperation({ summary: 'Obtiene la configuración pública del checkout.' })
  @ApiOkResponse({ description: 'Tarifas y llave pública de tokenización.' })
  getConfig(): CheckoutConfig {
    return this.configService.getPublicConfig();
  }
}
