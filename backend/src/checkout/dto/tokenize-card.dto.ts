import { IsString, MaxLength, MinLength } from 'class-validator';

/** Tarjeta cifrada en formato JWE compacto, generada en el navegador. */
export class TokenizeCardDto {
  @IsString()
  @MinLength(100)
  @MaxLength(10_000)
  payload!: string;
}
