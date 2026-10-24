import { ApiProperty } from '@nestjs/swagger';
import type { User as UserModel } from '../../../../generated/prisma/client.js';

export type WorkOrderUserModel = Pick<UserModel, 'userId' | 'name'>;

/**
 * Una persona del taller en una orden (el mecánico, quien la registró, quien
 * escribió un evento): solo el nombre, nada de su cuenta.
 */
export class WorkOrderUser {
  constructor(user: WorkOrderUserModel) {
    this.userId = user.userId;
    this.name = user.name;
  }

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'Carlos Huamán Quispe' })
  name: string;
}
