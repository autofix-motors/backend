import { PickType } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

/**
 * Los vehículos del portal: paginación y búsqueda por placa, marca o modelo.
 * Sin otros filtros: un cliente tiene pocos vehículos.
 */
export class ListPortalVehiclesQueryDto extends PickType(PaginationQueryDto, [
  'page',
  'pageSize',
  'search',
] as const) {}
