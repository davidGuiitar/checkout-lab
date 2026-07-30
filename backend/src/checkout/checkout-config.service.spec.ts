import {
  BASE_FEE,
  CheckoutConfigService,
  DELIVERY_FEE,
} from './checkout-config.service';

describe('CheckoutConfigService', () => {
  afterEach(() => delete process.env.PAYMENT_PUBLIC_KEY);

  it('exposes the fixed fees and no private data', () => {
    const service = new CheckoutConfigService();

    expect(service.getPublicConfig()).toEqual({
      baseFee: BASE_FEE,
      deliveryFee: DELIVERY_FEE,
      paymentPublicKey: null,
    });
  });

  it('exposes only the configured public key', () => {
    process.env.PAYMENT_PUBLIC_KEY = 'pub_test_example';

    expect(new CheckoutConfigService().getPublicConfig().paymentPublicKey).toBe(
      'pub_test_example',
    );
  });
});
