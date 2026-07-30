import { CheckoutConfigService } from './checkout-config.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

describe('CheckoutController', () => {
  const getPublicConfig = jest.fn();
  const tokenize = jest.fn();
  const create = jest.fn();
  const controller = new CheckoutController(
    { getPublicConfig, tokenize } as unknown as CheckoutConfigService,
    { create } as unknown as CheckoutService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('delegates public configuration and encrypted tokenization', async () => {
    getPublicConfig.mockResolvedValue({ baseFee: 2_000 });
    tokenize.mockResolvedValue({ token: 'tok_test_safe' });

    await expect(controller.getConfig()).resolves.toEqual({ baseFee: 2_000 });
    await expect(
      controller.tokenize({ payload: 'encrypted' }),
    ).resolves.toEqual({ token: 'tok_test_safe' });
    expect(tokenize).toHaveBeenCalledWith('encrypted');
  });

  it('delegates checkout creation with the client IP', async () => {
    const dto = {
      productId: 'f91a45dc-b838-4d0f-81bb-f1db46ca48fa',
    } as CreateCheckoutDto;
    create.mockResolvedValue({ reference: 'CHK-reference' });

    await expect(controller.create(dto, '127.0.0.1')).resolves.toEqual({
      reference: 'CHK-reference',
    });
    expect(create).toHaveBeenCalledWith(dto, '127.0.0.1');
  });
});
