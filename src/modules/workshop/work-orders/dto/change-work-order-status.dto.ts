import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';
import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';

/**
 * Llevar la orden a otro estado. Qué estados se aceptan desde cuál, y para qué
 * rol, lo decide `canTransition`; que cancelar exija la nota (el motivo), el
 * service.
 */
export class ChangeWorkOrderStatusDto {
  @ApiProperty({ enum: WorkOrderStatus, enumName: 'WorkOrderStatus' })
  @IsEnum(WorkOrderStatus, { message: 'El estado no es válido' })
  status: WorkOrderStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 2000,
    description: 'Obligatoria al cancelar: es el motivo',
  })
  @IsOptional()
  @TrimToNull()
  @MaxLength(2000, { message: 'La nota tiene como máximo 2000 caracteres' })
  @IsString({ message: 'La nota tiene que ser texto' })
  note?: string | null;

  @ApiPropertyOptional({
    default: true,
    description: 'Si el cliente lo ve en el seguimiento',
  })
  // Opcional pero no anulable: la columna no admite vacío.
  @ValidateIf(
    (_dto: ChangeWorkOrderStatusDto, value: unknown) => value !== undefined,
  )
  @IsBoolean({ message: 'Indica si el cliente ve el cambio (true o false)' })
  isPublic?: boolean;
}
