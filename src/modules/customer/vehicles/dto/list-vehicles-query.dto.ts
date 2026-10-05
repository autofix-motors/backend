import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const VEHICLE_SORT_FIELDS = ['plate', 'brand', 'createdAt'] as const;
export type VehicleSortField = (typeof VEHICLE_SORT_FIELDS)[number];

/**
 * El listado de vehículos. `search` (heredado) busca en la placa, la marca, el
 * modelo y el nombre del cliente; los filtros son el cliente y la marca.
 */
export class ListVehiclesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'El dueño' })
  @IsOptional()
  @IsUUID('4', { message: 'El cliente no es válido' })
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Marca exacta, sin distinguir mayúsculas',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @MaxLength(60, { message: 'La marca es demasiado larga' })
  @IsString({ message: 'La marca tiene que ser texto' })
  brand?: string;

  @ApiPropertyOptional({ enum: VEHICLE_SORT_FIELDS, default: 'plate' })
  @IsOptional()
  @IsIn(VEHICLE_SORT_FIELDS, {
    message: 'Se ordena por plate, brand o createdAt',
  })
  sortBy: VehicleSortField = 'plate';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El orden es asc o desc' })
  sortOrder: 'asc' | 'desc' = 'asc';
}
