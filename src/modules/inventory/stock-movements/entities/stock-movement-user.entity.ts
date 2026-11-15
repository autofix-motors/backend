import { ApiProperty } from '@nestjs/swagger';
import type { Usuario as UserModel } from '../../../../generated/prisma/client.js';

export type StockMovementUserModel = Pick<UserModel, 'usuarioId' | 'nombre'>;

/** Quién registró un movimiento: solo el nombre, nada de su cuenta. */
export class StockMovementUser {
  constructor(user: StockMovementUserModel) {
    this.usuarioId = user.usuarioId;
    this.nombre = user.nombre;
  }

  @ApiProperty({ format: 'uuid' })
  usuarioId: string;

  @ApiProperty({ example: 'Rosa Quispe Mamani' })
  nombre: string;
}
