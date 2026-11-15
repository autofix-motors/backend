import { ApiProperty } from '@nestjs/swagger';

/** Lo que el cliente necesita saber de un acceso al portal, sin el hash. */
export interface PortalAccessModel {
  creadoEn: Date;
  ultimoIngresoEn: Date | null;
  debeCambiarContrasena: boolean;
}

/**
 * El acceso del cliente a su portal, si el administrador se lo habilitó. Se
 * copia campo por campo: la contraseña nunca sale de customer-accounts.
 */
export class PortalAccess {
  constructor(access: PortalAccessModel) {
    this.creadoEn = access.creadoEn;
    this.ultimoIngresoEn = access.ultimoIngresoEn;
    this.debeCambiarContrasena = access.debeCambiarContrasena;
  }

  @ApiProperty({ format: 'date-time', description: 'Cuándo se habilitó' })
  creadoEn: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Vacío si todavía no entró',
  })
  ultimoIngresoEn: Date | null;

  @ApiProperty({
    description:
      'Todavía tiene la contraseña temporal: no entró o no la cambió',
  })
  debeCambiarContrasena: boolean;
}
