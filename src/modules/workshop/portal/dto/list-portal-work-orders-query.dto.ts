import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

/** «En curso» (no entregadas ni canceladas) o «anteriores». */
export const PORTAL_WORK_ORDER_STATES = ['EN_CURSO', 'ANTERIORES'] as const;
export type PortalWorkOrderState = (typeof PORTAL_WORK_ORDER_STATES)[number];

/**
 * El listado del portal: las pestañas y el filtro por vehículo, sin búsqueda
 * (un cliente tiene pocas órdenes). Hereda solo la paginación.
 */
export class ListPortalWorkOrdersQueryDto extends PickType(PaginationQueryDto, [
  'page',
  'pageSize',
] as const) {
  @ApiPropertyOptional({
    enum: PORTAL_WORK_ORDER_STATES,
    enumName: 'EstadoListaPortal',
    default: 'EN_CURSO',
  })
  @IsOptional()
  @IsIn(PORTAL_WORK_ORDER_STATES, {
    message: 'El estado es EN_CURSO o ANTERIORES',
  })
  estado: PortalWorkOrderState = 'EN_CURSO';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('all', { message: 'El vehículo no es válido' })
  vehiculoId?: string;
}
