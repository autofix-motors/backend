import { ApiProperty } from '@nestjs/swagger';

/**
 * La contraseña temporal recién generada. Se devuelve una sola vez, para que
 * el administrador se la comparta al usuario; la API no la guarda.
 */
export class TemporaryPassword {
  constructor(password: { contrasenaTemporal: string; expiraEn: Date }) {
    this.contrasenaTemporal = password.contrasenaTemporal;
    this.expiraEn = password.expiraEn;
  }

  @ApiProperty({ example: 'Hk7mQ4pZr2Tx' })
  contrasenaTemporal: string;

  @ApiProperty({
    format: 'date-time',
    description: 'Después de esto ya no sirve: hay que generar otra',
  })
  expiraEn: Date;
}
