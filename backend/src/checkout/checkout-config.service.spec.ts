import {
  BASE_FEE,
  CheckoutConfigService,
  DELIVERY_FEE,
} from './checkout-config.service';
import { PaymentGateway } from './domain/payment-gateway.port';

describe('CheckoutConfigService', () => {
  const getMerchantContracts = jest.fn();
  const getTokenizationKey = jest.fn();
  const tokenizeEncryptedCard = jest.fn();
  const gateway = {
    getMerchantContracts,
    getTokenizationKey,
    tokenizeEncryptedCard,
  } as unknown as PaymentGateway;

  afterEach(() => {
    delete process.env.PAYMENT_PUBLIC_KEY;
    delete process.env.PAYMENT_API_URL;
    jest.clearAllMocks();
  });

  it('exposes the fixed fees and no private data', async () => {
    const service = new CheckoutConfigService(gateway);

    await expect(service.getPublicConfig()).resolves.toEqual({
      baseFee: BASE_FEE,
      deliveryFee: DELIVERY_FEE,
      paymentPublicKey: null,
      paymentApiUrl: null,
      tokenizationKey: null,
      contracts: null,
    });
  });

  it('exposes public tokenization data and contract links', async () => {
    process.env.PAYMENT_PUBLIC_KEY = 'pub_test_example';
    process.env.PAYMENT_API_URL = 'https://sandbox.example';
    getMerchantContracts.mockResolvedValue({
      acceptanceToken: 'not-public',
      personalDataToken: 'not-public-either',
      termsUrl: 'https://contracts.example/terms',
      personalDataUrl: 'https://contracts.example/privacy',
    });
    getTokenizationKey.mockResolvedValue('public-encryption-key');

    await expect(
      new CheckoutConfigService(gateway).getPublicConfig(),
    ).resolves.toEqual({
      baseFee: BASE_FEE,
      deliveryFee: DELIVERY_FEE,
      paymentPublicKey: 'pub_test_example',
      paymentApiUrl: 'https://sandbox.example',
      tokenizationKey: 'public-encryption-key',
      contracts: {
        termsUrl: 'https://contracts.example/terms',
        personalDataUrl: 'https://contracts.example/privacy',
      },
    });
  });

  it('returns only the ephemeral token for an encrypted payload', async () => {
    tokenizeEncryptedCard.mockResolvedValue('tok_test_safe');

    await expect(
      new CheckoutConfigService(gateway).tokenize('encrypted-jwe'),
    ).resolves.toEqual({ token: 'tok_test_safe' });
  });
});
