import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';

/**
 * Enviar el presupuesto. Los ítems y el total no viajan: se toman de la orden
 * en el momento de enviarlo, que es justamente lo que se congela.
 */
export class CreateQuoteDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
    example:
      'Incluye el cambio de la bomba de agua; el termostato va de regalo',
    description:
      'Para el cliente: va en la línea de tiempo pública, junto al total',
  })
  @IsOptional()
  @TrimToNull()
  @MaxLength(2000, { message: 'La nota tiene como máximo 2000 caracteres' })
  @IsString({ message: 'La nota tiene que ser texto' })
  note?: string | null;
}
