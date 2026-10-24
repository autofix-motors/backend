import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { IsDateOnly } from '../../../../core/validation/date-only.js';
import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const WORK_ORDER_SORT_FIELDS = [
  'receivedAt',
  'promisedDate',
  'number',
] as const;
export type WorkOrderSortField = (typeof WORK_ORDER_SORT_FIELDS)[number];

/**
 * El listado de órdenes. `search` (heredado) busca por número de orden, placa,
 * nombre del cliente y código de seguimiento. Los filtros son el estado (uno o
 * varios), el mecánico, el vehículo, el cliente, las vencidas y un rango de
 * días de ingreso. Por defecto, lo último que entró primero.
 *
 * El mecánico solo ve sus órdenes: el service ignora el `mechanicId` que pida
 * y usa el de su sesión.
 */
export class ListWorkOrdersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    type: String,
    example: 'RECEIVED,DIAGNOSIS',
    description: 'Uno o varios estados, separados por coma',
  })
  @IsOptional()
  // En la query llega como texto: «A,B» se convierte en la lista. Un texto
  // vacío es no filtrar.
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const statuses = value
      .split(',')
      .map((status) => status.trim())
      .filter(Boolean);
    return statuses.length ? statuses : undefined;
  })
  @IsEnum(WorkOrderStatus, {
    each: true,
    message: 'El estado no es válido',
  })
  status?: WorkOrderStatus[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Solo para ADMIN: el mecánico ve siempre las suyas',
  })
  @IsOptional()
  @IsUUID('4', { message: 'El mecánico no es válido' })
  mechanicId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'El vehículo no es válido' })
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'El cliente no es válido' })
  customerId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'true: solo las vencidas (la fecha prometida ya pasó en Lima y no se entregó ni se canceló)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'El filtro de vencidas es true o false' })
  overdue?: boolean;

  @ApiPropertyOptional({
    example: '2026-10-01',
    description: 'Ingresadas desde este día (AAAA-MM-DD), en la hora de Lima',
  })
  @IsOptional()
  @IsDateOnly('La fecha desde')
  from?: string;

  @ApiPropertyOptional({
    example: '2026-10-31',
    description:
      'Ingresadas hasta este día inclusive (AAAA-MM-DD), en la hora de Lima',
  })
  @IsOptional()
  @IsDateOnly('La fecha hasta')
  to?: string;

  @ApiPropertyOptional({ enum: WORK_ORDER_SORT_FIELDS, default: 'receivedAt' })
  @IsOptional()
  @IsIn(WORK_ORDER_SORT_FIELDS, {
    message: 'Se ordena por receivedAt, promisedDate o number',
  })
  sortBy: WorkOrderSortField = 'receivedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El orden es asc o desc' })
  sortOrder: 'asc' | 'desc' = 'desc';
}
