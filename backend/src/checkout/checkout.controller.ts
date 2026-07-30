import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CheckoutConfigService } from './checkout-config.service';
import type { CheckoutConfig } from './checkout-config.service';
import { CheckoutResult, CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { TokenizeCardDto } from './dto/tokenize-card.dto';

@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly configService: CheckoutConfigService,
    private readonly checkoutService: CheckoutService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Obtiene la configuración pública del checkout.' })
  @ApiOkResponse({ description: 'Tarifas y llave pública de tokenización.' })
  getConfig(): Promise<CheckoutConfig> {
    return this.configService.getPublicConfig();
  }

  @Post('tokenize')
  @ApiOperation({
    summary: 'Tokeniza un JWE sin recibir datos de tarjeta en claro.',
  })
  @ApiOkResponse({ description: 'Token efímero de tarjeta.' })
  tokenize(@Body() dto: TokenizeCardDto): Promise<{ token: string }> {
    return this.configService.tokenize(dto.payload);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea y procesa un checkout con tarjeta tokenizada.',
  })
  @ApiOkResponse({ description: 'Referencia y estado seguro del checkout.' })
  create(
    @Body() dto: CreateCheckoutDto,
    @Ip() customerIp: string,
  ): Promise<CheckoutResult> {
    return this.checkoutService.create(dto, customerIp);
  }
}
