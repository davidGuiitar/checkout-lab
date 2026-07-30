import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutConfigService } from './checkout-config.service';
import { CheckoutService } from './checkout.service';
import { PAYMENT_GATEWAY } from './domain/payment-gateway.port';
import { HttpPaymentGateway } from './infrastructure/http-payment.gateway';
import { TransactionsController } from '../transactions/transactions.controller';

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
