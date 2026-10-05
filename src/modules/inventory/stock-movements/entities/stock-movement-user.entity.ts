import { ApiProperty } from '@nestjs/swagger';
import type { User as UserModel } from '../../../../generated/prisma/client.js';

export type StockMovementUserModel = Pick<UserModel, 'userId' | 'name'>;

/** Quién registró un movimiento: solo el nombre, nada de su cuenta. */
export class StockMovementUser {
  constructor(user: StockMovementUserModel) {
    this.userId = user.userId;
    this.name = user.name;
  }

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'Rosa Quispe Mamani' })
  name: string;
}
