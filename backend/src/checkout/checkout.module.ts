import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutConfigService } from './checkout-config.service';
import { CheckoutService } from './checkout.service';
import { PAYMENT_GATEWAY } from './domain/payment-gateway.port';
import { HttpPaymentGateway } from './infrastructure/http-payment.gateway';
import { TransactionsController } from '../transactions/transactions.controller';

/**
 * Módulo de checkout. Registra la implementación HTTP de la pasarela bajo el
 * token PAYMENT_GATEWAY, de modo que los servicios dependen de la interfaz
 * (puerto) y no de la implementación concreta (fácil de simular en pruebas).
 */
@Module({
  controllers: [CheckoutController, TransactionsController],
  providers: [
    CheckoutConfigService,
    CheckoutService,
    {
      provide: PAYMENT_GATEWAY,
      useClass: HttpPaymentGateway,
    },
  ],
})
export class CheckoutModule {}
