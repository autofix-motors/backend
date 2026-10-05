import { ApiProperty } from '@nestjs/swagger';
import type { User as UserModel } from '../../../../generated/prisma/client.js';
import { UserRole } from '../../../../generated/prisma/enums.js';

export type UserWithCounts = UserModel & {
  _count: { assignedWorkOrders: number };
};

/**
 * Lo que sale de un usuario por la API, con cuántas órdenes tiene asignadas
 * como mecánico. Se copia campo por campo para que el hash de la contraseña
 * nunca salga.
 */
export class User {
  constructor(user: UserWithCounts) {
    this.userId = user.userId;
    this.email = user.email;
    this.name = user.name;
    this.phone = user.phone;
    this.role = user.role;
    this.isActive = user.isActive;
    this.lastLoginAt = user.lastLoginAt;
    this.assignedWorkOrdersCount = user._count.assignedWorkOrders;
    this.createdAt = user.createdAt;
    this.updatedAt = user.updatedAt;
  }

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'jquispe@autofix.local' })
  email: string;

  @ApiProperty({ example: 'Juan Quispe Mamani' })
  name: string;

  @ApiProperty({ type: String, nullable: true, example: '987654321' })
  phone: string | null;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role: UserRole;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Vacío si nunca inició sesión',
  })
  lastLoginAt: Date | null;

  @ApiProperty({
    example: 4,
    description: 'Órdenes de trabajo donde es el mecánico asignado',
  })
  assignedWorkOrdersCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
