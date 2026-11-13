import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateGatewayTransaction,
  GatewayTransaction,
  MerchantContracts,
  PaymentGateway,
  PaymentStatus,
} from '../domain/payment-gateway.port';

// Formas (parciales) de las respuestas JSON de la pasarela. Todo es opcional
// porque la respuesta se valida antes de usarse.

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

/** Estados reconocidos; cualquier otro valor se trata como respuesta inválida. */
const PAYMENT_STATUSES = new Set<PaymentStatus>([
  'PENDING',
  'APPROVED',
  'DECLINED',
  'VOIDED',
  'ERROR',
]);

/**
 * Implementación del puerto PaymentGateway sobre la API HTTP de la pasarela.
 * Usa la llave pública para operaciones del lado cliente y la privada solo
 * para crear cobros.
 */
@Injectable()
export class HttpPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(HttpPaymentGateway.name);

  constructor(private readonly config: ConfigService) {}

  /** Obtiene los tokens y enlaces de los contratos de aceptación del comercio. */
  async getMerchantContracts(): Promise<MerchantContracts> {
    const publicKey = this.required('PAYMENT_PUBLIC_KEY');
    const response = await fetch(
      `${this.baseUrl}/merchants/${encodeURIComponent(publicKey)}`,
    );
    const body = ((await this.safeJson(response)) ?? {}) as MerchantResponse;
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

  /** Crea un cobro con tarjeta tokenizada (requiere la llave privada). */
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
        // La IP del cliente es opcional; solo se envía si se conoce.
        ...(input.customerIp ? { ip: input.customerIp } : {}),
      }),
    });

    return this.readTransaction(response);
  }

  /** Obtiene la llave pública RSA con la que el navegador cifra la tarjeta. */
  async getTokenizationKey(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/tokens/keys/tokenization`, {
      headers: {
        Authorization: `Bearer ${this.required('PAYMENT_PUBLIC_KEY')}`,
      },
    });
    const body = ((await this.safeJson(response)) ??
      {}) as TokenizationKeyResponse;
    const publicKey = body.data?.publicKey;
    if (!response.ok || !publicKey) {
      throw new BadGatewayException(
        'No fue posible obtener la llave de tokenización.',
      );
    }
    return publicKey;
  }

  /** Intercambia la tarjeta cifrada (JWE) por un token de un solo uso. */
  async tokenizeEncryptedCard(payload: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/tokens/cards`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.required('PAYMENT_PUBLIC_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ payload }),
    });
    const body = ((await this.safeJson(response)) ??
      {}) as TokenizationResponse;
    const token = body.data?.id;
    if (!response.ok || body.status !== 'CREATED' || !token) {
      throw new BadGatewayException('La tarjeta no pudo ser tokenizada.');
    }
    return token;
  }

  /** Consulta el estado actual de una transacción en la pasarela. */
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

  /** URL base de la pasarela, sin barra final. */
  private get baseUrl(): string {
    return this.required('PAYMENT_API_URL').replace(/\/$/, '');
  }

  /** Lee una variable de entorno obligatoria o falla con 502. */
  private required(name: string): string {
    const value = this.config.get<string>(name);
    if (!value) {
      throw new BadGatewayException('Configuración de pagos incompleta.');
    }
    return value;
  }

  /** Valida la respuesta de una transacción y extrae id y estado. */
  private async readTransaction(
    response: Response,
  ): Promise<GatewayTransaction> {
    const body = ((await this.safeJson(response)) ?? {}) as TransactionResponse;
    const id = body.data?.id;
    const status = body.data?.status;

    if (
      !response.ok ||
      !id ||
      !status ||
      !PAYMENT_STATUSES.has(status as PaymentStatus)
    ) {
      // Log estructurado sin datos sensibles (solo tipo de error y campos).
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

  /** Parsea el cuerpo como JSON; devuelve null si no es JSON válido. */
  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
