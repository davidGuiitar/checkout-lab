import { IsString, MaxLength, MinLength } from 'class-validator';

export class TokenizeCardDto {
  @IsString()
  @MinLength(100)
  @MaxLength(10_000)
  payload!: string;
}
