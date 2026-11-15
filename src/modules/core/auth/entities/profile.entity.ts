import { ApiProperty } from '@nestjs/swagger';
import type { SessionRole } from '../../../../core/auth/session-user.js';
import { TipoDocumento } from '../../../../generated/prisma/enums.js';
import { SESSION_ROLES } from './current-session.entity.js';

/** De quién es el perfil: alguien del personal o un cliente del portal. */
export const PROFILE_TYPES = ['PERSONAL', 'CLIENTE'] as const;
export type ProfileType = (typeof PROFILE_TYPES)[number];

/** Lo que arma el service, sea personal o cliente. */
export interface ProfileModel {
  tipo: ProfileType;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  tipoDocumento: TipoDocumento | null;
  numeroDocumento: string | null;
  rol: SessionRole;
  direccion: string | null;
  ultimoIngresoEn: Date | null;
  miembroDesde: Date;
}

/**
 * Los datos de quien tiene la sesión, para su pantalla «Mi perfil». Solo
 * lectura: el personal los cambia desde Personal y el cliente se los pide al
 * taller. Sin ids ni hashes: la pantalla no los necesita y se copia campo por
 * campo para que ninguna columna nueva salga sola.
 */
export class Profile {
  constructor(profile: ProfileModel) {
    this.tipo = profile.tipo;
    this.nombre = profile.nombre;
    this.correo = profile.correo;
    this.telefono = profile.telefono;
    this.tipoDocumento = profile.tipoDocumento;
    this.numeroDocumento = profile.numeroDocumento;
    this.rol = profile.rol;
    this.direccion = profile.direccion;
    this.ultimoIngresoEn = profile.ultimoIngresoEn;
    this.miembroDesde = profile.miembroDesde;
  }

  @ApiProperty({
    enum: PROFILE_TYPES,
    enumName: 'TipoPerfil',
    example: 'PERSONAL',
  })
  tipo: ProfileType;

  @ApiProperty({ example: 'Juan Pérez Rojas' })
  nombre: string;

  @ApiProperty({ type: String, nullable: true, example: 'juan@correo.pe' })
  correo: string | null;

  @ApiProperty({ type: String, nullable: true, example: '987654321' })
  telefono: string | null;

  @ApiProperty({
    enum: TipoDocumento,
    enumName: 'TipoDocumento',
    nullable: true,
    description: 'DNI en el personal; vacío si no tiene documento registrado',
  })
  tipoDocumento: TipoDocumento | null;

  @ApiProperty({ type: String, nullable: true, example: '45678912' })
  numeroDocumento: string | null;

  @ApiProperty({
    enum: SESSION_ROLES,
    enumName: 'RolSesion',
    example: 'ADMINISTRADOR',
  })
  rol: SessionRole;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Solo del cliente; vacío en el personal',
  })
  direccion: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description:
      'El último inicio de sesión correcto (del portal, si es cliente)',
  })
  ultimoIngresoEn: Date | null;

  @ApiProperty({
    format: 'date-time',
    description: 'Cuándo se registró el usuario o el cliente',
  })
  miembroDesde: Date;
}
