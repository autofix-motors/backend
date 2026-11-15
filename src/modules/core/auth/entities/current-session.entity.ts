import { ApiProperty } from '@nestjs/swagger';
import {
  CUSTOMER_ROLE,
  type SessionRole,
} from '../../../../core/auth/session-user.js';
import { RolUsuario } from '../../../../generated/prisma/enums.js';

/**
 * Los roles de una sesión, para Swagger: los del personal y el cliente. Lo
 * usa también el perfil, con el mismo `enumName`.
 */
export const SESSION_ROLES: SessionRole[] = [
  ...Object.values(RolUsuario),
  CUSTOMER_ROLE,
];

/** Lo que se arma para responder, sea personal o cliente. */
export interface CurrentSessionModel {
  rol: SessionRole;
  nombre: string;
  correo: string | null;
  debeCambiarContrasena: boolean;
  usuarioId: string | null;
  clienteId: string | null;
}

/**
 * Lo que el frontend recibe de quien inició sesión: quién es, con qué rol y si
 * todavía tiene que cambiar la contraseña temporal. Nunca incluye un hash: se
 * copia campo por campo.
 */
export class CurrentSession {
  constructor(session: CurrentSessionModel) {
    this.rol = session.rol;
    this.nombre = session.nombre;
    this.correo = session.correo;
    this.debeCambiarContrasena = session.debeCambiarContrasena;
    this.usuarioId = session.usuarioId;
    this.clienteId = session.clienteId;
  }

  @ApiProperty({
    enum: SESSION_ROLES,
    enumName: 'RolSesion',
    example: 'ADMINISTRADOR',
  })
  rol: SessionRole;

  @ApiProperty({ example: 'Juan Pérez Rojas' })
  nombre: string;

  @ApiProperty({ type: String, nullable: true, example: 'juan@correo.pe' })
  correo: string | null;

  @ApiProperty({
    description:
      'Tiene la contraseña temporal: hasta cambiarla solo puede ver su sesión y cambiarla',
  })
  debeCambiarContrasena: boolean;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Del personal; vacío si es un cliente',
  })
  usuarioId: string | null;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Del cliente; vacío si es del personal',
  })
  clienteId: string | null;
}
