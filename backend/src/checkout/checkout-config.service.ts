import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_GATEWAY } from './domain/payment-gateway.port';
import type { PaymentGateway } from './domain/payment-gateway.port';

export const BASE_FEE = 2_000;
export const DELIVERY_FEE = 8_000;

export interface CheckoutConfig {
  baseFee: number;
  deliveryFee: number;
  paymentPublicKey: string | null;
  paymentApiUrl: string | null;
  tokenizationKey: string | null;
  contracts: {
    termsUrl: string;
    personalDataUrl: string;
  } | null;
}

@Injectable()
export class CheckoutConfigService {
  constructor(
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
  ) {}

  async getPublicConfig(): Promise<CheckoutConfig> {
    const paymentPublicKey = process.env.PAYMENT_PUBLIC_KEY || null;
    const paymentApiUrl = process.env.PAYMENT_API_URL || null;
    const [contracts, tokenizationKey] =
      paymentPublicKey && paymentApiUrl
        ? await Promise.all([
            this.gateway.getMerchantContracts(),
            this.gateway.getTokenizationKey(),
          ])
        : [null, null];

    return {
      baseFee: BASE_FEE,
      deliveryFee: DELIVERY_FEE,
      paymentPublicKey,
      paymentApiUrl,
      tokenizationKey,
      contracts: contracts
        ? {
            termsUrl: contracts.termsUrl,
            personalDataUrl: contracts.personalDataUrl,
          }
        : null,
    };
  }

  async tokenize(payload: string): Promise<{ token: string }> {
    return { token: await this.gateway.tokenizeEncryptedCard(payload) };
  }
}
