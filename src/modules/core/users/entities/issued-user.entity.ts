import { ApiProperty } from '@nestjs/swagger';
import { TemporaryPassword } from './temporary-password.entity.js';
import { User, type UserWithCounts } from './user.entity.js';

/** El usuario recién registrado, con la contraseña temporal para compartirle. */
export class IssuedUser extends TemporaryPassword {
  constructor(issued: {
    user: UserWithCounts;
    temporaryPassword: string;
    expiresAt: Date;
  }) {
    super(issued);
    this.user = new User(issued.user);
  }

  @ApiProperty({ type: User })
  user: User;
}
