import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../../../../generated/prisma/client.js';
import { UserRole } from '../../../../generated/prisma/enums.js';

/**
 * Lo que el frontend recibe del usuario que inició sesión: quién es y con qué
 * rol. Nunca incluye el hash de la contraseña: por eso se copia campo por
 * campo.
 */
export class CurrentSession {
  constructor(user: User) {
    this.id = user.id;
    this.name = user.name;
    this.email = user.email;
    this.role = user.role;
  }

  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Administrador' })
  name: string;

  @ApiProperty({ example: 'admin@taller.local' })
  email: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: 'ADMIN' })
  role: UserRole;
}
