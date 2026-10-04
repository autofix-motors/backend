import { ApiProperty } from '@nestjs/swagger';

/** La paginación de un listado, en el `meta` de la respuesta. */
export class PaginationMeta {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 42, description: 'Filas que cumplen los filtros' })
  total: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

/** El `skip` y `take` de Prisma para una página. */
export function pageWindow(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginationMeta(
  page: number,
  pageSize: number,
  total: number,
): PaginationMeta {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

/** Una página de resultados: lo que devuelve el service de un listado. */
export interface Page<T> {
  items: T[];
  meta: PaginationMeta;
}
