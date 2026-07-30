import { Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CustomerDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  fullName!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @Matches(/^\+?[0-9]{7,15}$/)
  phone!: string;
}

export class DeliveryDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  recipientName!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(180)
  address!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  city!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  department!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  notes?: string;
}

export class CreateCheckoutDto {
  @IsUUID()
  productId!: string;

  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto;

  @ValidateNested()
  @Type(() => DeliveryDto)
  delivery!: DeliveryDto;

  @IsString()
  @Matches(/^tok_[A-Za-z0-9_-]+$/)
  @MaxLength(255)
  paymentToken!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  installments!: number;

  @Equals(true)
  acceptedTerms!: boolean;

  @Equals(true)
  acceptedPersonalData!: boolean;
}
