import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
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

/** Un producto del carrito con su cantidad. */
export class CheckoutItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

/** Datos de contacto del comprador. */
export class CustomerDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  fullName!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  // Solo dígitos (7 a 15), con "+" opcional al inicio.
  @Matches(/^\+?[0-9]{7,15}$/)
  phone!: string;
}

/** Dirección y destinatario del envío. */
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

/**
 * Cuerpo de POST /checkout. Acepta dos formatos de productos (no ambos):
 * - `items`: carrito con varios productos (formato actual).
 * - `productId` + `quantity`: un solo producto (formato heredado).
 */
export class CreateCheckoutDto {
  // --- Formato heredado (un solo producto) ---
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;

  // --- Formato carrito: hasta 20 productos distintos, sin repetir ---
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique((item: CheckoutItemDto) => item.productId)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items?: CheckoutItemDto[];

  @ValidateNested()
  @Type(() => CustomerDto)
  customer!: CustomerDto;

  @ValidateNested()
  @Type(() => DeliveryDto)
  delivery!: DeliveryDto;

  // Token devuelto por /checkout/tokenize (nunca datos de tarjeta).
  @IsString()
  @Matches(/^tok_[A-Za-z0-9_-]+$/)
  @MaxLength(255)
  paymentToken!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  installments!: number;

  // Ambos contratos deben aceptarse explícitamente.
  @Equals(true)
  acceptedTerms!: boolean;

  @Equals(true)
  acceptedPersonalData!: boolean;
}
