import { ApiProperty } from '@nestjs/swagger';
import type { Usuario as UserModel } from '../../../../generated/prisma/client.js';

export type WorkOrderUserModel = Pick<UserModel, 'usuarioId' | 'nombre'>;

/**
 * Una persona del taller en una orden (el mecánico, quien la registró, quien
 * escribió un evento): solo el nombre, nada de su cuenta.
 */
export class WorkOrderUser {
  constructor(user: WorkOrderUserModel) {
    this.usuarioId = user.usuarioId;
    this.nombre = user.nombre;
  }

  @ApiProperty({ format: 'uuid' })
  usuarioId: string;

  @ApiProperty({ example: 'Carlos Huamán Quispe' })
  nombre: string;
}
