import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { DocumentType } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const CUSTOMER_SORT_FIELDS = ['name', 'createdAt'] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

/**
 * El listado de clientes. `search` (heredado) busca en el nombre y en el
 * número de documento; los filtros son el tipo de documento y el estado.
 */
export class ListCustomersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DocumentType, enumName: 'DocumentType' })
  @IsOptional()
  @IsEnum(DocumentType, {
    message: 'El tipo de documento es DNI, RUC, CE o PASSPORT',
  })
  documentType?: DocumentType;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  // En la query todo llega como texto: «true» y «false» se convierten aquí.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'El estado es true o false' })
  isActive?: boolean;

  @ApiPropertyOptional({ enum: CUSTOMER_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(CUSTOMER_SORT_FIELDS, { message: 'Se ordena por name o createdAt' })
  sortBy: CustomerSortField = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El orden es asc o desc' })
  sortOrder: 'asc' | 'desc' = 'asc';
}
