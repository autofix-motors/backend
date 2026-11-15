import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { TipoProducto } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const PRODUCT_SORT_FIELDS = [
  'nombre',
  'codigo',
  'stock',
  'precio',
] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

// En la query todo llega como texto: «true» y «false» se convierten aquí.
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

/**
 * Los repuestos e insumos. `search` (heredado) busca en el código, el nombre y
 * la marca; los filtros son el tipo, el estado y el stock bajo.
 */
export class ListProductsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TipoProducto, enumName: 'TipoProducto' })
  @IsOptional()
  @IsEnum(TipoProducto, { message: 'El tipo es REPUESTO o INSUMO' })
  tipo?: TipoProducto;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'El estado es true o false' })
  activo?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true: solo los de stock bajo (stock menor o igual al mínimo); false: solo los que están por encima del mínimo',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean({ message: 'El filtro de stock bajo es true o false' })
  stockBajo?: boolean;

  @ApiPropertyOptional({ enum: PRODUCT_SORT_FIELDS, default: 'nombre' })
  @IsOptional()
  @IsIn(PRODUCT_SORT_FIELDS, {
    message: 'Se ordena por nombre, codigo, stock o precio',
  })
  ordenarPor: ProductSortField = 'nombre';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El sentido es asc o desc' })
  sentido: 'asc' | 'desc' = 'asc';
}
