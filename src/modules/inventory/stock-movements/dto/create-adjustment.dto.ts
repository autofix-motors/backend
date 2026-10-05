import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  IsMovementQuantity,
  ToQuantityText,
} from '../../../../core/validation/quantity.js';
import { MOVEMENT_NOTE_MAX_LENGTH } from './create-purchase.dto.js';

/**
 * Un ajuste: el stock del sistema no cuadra con lo que hay en el almacén
 * (inventario físico, merma, un error al registrar). Es también la única forma
 * de corregir un movimiento, que no se edita ni se borra. Por eso el motivo es
 * obligatorio: un ajuste sin explicación es un número que cambió sin rastro.
 */
export class CreateAdjustmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'Selecciona el producto' })
  productId: string;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: '-2' },
      { type: 'number', example: -2 },
    ],
    description:
      'Con signo, en la unidad del producto: positiva suma al stock y negativa resta. Distinta de 0, con hasta 2 decimales',
  })
  @ToQuantityText()
  @IsMovementQuantity('La cantidad', { signed: true })
  @IsNotEmpty({ message: 'Ingresa la cantidad' })
  quantity: string;

  @ApiProperty({
    maxLength: MOVEMENT_NOTE_MAX_LENGTH,
    example: 'Inventario físico de fin de mes',
    description: 'El motivo del ajuste: inventario físico, merma, corrección…',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(MOVEMENT_NOTE_MAX_LENGTH, {
    message: `El motivo tiene como máximo ${MOVEMENT_NOTE_MAX_LENGTH} caracteres`,
  })
  @IsNotEmpty({ message: 'Ingresa el motivo del ajuste' })
  @IsString({ message: 'Ingresa el motivo del ajuste' })
  note: string;
}
