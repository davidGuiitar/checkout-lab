import { BadGatewayException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpPaymentGateway } from './http-payment.gateway';

describe('HttpPaymentGateway', () => {
  const values: Record<string, string> = {
    PAYMENT_API_URL: 'https://payments.example/v1',
    PAYMENT_PUBLIC_KEY: 'pub_example',
    PAYMENT_PRIVATE_KEY: 'priv_example',
  };
  const config = {
    get: jest.fn((name: string) => values[name]),
  } as unknown as ConfigService;
  const fetchMock = jest.fn<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >();

  const response = (
    body: unknown,
    ok = true,
    status = ok ? 200 : 422,
  ): Response =>
    ({
      ok,
      status,
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as Response;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as typeof fetch;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('obtains contract tokens while returning only the required fields', async () => {
    fetchMock.mockResolvedValue(
      response({
        data: {
          presigned_acceptance: {
            acceptance_token: 'acceptance',
            permalink: 'https://contracts.example/terms',
          },
          presigned_personal_data_auth: {
            acceptance_token: 'personal',
            permalink: 'https://contracts.example/privacy',
          },
        },
      }),
    );

    await expect(
      new HttpPaymentGateway(config).getMerchantContracts(),
    ).resolves.toEqual({
      acceptanceToken: 'acceptance',
      personalDataToken: 'personal',
      termsUrl: 'https://contracts.example/terms',
      personalDataUrl: 'https://contracts.example/privacy',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://payments.example/v1/merchants/pub_example',
    );
  });

  it('rejects incomplete contracts and missing configuration', async () => {
    fetchMock.mockResolvedValue(response({ data: {} }));
    await expect(
      new HttpPaymentGateway(config).getMerchantContracts(),
    ).rejects.toThrow(BadGatewayException);

    const incompleteConfig = {
      get: jest.fn(),
    } as unknown as ConfigService;
    await expect(
      new HttpPaymentGateway(incompleteConfig).getTokenizationKey(),
    ).rejects.toThrow('Configuración de pagos incompleta.');
  });

  it('obtains the public encryption key and tokenizes a JWE', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ data: { publicKey: '-----BEGIN PUBLIC KEY-----' } }),
      )
      .mockResolvedValueOnce(
        response({ status: 'CREATED', data: { id: 'tok_test_safe' } }),
      );
    const gateway = new HttpPaymentGateway(config);

    await expect(gateway.getTokenizationKey()).resolves.toContain('PUBLIC KEY');
    await expect(
      gateway.tokenizeEncryptedCard('encrypted-payload'),
    ).resolves.toBe('tok_test_safe');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ payload: 'encrypted-payload' }),
    });
  });

  it('rejects invalid tokenization responses', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ data: {} }, false, 503))
      .mockResolvedValueOnce(response({ status: 'ERROR', data: {} }, false));
    const gateway = new HttpPaymentGateway(config);

    await expect(gateway.getTokenizationKey()).rejects.toThrow(
      'No fue posible obtener la llave de tokenización.',
    );
    await expect(
      gateway.tokenizeEncryptedCard('encrypted-payload'),
    ).rejects.toThrow('La tarjeta no pudo ser tokenizada.');
  });

  it('creates a card transaction with private authentication', async () => {
    fetchMock.mockResolvedValue(
      response({ data: { id: 'provider-id', status: 'PENDING' } }, true, 201),
    );
    const gateway = new HttpPaymentGateway(config);

    await expect(
      gateway.createTransaction({
        reference: 'CHK-reference',
        amountInCents: 13_990_000,
        customerEmail: 'buyer@example.com',
        paymentToken: 'tok_test_safe',
        installments: 1,
        signature: 'signature',
        acceptanceToken: 'acceptance',
        personalDataToken: 'personal',
        customerIp: '127.0.0.1',
      }),
    ).resolves.toEqual({ id: 'provider-id', status: 'PENDING' });

    const options = fetchMock.mock.calls[0]?.[1];
    if (!options) throw new Error('Missing transaction request options');
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer priv_example',
    });
    expect(typeof options.body).toBe('string');
    const requestBody: unknown = JSON.parse(
      typeof options.body === 'string' ? options.body : '{}',
    );
    expect(requestBody).toMatchObject({
      amount_in_cents: 13_990_000,
      payment_method: {
        type: 'CARD',
        token: 'tok_test_safe',
        installments: 1,
      },
      ip: '127.0.0.1',
    });
  });

  it('reads final status and logs only safe rejection metadata', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    fetchMock
      .mockResolvedValueOnce(
        response({ data: { id: 'provider-id', status: 'APPROVED' } }),
      )
      .mockResolvedValueOnce(
        response(
          {
            error: {
              type: 'INPUT_VALIDATION_ERROR',
              messages: { amount: ['invalid'] },
            },
          },
          false,
        ),
      );
    const gateway = new HttpPaymentGateway(config);

    await expect(gateway.getTransaction('provider-id')).resolves.toEqual({
      id: 'provider-id',
      status: 'APPROVED',
    });
    await expect(gateway.getTransaction('invalid-id')).rejects.toThrow(
      'La pasarela no pudo procesar la transacción.',
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"invalidFields":["amount"]'),
    );
  });

  it('handles a non-JSON transaction response safely', async () => {
    const invalidJsonResponse = response(null, false, 502);
    jest
      .spyOn(invalidJsonResponse, 'json')
      .mockRejectedValue(new Error('invalid json'));
    fetchMock.mockResolvedValue(invalidJsonResponse);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await expect(
      new HttpPaymentGateway(config).getTransaction('provider-id'),
    ).rejects.toThrow(BadGatewayException);
  });
});
