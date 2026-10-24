import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsMoney, ToMoneyText } from '../../../../core/validation/money.js';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';

export class CreateServiceCatalogItemDto {
  @ApiProperty({ example: 'Cambio de aceite y filtro', maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(120, { message: 'El nombre tiene como máximo 120 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el nombre del servicio' })
  // class-validator evalúa de abajo hacia arriba y se detiene en el primer
  // error: el chequeo más básico va al final.
  @IsString({ message: 'Ingresa el nombre del servicio' })
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @TrimToNull()
  @MaxLength(1000, {
    message: 'La descripción tiene como máximo 1000 caracteres',
  })
  @IsString({ message: 'La descripción tiene que ser texto' })
  description?: string | null;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: '120.00' },
      { type: 'number', example: 120 },
    ],
    description:
      'Precio de mano de obra referencial, en soles: de 0 a 99999999.99, con hasta 2 decimales',
  })
  // Sale del DTO como texto («120.5»), que Prisma guarda en el Decimal sin
  // pasar por un número.
  @ToMoneyText()
  @IsMoney('El precio de mano de obra')
  @IsNotEmpty({ message: 'Ingresa el precio de mano de obra' })
  laborPrice: string;

  @ApiPropertyOptional({ default: true })
  // Opcional pero no anulable: con @IsOptional un `null` pasaría sin validar y
  // la base lo rechazaría con un 500 (la columna no admite vacío).
  @ValidateIf(
    (_dto: CreateServiceCatalogItemDto, value: unknown) => value !== undefined,
  )
  @IsBoolean({ message: 'El estado tiene que ser verdadero o falso' })
  isActive?: boolean;
}
