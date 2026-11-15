import { ApiProperty } from '@nestjs/swagger';
import { TemporaryPassword } from './temporary-password.entity.js';
import { User, type UserWithCounts } from './user.entity.js';

/** El usuario recién registrado, con la contraseña temporal para compartirle. */
export class IssuedUser extends TemporaryPassword {
  constructor(issued: {
    usuario: UserWithCounts;
    contrasenaTemporal: string;
    expiraEn: Date;
  }) {
    super(issued);
    this.usuario = new User(issued.usuario);
  }

  @ApiProperty({ type: User })
  usuario: User;
}
