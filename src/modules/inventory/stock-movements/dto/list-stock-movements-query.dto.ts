import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { IsDateOnly } from '../../../../core/validation/date-only.js';
import { StockMovementType } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const STOCK_MOVEMENT_SORT_FIELDS = ['createdAt', 'quantity'] as const;
export type StockMovementSortField =
  (typeof STOCK_MOVEMENT_SORT_FIELDS)[number];

/**
 * El kardex. `search` (heredado) busca en el código y el nombre del producto y
 * en la nota; los filtros son el tipo, el producto y un rango de días. Por
 * defecto lo más reciente primero.
 */
export class ListStockMovementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: StockMovementType,
    enumName: 'StockMovementType',
  })
  @IsOptional()
  @IsEnum(StockMovementType, {
    message: 'El tipo es PURCHASE, WORK_ORDER o ADJUSTMENT',
  })
  type?: StockMovementType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'El producto no es válido' })
  productId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Desde este día (AAAA-MM-DD), en la hora de Lima',
  })
  @IsOptional()
  @IsDateOnly('La fecha desde')
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Hasta este día inclusive (AAAA-MM-DD), en la hora de Lima',
  })
  @IsOptional()
  @IsDateOnly('La fecha hasta')
  to?: string;

  @ApiPropertyOptional({
    enum: STOCK_MOVEMENT_SORT_FIELDS,
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(STOCK_MOVEMENT_SORT_FIELDS, {
    message: 'Se ordena por createdAt o quantity',
  })
  sortBy: StockMovementSortField = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El orden es asc o desc' })
  sortOrder: 'asc' | 'desc' = 'desc';
}
