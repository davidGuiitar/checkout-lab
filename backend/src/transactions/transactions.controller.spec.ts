import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from '../checkout/checkout.service';
import {
  ParseCheckoutReferencePipe,
  TransactionsController,
} from './transactions.controller';

describe('TransactionsController', () => {
  it('delegates transaction recovery by reference', async () => {
    const getByReference = jest.fn().mockResolvedValue({
      reference: 'CHK-9fe5923f-7fef-4a5c-99fc-20db7464c774',
      status: 'APPROVED',
    });
    const controller = new TransactionsController({
      getByReference,
    } as unknown as CheckoutService);

    await expect(
      controller.getByReference('CHK-9fe5923f-7fef-4a5c-99fc-20db7464c774'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('accepts only checkout UUID references', () => {
    const pipe = new ParseCheckoutReferencePipe();
    const reference = 'CHK-9fe5923f-7fef-4a5c-99fc-20db7464c774';

    expect(pipe.transform(reference)).toBe(reference);
    expect(() => pipe.transform('invalid-reference')).toThrow(
      BadRequestException,
    );
  });
});
