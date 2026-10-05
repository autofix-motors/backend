import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsDateOnly } from '../../../../core/validation/date-only.js';

/** El kilometraje más alto que se acepta: siete cifras. */
export const MAX_MILEAGE = 9_999_999;

export class CreateWorkOrderDto {
  @ApiProperty({ format: 'uuid', description: 'El vehículo que ingresa' })
  @IsUUID('4', { message: 'Selecciona el vehículo' })
  vehicleId: string;

  @ApiProperty({ example: 84500, minimum: 0, maximum: MAX_MILEAGE })
  @Max(MAX_MILEAGE, { message: 'El kilometraje es como máximo 9 999 999' })
  @Min(0, { message: 'El kilometraje no puede ser negativo' })
  // class-validator evalúa de abajo hacia arriba y se detiene en el primer
  // error: el chequeo más básico va al final.
  @IsInt({ message: 'El kilometraje es un número entero de km' })
  mileageIn: number;

  @ApiProperty({
    example: 'Ruido al frenar y vibración en el timón',
    maxLength: 2000,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(2000, { message: 'El motivo tiene como máximo 2000 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el motivo del ingreso' })
  @IsString({ message: 'Ingresa el motivo del ingreso' })
  reason: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    example: '2026-10-08',
    description:
      'Cuándo se le prometió al cliente (AAAA-MM-DD). No puede ser anterior a hoy en Lima',
  })
  @IsOptional()
  @IsDateOnly('La fecha prometida')
  promisedDate?: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'El mecánico asignado; vacío si todavía no se asigna',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El mecánico no es válido' })
  mechanicId?: string | null;
}
