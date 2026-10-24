import { ApiProperty } from '@nestjs/swagger';

/** Lo que el cliente necesita saber de un acceso al portal, sin el hash. */
export interface PortalAccessModel {
  createdAt: Date;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
}

/**
 * El acceso del cliente a su portal, si el administrador se lo habilitó. Se
 * copia campo por campo: la contraseña nunca sale de customer-accounts.
 */
export class PortalAccess {
  constructor(access: PortalAccessModel) {
    this.createdAt = access.createdAt;
    this.lastLoginAt = access.lastLoginAt;
    this.mustChangePassword = access.mustChangePassword;
  }

  @ApiProperty({ format: 'date-time', description: 'Cuándo se habilitó' })
  createdAt: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Vacío si todavía no entró',
  })
  lastLoginAt: Date | null;

  @ApiProperty({
    description:
      'Todavía tiene la contraseña temporal: no entró o no la cambió',
  })
  mustChangePassword: boolean;
}
