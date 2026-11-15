import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsMoney, ToMoneyText } from '../../../../core/validation/money.js';
import {
  IsMovementQuantity,
  ToQuantityText,
} from '../../../../core/validation/quantity.js';
import { TipoDetalle } from '../../../../generated/prisma/enums.js';

/** Lo que mide la columna `descripcion` del detalle. */
export const ITEM_DESCRIPTION_MAX_LENGTH = 200;

/**
 * Un servicio o un repuesto que se agrega a la orden. Según `tipo` se elige
 * del catálogo (`servicioId`) o del inventario (`productoId`); que no
 * lleve los dos lo valida el service. La descripción y el precio se copian del
 * original: el administrador puede mandar los suyos, el mecánico no.
 */
export class CreateWorkOrderItemDto {
  @ApiProperty({ enum: TipoDetalle, enumName: 'TipoDetalle' })
  @IsEnum(TipoDetalle, { message: 'El tipo de detalle es SERVICIO o PRODUCTO' })
  tipo: TipoDetalle;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Obligatorio si tipo es SERVICIO',
  })
  @ValidateIf(
    (dto: CreateWorkOrderItemDto) => dto.tipo === TipoDetalle.SERVICIO,
  )
  @IsUUID('4', { message: 'Selecciona el servicio' })
  servicioId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Obligatorio si tipo es PRODUCTO',
  })
  @ValidateIf(
    (dto: CreateWorkOrderItemDto) => dto.tipo === TipoDetalle.PRODUCTO,
  )
  @IsUUID('4', { message: 'Selecciona el repuesto' })
  productoId?: string;

  @ApiPropertyOptional({
    oneOf: [
      { type: 'string', example: '1' },
      { type: 'number', example: 1 },
    ],
    // Sin `default` en Swagger: openapi-typescript haría obligatoria la clave.
    description:
      'Mayor que 0, con hasta 2 decimales; por omisión, 1. En la unidad del repuesto; en un servicio, cuántas veces se hace',
  })
  // La misma regla que la cantidad de una compra (mayor que 0, hasta dos
  // decimales): la de un repuesto es justamente la salida de stock.
  // Opcional pero no anulable: un `null` se valida y es un 400.
  @ValidateIf((_dto: unknown, value: unknown) => value !== undefined)
  @ToQuantityText()
  @IsMovementQuantity('La cantidad', { signed: false })
  cantidad?: string;

  @ApiPropertyOptional({
    oneOf: [
      { type: 'string', example: '35.00' },
      { type: 'number', example: 35 },
    ],
    description:
      'Solo ADMINISTRADOR. Precio unitario en soles; sin él, se copia el del catálogo o el del repuesto',
  })
  @ValidateIf((_dto: unknown, value: unknown) => value !== undefined)
  @ToMoneyText()
  @IsMoney('El precio unitario')
  precioUnitario?: string;

  @ApiPropertyOptional({
    maxLength: ITEM_DESCRIPTION_MAX_LENGTH,
    description:
      'Solo ADMINISTRADOR. Sin ella, se copia el nombre del servicio o «código · nombre» del repuesto',
  })
  @ValidateIf((_dto: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(ITEM_DESCRIPTION_MAX_LENGTH, {
    message: `La descripción tiene como máximo ${ITEM_DESCRIPTION_MAX_LENGTH} caracteres`,
  })
  @IsNotEmpty({ message: 'Escribe la descripción del detalle' })
  @IsString({ message: 'Escribe la descripción del detalle' })
  descripcion?: string;
}
