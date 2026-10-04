import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** El máximo de filas por página: más que esto es pedir el listado entero. */
export const MAX_PAGE_SIZE = 100;

/**
 * Lo que comparten todos los listados: la página, su tamaño y la búsqueda
 * libre. El DTO de cada listado lo extiende con sus filtros. Los valores llegan
 * como texto en la query y `@Type` los convierte a número.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La página tiene que ser un número entero' })
  @Min(1, { message: 'La página empieza en 1' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de página tiene que ser un número entero' })
  @Min(1, { message: 'El tamaño de página es al menos 1' })
  @Max(MAX_PAGE_SIZE, {
    message: `El tamaño de página es como máximo ${MAX_PAGE_SIZE}`,
  })
  pageSize: number = 10;

  @ApiPropertyOptional({ description: 'Búsqueda libre' })
  @IsOptional()
  // Una búsqueda vacía o solo de espacios es lo mismo que no buscar.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString({ message: 'La búsqueda tiene que ser texto' })
  @MaxLength(100, { message: 'La búsqueda es demasiado larga' })
  search?: string;
}
