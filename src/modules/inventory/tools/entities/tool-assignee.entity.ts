import { ApiProperty } from '@nestjs/swagger';
import type { User as UserModel } from '../../../../generated/prisma/client.js';

export type ToolAssigneeModel = Pick<UserModel, 'userId' | 'name'>;

/** Quién tiene una herramienta: solo el nombre, nada de su cuenta. */
export class ToolAssignee {
  constructor(user: ToolAssigneeModel) {
    this.userId = user.userId;
    this.name = user.name;
  }

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'Jorge Quispe Huamán' })
  name: string;
}
