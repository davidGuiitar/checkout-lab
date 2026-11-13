import { Inject, Injectable } from '@nestjs/common';
import { PAYMENT_GATEWAY } from './domain/payment-gateway.port';
import type { PaymentGateway } from './domain/payment-gateway.port';

// Montos en pesos colombianos (COP), sin centavos.
/** Tarifa fija de servicio por compra. */
export const BASE_FEE = 2_000;
/** Costo de envío por compra. */
export const DELIVERY_FEE = 8_000;
/** IVA aplicado solo sobre el subtotal de productos (no a tarifas ni envío). */
export const VAT_PERCENTAGE = 19;

/** Configuración pública que el frontend necesita para mostrar el checkout. */
export interface CheckoutConfig {
  baseFee: number;
  deliveryFee: number;
  vatPercentage: number;
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

  /**
   * Arma la configuración pública. Si la pasarela no está configurada
   * (faltan variables de entorno), no se consulta y los campos quedan en null.
   */
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

    // Solo se exponen las URLs de los contratos; los tokens de aceptación
    // se obtienen en el servidor al momento de cobrar.
    return {
      baseFee: BASE_FEE,
      deliveryFee: DELIVERY_FEE,
      vatPercentage: VAT_PERCENTAGE,
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

  /** Envía la tarjeta cifrada a la pasarela y devuelve el token resultante. */
  async tokenize(payload: string): Promise<{ token: string }> {
    return { token: await this.gateway.tokenizeEncryptedCard(payload) };
  }
}
