import { ApiProperty } from '@nestjs/swagger';
import {
  CUSTOMER_ROLE,
  type SessionRole,
} from '../../../../core/auth/session-user.js';
import { UserRole } from '../../../../generated/prisma/enums.js';

/** Los roles de una sesión, para Swagger: los del personal y el cliente. */
const SESSION_ROLES: SessionRole[] = [...Object.values(UserRole), CUSTOMER_ROLE];

/** Lo que se arma para responder, sea personal o cliente. */
export interface CurrentSessionModel {
  role: SessionRole;
  name: string;
  email: string | null;
  mustChangePassword: boolean;
  userId: string | null;
  customerId: string | null;
}

/**
 * Lo que el frontend recibe de quien inició sesión: quién es, con qué rol y si
 * todavía tiene que cambiar la contraseña temporal. Nunca incluye un hash: se
 * copia campo por campo.
 */
export class CurrentSession {
  constructor(session: CurrentSessionModel) {
    this.role = session.role;
    this.name = session.name;
    this.email = session.email;
    this.mustChangePassword = session.mustChangePassword;
    this.userId = session.userId;
    this.customerId = session.customerId;
  }

  @ApiProperty({ enum: SESSION_ROLES, enumName: 'SessionRole', example: 'ADMIN' })
  role: SessionRole;

  @ApiProperty({ example: 'Juan Pérez Rojas' })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: 'juan@correo.pe' })
  email: string | null;

  @ApiProperty({
    description:
      'Tiene la contraseña temporal: hasta cambiarla solo puede ver su sesión y cambiarla',
  })
  mustChangePassword: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Del personal; vacío si es un cliente',
  })
  userId: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Del cliente; vacío si es del personal',
  })
  customerId: string | null;
}
