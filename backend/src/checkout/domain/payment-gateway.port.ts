/**
 * Puerto (interfaz) hacia la pasarela de pagos. El dominio depende de este
 * contrato y la infraestructura (HttpPaymentGateway) lo implementa.
 */

/** Token de inyección de dependencias para la pasarela. */
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Estados posibles de una transacción en la pasarela. */
export type PaymentStatus =
  'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR';

/** Contratos que el cliente debe aceptar (términos y tratamiento de datos). */
export interface MerchantContracts {
  acceptanceToken: string;
  personalDataToken: string;
  termsUrl: string;
  personalDataUrl: string;
}

/** Datos necesarios para crear un cobro en la pasarela. */
export interface CreateGatewayTransaction {
  reference: string;
  /** Monto total en centavos (pesos × 100). */
  amountInCents: number;
  customerEmail: string;
  paymentToken: string;
  installments: number;
  /** Firma de integridad SHA-256 que evita la manipulación del monto. */
  signature: string;
  acceptanceToken: string;
  personalDataToken: string;
  customerIp?: string;
}

export interface GatewayTransaction {
  id: string;
  status: PaymentStatus;
}

/** Operaciones que el checkout necesita de la pasarela de pagos. */
export interface PaymentGateway {
  getMerchantContracts(): Promise<MerchantContracts>;
  getTokenizationKey(): Promise<string>;
  tokenizeEncryptedCard(payload: string): Promise<string>;
  createTransaction(
    input: CreateGatewayTransaction,
  ): Promise<GatewayTransaction>;
  getTransaction(id: string): Promise<GatewayTransaction>;
}
