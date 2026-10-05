import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, ValidateIf } from 'class-validator';
import { TrimToNull } from '../../../../core/validation/trim-to-null.transform.js';

/**
 * El diagnóstico entero: reemplaza al anterior. La clave es obligatoria para
 * que un cuerpo vacío no lo borre por omisión; `null` o texto vacío lo borran
 * a propósito.
 */
export class UpdateWorkOrderDiagnosisDto {
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: 4000,
    example: 'Pastillas delanteras gastadas al 90 %; discos dentro de medida',
  })
  @TrimToNull()
  @ValidateIf(
    (_dto: UpdateWorkOrderDiagnosisDto, value: unknown) => value !== null,
  )
  @MaxLength(4000, {
    message: 'El diagnóstico tiene como máximo 4000 caracteres',
  })
  @IsString({ message: 'Escribe el diagnóstico, o null para borrarlo' })
  diagnosis: string | null;
}
