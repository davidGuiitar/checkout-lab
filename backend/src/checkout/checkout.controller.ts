import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CheckoutConfigService } from './checkout-config.service';
import type { CheckoutConfig } from './checkout-config.service';
import { CheckoutResult, CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { TokenizeCardDto } from './dto/tokenize-card.dto';

/** Endpoints del flujo de pago: configuración, tokenización y creación del checkout. */
@ApiTags('checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly configService: CheckoutConfigService,
    private readonly checkoutService: CheckoutService,
  ) {}

  /** Devuelve tarifas, % de IVA y datos públicos de la pasarela para el frontend. */
  @Get('config')
  @ApiOperation({ summary: 'Obtiene la configuración pública del checkout.' })
  @ApiOkResponse({ description: 'Tarifas y llave pública de tokenización.' })
  getConfig(): Promise<CheckoutConfig> {
    return this.configService.getPublicConfig();
  }

  /**
   * Recibe la tarjeta cifrada (JWE) desde el navegador y la cambia por un
   * token de la pasarela. El backend nunca ve los datos de la tarjeta en claro.
   */
  @Post('tokenize')
  @ApiOperation({
    summary: 'Tokeniza un JWE sin recibir datos de tarjeta en claro.',
  })
  @ApiOkResponse({ description: 'Token efímero de tarjeta.' })
  tokenize(@Body() dto: TokenizeCardDto): Promise<{ token: string }> {
    return this.configService.tokenize(dto.payload);
  }

  /** Reserva stock, cobra con el token de tarjeta y devuelve el estado del pago. */
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
