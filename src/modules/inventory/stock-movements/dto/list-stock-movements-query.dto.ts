import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { IsDateOnly } from '../../../../core/validation/date-only.js';
import { TipoMovimiento } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const STOCK_MOVEMENT_SORT_FIELDS = ['creadoEn', 'cantidad'] as const;
export type StockMovementSortField =
  (typeof STOCK_MOVEMENT_SORT_FIELDS)[number];

/**
 * El kardex. `search` (heredado) busca en el código y el nombre del producto y
 * en la nota; los filtros son el tipo, el producto y un rango de días. Por
 * defecto lo más reciente primero.
 */
export class ListStockMovementsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: TipoMovimiento,
    enumName: 'TipoMovimiento',
  })
  @IsOptional()
  @IsEnum(TipoMovimiento, {
    message: 'El tipo es COMPRA, ORDEN_TRABAJO o AJUSTE',
  })
  tipo?: TipoMovimiento;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'El producto no es válido' })
  productoId?: string;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Desde este día (AAAA-MM-DD), en la hora de Lima',
  })
  @IsOptional()
  @IsDateOnly('La fecha desde')
  desde?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description: 'Hasta este día inclusive (AAAA-MM-DD), en la hora de Lima',
  })
  @IsOptional()
  @IsDateOnly('La fecha hasta')
  hasta?: string;

  @ApiPropertyOptional({
    enum: STOCK_MOVEMENT_SORT_FIELDS,
    default: 'creadoEn',
  })
  @IsOptional()
  @IsIn(STOCK_MOVEMENT_SORT_FIELDS, {
    message: 'Se ordena por creadoEn o cantidad',
  })
  ordenarPor: StockMovementSortField = 'creadoEn';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El sentido es asc o desc' })
  sentido: 'asc' | 'desc' = 'desc';
}
