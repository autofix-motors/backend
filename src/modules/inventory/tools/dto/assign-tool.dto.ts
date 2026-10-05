import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

/**
 * Entregar una herramienta o devolverla al almacén, sin tocar sus demás datos.
 * La clave es obligatoria: `null` la devuelve, a propósito; un cuerpo vacío no
 * puede devolverla por omisión.
 */
export class AssignToolDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'El usuario activo que se la lleva, o null para devolverla al almacén',
  })
  @ValidateIf((dto: AssignToolDto) => dto.assignedToId !== null)
  @IsUUID('4', {
    message: 'Selecciona a quién se le asigna, o null para devolverla',
  })
  assignedToId: string | null;
}
