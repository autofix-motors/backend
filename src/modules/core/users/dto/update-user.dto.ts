import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';

// La contraseña no se edita aquí: tiene su propio endpoint
// (PUT /users/:userId/password), que además cierra las sesiones del usuario.
// Igual que en clientes, un null en un campo obligatorio se valida y responde
// 400 en vez de llegar a la base como un 500.
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
  { skipNullProperties: false },
) {
  @ApiPropertyOptional()
  // No es `@IsOptional()`: ese dejaría pasar un null, y la columna no lo admite.
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean({ message: 'El estado tiene que ser verdadero o falso' })
  isActive?: boolean;
}
