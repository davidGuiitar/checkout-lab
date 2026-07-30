import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateGatewayTransaction,
  GatewayTransaction,
  MerchantContracts,
  PaymentGateway,
  PaymentStatus,
} from '../domain/payment-gateway.port';

interface MerchantResponse {
  data?: {
    presigned_acceptance?: {
      acceptance_token?: string;
      permalink?: string;
    };
    presigned_personal_data_auth?: {
      acceptance_token?: string;
      permalink?: string;
    };
  };
}

interface TransactionResponse {
  data?: {
    id?: string;
    status?: string;
  };
  error?: {
    type?: string;
    reason?: string;
    messages?: Record<string, unknown>;
  };
}

interface TokenizationKeyResponse {
  data?: {
    publicKey?: string;
  };
}

interface TokenizationResponse {
  status?: string;
  data?: {
    id?: string;
  };
}

const PAYMENT_STATUSES = new Set<PaymentStatus>([
  'PENDING',
  'APPROVED',
  'DECLINED',
  'VOIDED',
  'ERROR',
]);

@Injectable()
export class HttpPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(HttpPaymentGateway.name);

  constructor(private readonly config: ConfigService) {}

  async getMerchantContracts(): Promise<MerchantContracts> {
    const publicKey = this.required('PAYMENT_PUBLIC_KEY');
    const response = await fetch(
      `${this.baseUrl}/merchants/${encodeURIComponent(publicKey)}`,
    );
    const body = (await this.safeJson(response)) as MerchantResponse;
    const terms = body.data?.presigned_acceptance;
    const personalData = body.data?.presigned_personal_data_auth;

    if (
      !response.ok ||
      !terms?.acceptance_token ||
      !terms.permalink ||
      !personalData?.acceptance_token ||
      !personalData.permalink
    ) {
      throw new BadGatewayException(
        'No fue posible obtener los contratos de aceptación.',
      );
    }

    return {
      acceptanceToken: terms.acceptance_token,
      personalDataToken: personalData.acceptance_token,
      termsUrl: terms.permalink,
      personalDataUrl: personalData.permalink,
    };
  }

  async createTransaction(
    input: CreateGatewayTransaction,
  ): Promise<GatewayTransaction> {
    const response = await fetch(`${this.baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.required('PAYMENT_PRIVATE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        acceptance_token: input.acceptanceToken,
        accept_personal_auth: input.personalDataToken,
        amount_in_cents: input.amountInCents,
        currency: 'COP',
        customer_email: input.customerEmail,
        payment_method: {
          type: 'CARD',
          token: input.paymentToken,
          installments: input.installments,
        },
        payment_method_type: 'CARD',
        reference: input.reference,
        signature: input.signature,
        ...(input.customerIp ? { ip: input.customerIp } : {}),
      }),
    });

    return this.readTransaction(response);
  }

  async getTokenizationKey(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/tokens/keys/tokenization`, {
      headers: {
        Authorization: `Bearer ${this.required('PAYMENT_PUBLIC_KEY')}`,
      },
    });
    const body = (await this.safeJson(response)) as TokenizationKeyResponse;
    const publicKey = body.data?.publicKey;
    if (!response.ok || !publicKey) {
      throw new BadGatewayException(
        'No fue posible obtener la llave de tokenización.',
      );
    }
    return publicKey;
  }

  async tokenizeEncryptedCard(payload: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/tokens/cards`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.required('PAYMENT_PUBLIC_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload }),
    });
    const body = (await this.safeJson(response)) as TokenizationResponse;
    const token = body.data?.id;
    if (!response.ok || body.status !== 'CREATED' || !token) {
      throw new BadGatewayException('La tarjeta no pudo ser tokenizada.');
    }
    return token;
  }

  async getTransaction(id: string): Promise<GatewayTransaction> {
    const response = await fetch(
      `${this.baseUrl}/transactions/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${this.required('PAYMENT_PUBLIC_KEY')}`,
        },
      },
    );
    return this.readTransaction(response);
  }

  private get baseUrl(): string {
    return this.required('PAYMENT_API_URL').replace(/\/$/, '');
  }

  private required(name: string): string {
    const value = this.config.get<string>(name);
    if (!value) {
      throw new BadGatewayException('Configuración de pagos incompleta.');
    }
    return value;
  }

  private async readTransaction(
    response: Response,
  ): Promise<GatewayTransaction> {
    const body = (await this.safeJson(response)) as TransactionResponse;
    const id = body.data?.id;
    const status = body.data?.status;

    if (
      !response.ok ||
      !id ||
      !status ||
      !PAYMENT_STATUSES.has(status as PaymentStatus)
    ) {
      this.logger.warn(
        JSON.stringify({
          event: 'payment_gateway_transaction_rejected',
          httpStatus: response.status,
          errorType: body?.error?.type ?? 'UNKNOWN',
          reason: body?.error?.reason ?? 'UNKNOWN',
          invalidFields: Object.keys(body?.error?.messages ?? {}),
        }),
      );
      throw new BadGatewayException(
        'La pasarela no pudo procesar la transacción.',
      );
    }

    return { id, status: status as PaymentStatus };
  }

  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
