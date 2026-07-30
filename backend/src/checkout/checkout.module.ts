import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutConfigService } from './checkout-config.service';

@Module({
  controllers: [CheckoutController],
  providers: [CheckoutConfigService],
})
export class CheckoutModule {}
