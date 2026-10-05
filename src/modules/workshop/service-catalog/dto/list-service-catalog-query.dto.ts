import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { IsMoney } from '../../../../core/validation/money.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const SERVICE_CATALOG_SORT_FIELDS = [
  'name',
  'laborPrice',
  'createdAt',
] as const;
export type ServiceCatalogSortField =
  (typeof SERVICE_CATALOG_SORT_FIELDS)[number];

// En la query todo llega como texto; un monto vacío es lo mismo que no filtrar.
const optionalMoney = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/**
 * El catálogo de servicios. `search` (heredado) busca en el nombre y la
 * descripción; los filtros son el estado y un rango del precio de mano de obra.
 */
export class ListServiceCatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  // «true» y «false» llegan como texto y se convierten aquí.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'El estado es true o false' })
  isActive?: boolean;

  @ApiPropertyOptional({
    type: String,
    example: '50',
    description: 'Precio de mano de obra desde, en soles (incluido)',
  })
  @IsOptional()
  @Transform(optionalMoney)
  @IsMoney('El precio mínimo')
  minPrice?: string;

  @ApiPropertyOptional({
    type: String,
    example: '200',
    description: 'Precio de mano de obra hasta, en soles (incluido)',
  })
  @IsOptional()
  @Transform(optionalMoney)
  @IsMoney('El precio máximo')
  maxPrice?: string;

  @ApiPropertyOptional({ enum: SERVICE_CATALOG_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(SERVICE_CATALOG_SORT_FIELDS, {
    message: 'Se ordena por name, laborPrice o createdAt',
  })
  sortBy: ServiceCatalogSortField = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El orden es asc o desc' })
  sortOrder: 'asc' | 'desc' = 'asc';
}
