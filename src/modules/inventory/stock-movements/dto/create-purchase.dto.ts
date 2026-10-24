import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsMoney, ToMoneyText } from '../../../../core/validation/money.js';
import {
  IsMovementQuantity,
  ToQuantityText,
} from '../../../../core/validation/quantity.js';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';

/** El largo máximo de la nota de un movimiento. La columna no tiene tope. */
export const MOVEMENT_NOTE_MAX_LENGTH = 500;

/**
 * Una compra: entra mercadería y su costo pasa a ser el costo del producto.
 * La cantidad va en positivo, en la unidad del producto; el signo lo pone el
 * tipo de movimiento.
 */
export class CreatePurchaseDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Selecciona el producto' })
  productId: string;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: '12' },
      { type: 'number', example: 12 },
    ],
    description:
      'Lo que entra, en la unidad del producto: mayor que 0, con hasta 2 decimales',
  })
  @ToQuantityText()
  @IsMovementQuantity('La cantidad', { signed: false })
  @IsNotEmpty({ message: 'Ingresa la cantidad' })
  quantity: string;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: '18.50' },
      { type: 'number', example: 18.5 },
    ],
    description:
      'Costo unitario de la compra, en soles. Pasa a ser el costo del producto',
  })
  @ToMoneyText()
  @IsMoney('El costo unitario')
  @IsNotEmpty({ message: 'Ingresa el costo unitario' })
  unitCost: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: MOVEMENT_NOTE_MAX_LENGTH,
    example: 'Distribuidora Autopartes Lima, factura F001-004512',
    description: 'El proveedor, el número de factura…',
  })
  @IsOptional()
  @TrimToNull()
  @MaxLength(MOVEMENT_NOTE_MAX_LENGTH, {
    message: `La nota tiene como máximo ${MOVEMENT_NOTE_MAX_LENGTH} caracteres`,
  })
  @IsString({ message: 'La nota tiene que ser texto' })
  note?: string | null;
}
