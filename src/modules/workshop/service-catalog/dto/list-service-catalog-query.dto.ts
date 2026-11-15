import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { IsMoney } from '../../../../core/validation/money.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const SERVICE_CATALOG_SORT_FIELDS = [
  'nombre',
  'precioManoObra',
  'creadoEn',
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
  activo?: boolean;

  @ApiPropertyOptional({
    type: String,
    example: '50',
    description: 'Precio de mano de obra desde, en soles (incluido)',
  })
  @IsOptional()
  @Transform(optionalMoney)
  @IsMoney('El precio mínimo')
  precioMinimo?: string;

  @ApiPropertyOptional({
    type: String,
    example: '200',
    description: 'Precio de mano de obra hasta, en soles (incluido)',
  })
  @IsOptional()
  @Transform(optionalMoney)
  @IsMoney('El precio máximo')
  precioMaximo?: string;

  @ApiPropertyOptional({ enum: SERVICE_CATALOG_SORT_FIELDS, default: 'nombre' })
  @IsOptional()
  @IsIn(SERVICE_CATALOG_SORT_FIELDS, {
    message: 'Se ordena por nombre, precioManoObra o creadoEn',
  })
  ordenarPor: ServiceCatalogSortField = 'nombre';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El sentido es asc o desc' })
  sentido: 'asc' | 'desc' = 'asc';
}
