import { ApiProperty } from '@nestjs/swagger';
import type { Usuario as UserModel } from '../../../../generated/prisma/client.js';
import { RolUsuario } from '../../../../generated/prisma/enums.js';

export type UserWithCounts = UserModel & {
  _count: { ordenesAsignadas: number };
};

/**
 * Lo que sale de un usuario por la API, con cuántas órdenes tiene asignadas
 * como mecánico. Se copia campo por campo para que el hash de la contraseña
 * nunca salga.
 */
export class User {
  constructor(user: UserWithCounts) {
    this.usuarioId = user.usuarioId;
    this.correo = user.correo;
    this.numeroDocumento = user.numeroDocumento;
    this.nombre = user.nombre;
    this.telefono = user.telefono;
    this.rol = user.rol;
    this.activo = user.activo;
    this.ultimoIngresoEn = user.ultimoIngresoEn;
    this.debeCambiarContrasena = user.debeCambiarContrasena;
    this.cantidadOrdenesAsignadas = user._count.ordenesAsignadas;
    this.creadoEn = user.creadoEn;
    this.actualizadoEn = user.actualizadoEn;
  }

  @ApiProperty({ format: 'uuid' })
  usuarioId: string;

  @ApiProperty({ example: 'jquispe@autofix.local' })
  correo: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: '45678912',
    description: 'DNI. Vacío en el personal registrado antes de pedirlo',
  })
  numeroDocumento: string | null;

  @ApiProperty({ example: 'Juan Quispe Mamani' })
  nombre: string;

  @ApiProperty({ type: String, nullable: true, example: '987654321' })
  telefono: string | null;

  @ApiProperty({ enum: RolUsuario, enumName: 'RolUsuario' })
  rol: RolUsuario;

  @ApiProperty()
  activo: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Vacío si nunca inició sesión',
  })
  ultimoIngresoEn: Date | null;

  @ApiProperty({
    description:
      'Todavía tiene la contraseña temporal: no entró o no la cambió',
  })
  debeCambiarContrasena: boolean;

  @ApiProperty({
    example: 4,
    description: 'Órdenes de trabajo donde es el mecánico asignado',
  })
  cantidadOrdenesAsignadas: number;

  @ApiProperty({ format: 'date-time' })
  creadoEn: Date;

  @ApiProperty({ format: 'date-time' })
  actualizadoEn: Date;
}
