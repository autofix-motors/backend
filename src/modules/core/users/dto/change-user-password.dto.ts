import { PickType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto.js';

/** La contraseña nueva que el administrador le asigna a un usuario. */
export class ChangeUserPasswordDto extends PickType(CreateUserDto, [
  'password',
] as const) {}
