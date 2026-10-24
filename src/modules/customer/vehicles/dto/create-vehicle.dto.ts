import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';
import {
  MIN_VEHICLE_YEAR,
  PLATE_MESSAGE,
  PLATE_PATTERN,
  VIN_MESSAGE,
  VIN_PATTERN,
  maxVehicleYear,
  normalizeIdentifier,
} from '../vehicle-identifiers.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const normalize = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? normalizeIdentifier(value) : value;

// `@Max` fija el tope al cargar la clase; este lo calcula en cada validación.
@ValidatorConstraint({ name: 'vehicleYearInRange' })
class VehicleYearInRange implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'number' &&
      value >= MIN_VEHICLE_YEAR &&
      value <= maxVehicleYear()
    );
  }

  defaultMessage(): string {
    return `El año va de ${MIN_VEHICLE_YEAR} a ${maxVehicleYear()}`;
  }
}

export class CreateVehicleDto {
  @ApiProperty({ format: 'uuid', description: 'El dueño actual' })
  @IsUUID('4', { message: 'Selecciona el cliente' })
  customerId: string;

  @ApiProperty({
    example: 'ABC123',
    maxLength: 7,
    description: 'Se guarda en mayúsculas y sin espacios ni guiones',
  })
  @Transform(normalize)
  @Matches(PLATE_PATTERN, { message: PLATE_MESSAGE })
  @IsNotEmpty({ message: 'Ingresa la placa' })
  // class-validator evalúa de abajo hacia arriba y se detiene en el primer
  // error: el chequeo más básico va al final.
  @IsString({ message: 'Ingresa la placa' })
  plate: string;

  @ApiProperty({ example: 'Toyota', maxLength: 60 })
  @Transform(trim)
  @MaxLength(60, { message: 'La marca tiene como máximo 60 caracteres' })
  @IsNotEmpty({ message: 'Ingresa la marca' })
  @IsString({ message: 'Ingresa la marca' })
  brand: string;

  @ApiProperty({ example: 'Yaris', maxLength: 60 })
  @Transform(trim)
  @MaxLength(60, { message: 'El modelo tiene como máximo 60 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el modelo' })
  @IsString({ message: 'Ingresa el modelo' })
  model: string;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: 2019,
    minimum: MIN_VEHICLE_YEAR,
    description: 'Hasta el año actual + 1',
  })
  @IsOptional()
  @Validate(VehicleYearInRange)
  @IsInt({ message: 'El año tiene que ser un número entero' })
  year?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Gris plata',
    maxLength: 40,
  })
  @IsOptional()
  @TrimToNull()
  @MaxLength(40, { message: 'El color tiene como máximo 40 caracteres' })
  @IsString({ message: 'El color tiene que ser texto' })
  color?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'JTDBT923771234567',
    description:
      'Número de serie del fabricante. Se guarda en mayúsculas y sin espacios',
  })
  @IsOptional()
  // Vacío es «sin VIN» (null); si trae algo, se normaliza como la placa.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeIdentifier(value) || null : value,
  )
  @Matches(VIN_PATTERN, { message: VIN_MESSAGE })
  @IsString({ message: 'El VIN tiene que ser texto' })
  vin?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @TrimToNull()
  @MaxLength(1000, { message: 'Las notas tienen como máximo 1000 caracteres' })
  @IsString({ message: 'Las notas tienen que ser texto' })
  notes?: string | null;
}
