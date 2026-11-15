import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { RolUsuario } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const USER_SORT_FIELDS = [
  'nombre',
  'creadoEn',
  'ultimoIngresoEn',
] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

/**
 * El listado del personal. `search` (heredado) busca en el nombre y el correo;
 * los filtros son el rol y el estado.
 */
export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RolUsuario, enumName: 'RolUsuario' })
  @IsOptional()
  @IsEnum(RolUsuario, { message: 'El rol es ADMINISTRADOR o MECANICO' })
  rol?: RolUsuario;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  // En la query todo llega como texto: «true» y «false» se convierten aquí.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'El estado es true o false' })
  activo?: boolean;

  @ApiPropertyOptional({ enum: USER_SORT_FIELDS, default: 'nombre' })
  @IsOptional()
  @IsIn(USER_SORT_FIELDS, {
    message: 'Se ordena por nombre, creadoEn o ultimoIngresoEn',
  })
  ordenarPor: UserSortField = 'nombre';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El sentido es asc o desc' })
  sentido: 'asc' | 'desc' = 'asc';
}
