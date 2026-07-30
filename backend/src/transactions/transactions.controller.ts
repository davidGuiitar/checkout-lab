import {
  BadRequestException,
  Controller,
  Get,
  Param,
  PipeTransform,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CheckoutResult, CheckoutService } from '../checkout/checkout.service';

export class ParseCheckoutReferencePipe implements PipeTransform<
  string,
  string
> {
  transform(value: string): string {
    if (
      !/^CHK-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException('Referencia inválida.');
    }
    return value;
  }
}

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get(':reference')
  @ApiOperation({ summary: 'Recupera y sincroniza una transacción.' })
  @ApiOkResponse({ description: 'Estado seguro de la transacción.' })
  getByReference(
    @Param('reference', new ParseCheckoutReferencePipe())
    reference: string,
  ): Promise<CheckoutResult> {
    return this.checkoutService.getByReference(reference);
  }
}
