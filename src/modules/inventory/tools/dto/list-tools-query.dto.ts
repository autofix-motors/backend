import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ToolStatus } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const TOOL_SORT_FIELDS = ['code', 'name', 'status'] as const;
export type ToolSortField = (typeof TOOL_SORT_FIELDS)[number];

/**
 * Las herramientas. `search` (heredado) busca en el código, el nombre y la
 * marca; los filtros son el estado, quién la tiene (`assignedToId`) y si está
 * asignada o en el almacén (`isAssigned`). Por defecto, por código.
 */
export class ListToolsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ToolStatus, enumName: 'ToolStatus' })
  @IsOptional()
  @IsEnum(ToolStatus, {
    message: 'El estado es AVAILABLE, IN_REPAIR o RETIRED',
  })
  status?: ToolStatus;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Solo las que tiene este usuario',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El usuario no es válido' })
  assignedToId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true: solo las asignadas a alguien; false: solo las que están en el almacén',
  })
  @IsOptional()
  // En la query todo llega como texto: «true» y «false» se convierten aquí.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'El filtro de asignación es true o false' })
  isAssigned?: boolean;

  @ApiPropertyOptional({ enum: TOOL_SORT_FIELDS, default: 'code' })
  @IsOptional()
  @IsIn(TOOL_SORT_FIELDS, { message: 'Se ordena por code, name o status' })
  sortBy: ToolSortField = 'code';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El orden es asc o desc' })
  sortOrder: 'asc' | 'desc' = 'asc';
}
