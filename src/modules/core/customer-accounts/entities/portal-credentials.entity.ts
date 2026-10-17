import { ApiProperty } from '@nestjs/swagger';

/**
 * Lo que el administrador le comparte al cliente por WhatsApp: con qué entra y
 * la contraseña temporal. Se devuelve una sola vez; la API no la guarda.
 */
export class PortalCredentials {
  constructor(credentials: PortalCredentials) {
    this.loginIdentifier = credentials.loginIdentifier;
    this.temporaryPassword = credentials.temporaryPassword;
    this.expiresAt = credentials.expiresAt;
  }

  @ApiProperty({
    example: '45678912',
    description: 'El número de documento del cliente: con él inicia sesión',
  })
  loginIdentifier: string;

  @ApiProperty({ example: 'Hk7mQ4pZr2Tx' })
  temporaryPassword: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Después de esto ya no sirve: hay que generar otra',
  })
  expiresAt: Date;
}
