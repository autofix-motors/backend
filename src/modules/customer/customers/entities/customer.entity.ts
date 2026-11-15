import { ApiProperty } from '@nestjs/swagger';
import type { Cliente as CustomerModel } from '../../../../generated/prisma/client.js';
import { TipoDocumento } from '../../../../generated/prisma/enums.js';
import {
  PortalAccess,
  type PortalAccessModel,
} from './portal-access.entity.js';

export type CustomerWithCounts = CustomerModel & {
  _count: { vehiculos: number };
  cuentaCliente?: PortalAccessModel | null;
};

/** Lo que sale de un cliente por la API, con cuántos vehículos tiene. */
export class Customer {
  constructor(customer: CustomerWithCounts) {
    this.clienteId = customer.clienteId;
    this.tipoDocumento = customer.tipoDocumento;
    this.numeroDocumento = customer.numeroDocumento;
    this.nombre = customer.nombre;
    this.telefono = customer.telefono;
    this.correo = customer.correo;
    this.direccion = customer.direccion;
    this.notas = customer.notas;
    this.activo = customer.activo;
    this.cantidadVehiculos = customer._count.vehiculos;
    this.accesoPortal = customer.cuentaCliente
      ? new PortalAccess(customer.cuentaCliente)
      : null;
    this.creadoEn = customer.creadoEn;
    this.actualizadoEn = customer.actualizadoEn;
  }

  @ApiProperty({ format: 'uuid' })
  clienteId: string;

  @ApiProperty({ enum: TipoDocumento, enumName: 'TipoDocumento' })
  tipoDocumento: TipoDocumento;

  @ApiProperty({ example: '45678912' })
  numeroDocumento: string;

  @ApiProperty({ example: 'Juan Pérez Rojas' })
  nombre: string;

  @ApiProperty({ example: '987654321' })
  telefono: string;

  @ApiProperty({ type: String, nullable: true, example: 'juan@correo.pe' })
  correo: string | null;

  @ApiProperty({ type: String, nullable: true })
  direccion: string | null;

  @ApiProperty({ type: String, nullable: true })
  notas: string | null;

  @ApiProperty()
  activo: boolean;

  @ApiProperty({ example: 2 })
  cantidadVehiculos: number;

  @ApiProperty({
    type: PortalAccess,
    nullable: true,
    description: 'Vacío si no tiene acceso al portal',
  })
  accesoPortal: PortalAccess | null;

  @ApiProperty({ format: 'date-time' })
  creadoEn: Date;

  @ApiProperty({ format: 'date-time' })
  actualizadoEn: Date;
}
