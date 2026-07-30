import { Injectable } from '@nestjs/common';

export const BASE_FEE = 2_000;
export const DELIVERY_FEE = 8_000;

export interface CheckoutConfig {
  baseFee: number;
  deliveryFee: number;
  paymentPublicKey: string | null;
}

@Injectable()
export class CheckoutConfigService {
  getPublicConfig(): CheckoutConfig {
    return {
      baseFee: BASE_FEE,
      deliveryFee: DELIVERY_FEE,
      paymentPublicKey: process.env.PAYMENT_PUBLIC_KEY || null,
    };
  }
}
