export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type PaymentStatus =
  'PENDING' | 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR';

export interface MerchantContracts {
  acceptanceToken: string;
  personalDataToken: string;
  termsUrl: string;
  personalDataUrl: string;
}

export interface CreateGatewayTransaction {
  reference: string;
  amountInCents: number;
  customerEmail: string;
  paymentToken: string;
  installments: number;
  signature: string;
  acceptanceToken: string;
  personalDataToken: string;
  customerIp?: string;
}

export interface GatewayTransaction {
  id: string;
  status: PaymentStatus;
}

export interface PaymentGateway {
  getMerchantContracts(): Promise<MerchantContracts>;
  getTokenizationKey(): Promise<string>;
  tokenizeEncryptedCard(payload: string): Promise<string>;
  createTransaction(
    input: CreateGatewayTransaction,
  ): Promise<GatewayTransaction>;
  getTransaction(id: string): Promise<GatewayTransaction>;
}
