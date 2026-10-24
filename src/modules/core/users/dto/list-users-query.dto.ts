import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional } from 'class-validator';
import { UserRole } from '../../../../generated/prisma/enums.js';
import { PaginationQueryDto } from '../../../../shared/dto/pagination-query.dto.js';

export const USER_SORT_FIELDS = ['name', 'createdAt', 'lastLoginAt'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

/**
 * El listado del personal. `search` (heredado) busca en el nombre y el correo;
 * los filtros son el rol y el estado.
 */
export class ListUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: UserRole, enumName: 'UserRole' })
  @IsOptional()
  @IsEnum(UserRole, { message: 'El rol es ADMIN o MECHANIC' })
  role?: UserRole;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  // En la query todo llega como texto: «true» y «false» se convierten aquí.
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'El estado es true o false' })
  isActive?: boolean;

  @ApiPropertyOptional({ enum: USER_SORT_FIELDS, default: 'name' })
  @IsOptional()
  @IsIn(USER_SORT_FIELDS, {
    message: 'Se ordena por name, createdAt o lastLoginAt',
  })
  sortBy: UserSortField = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'El orden es asc o desc' })
  sortOrder: 'asc' | 'desc' = 'asc';
}
