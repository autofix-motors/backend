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
import { ItemType } from '../../../../generated/prisma/enums.js';

/** Lo que mide la columna `description` del ítem. */
export const ITEM_DESCRIPTION_MAX_LENGTH = 200;

/**
 * Un servicio o un repuesto que se agrega a la orden. Según `type` se elige
 * del catálogo (`serviceCatalogItemId`) o del inventario (`productId`); que no
 * lleve los dos lo valida el service. La descripción y el precio se copian del
 * original: el administrador puede mandar los suyos, el mecánico no.
 */
export class CreateWorkOrderItemDto {
  @ApiProperty({ enum: ItemType, enumName: 'ItemType' })
  @IsEnum(ItemType, { message: 'El tipo de ítem es SERVICE o PRODUCT' })
  type: ItemType;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Obligatorio si type es SERVICE',
  })
  @ValidateIf((dto: CreateWorkOrderItemDto) => dto.type === ItemType.SERVICE)
  @IsUUID('4', { message: 'Selecciona el servicio' })
  serviceCatalogItemId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Obligatorio si type es PRODUCT',
  })
  @ValidateIf((dto: CreateWorkOrderItemDto) => dto.type === ItemType.PRODUCT)
  @IsUUID('4', { message: 'Selecciona el repuesto' })
  productId?: string;

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
  quantity?: string;

  @ApiPropertyOptional({
    oneOf: [
      { type: 'string', example: '35.00' },
      { type: 'number', example: 35 },
    ],
    description:
      'Solo ADMIN. Precio unitario en soles; sin él, se copia el del catálogo o el del repuesto',
  })
  @ValidateIf((_dto: unknown, value: unknown) => value !== undefined)
  @ToMoneyText()
  @IsMoney('El precio unitario')
  unitPrice?: string;

  @ApiPropertyOptional({
    maxLength: ITEM_DESCRIPTION_MAX_LENGTH,
    description:
      'Solo ADMIN. Sin ella, se copia el nombre del servicio o «código · nombre» del repuesto',
  })
  @ValidateIf((_dto: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(ITEM_DESCRIPTION_MAX_LENGTH, {
    message: `La descripción tiene como máximo ${ITEM_DESCRIPTION_MAX_LENGTH} caracteres`,
  })
  @IsNotEmpty({ message: 'Escribe la descripción del ítem' })
  @IsString({ message: 'Escribe la descripción del ítem' })
  description?: string;
}
