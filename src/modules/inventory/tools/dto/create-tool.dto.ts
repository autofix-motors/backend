import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';
import { ToolStatus } from '../../../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * El alta de una herramienta. Puede nacer ya asignada a alguien; si no, queda
 * en el almacén. Solo una herramienta operativa se asigna: con otro estado, el
 * service rechaza la asignación (ver `ToolsService`).
 */
export class CreateToolDto {
  @ApiProperty({
    example: 'HER-TORQ-01',
    maxLength: 30,
    description:
      'Único. Se guarda en mayúsculas y sin espacios al inicio o al final',
  })
  // En mayúsculas: «her-01» y «HER-01» son la misma etiqueta pegada en la
  // herramienta, y así el índice único de la base los trata como uno solo.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @MaxLength(30, { message: 'El código tiene como máximo 30 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el código' })
  // class-validator evalúa de abajo hacia arriba y se detiene en el primer
  // error: el chequeo más básico va al final.
  @IsString({ message: 'Ingresa el código' })
  code: string;

  @ApiProperty({ example: 'Torquímetro de 1/2" 40-200 N·m', maxLength: 150 })
  @Transform(trim)
  @MaxLength(150, { message: 'El nombre tiene como máximo 150 caracteres' })
  @IsNotEmpty({ message: 'Ingresa el nombre de la herramienta' })
  @IsString({ message: 'Ingresa el nombre de la herramienta' })
  name: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Stanley',
    maxLength: 60,
  })
  @IsOptional()
  @TrimToNull()
  @MaxLength(60, { message: 'La marca tiene como máximo 60 caracteres' })
  @IsString({ message: 'La marca tiene que ser texto' })
  brand?: string | null;

  @ApiPropertyOptional({
    enum: ToolStatus,
    enumName: 'ToolStatus',
    default: ToolStatus.AVAILABLE,
  })
  // Opcional pero no anulable: con @IsOptional un `null` pasaría sin validar y
  // la base lo rechazaría con un 500 (la columna no admite vacío).
  @ValidateIf((_dto: CreateToolDto, value: unknown) => value !== undefined)
  @IsEnum(ToolStatus, {
    message:
      'El estado es AVAILABLE (operativa), IN_REPAIR (en reparación) o RETIRED (de baja)',
  })
  status?: ToolStatus;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'El usuario activo que la tiene. Vacío o null: en el almacén. Solo una herramienta operativa se asigna',
  })
  @IsOptional()
  @IsUUID('4', { message: 'Selecciona a quién se le asigna' })
  assignedToId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @TrimToNull()
  @MaxLength(1000, { message: 'Las notas tienen como máximo 1000 caracteres' })
  @IsString({ message: 'Las notas tienen que ser texto' })
  notes?: string | null;
}
