import { ApiProperty } from '@nestjs/swagger';
import type { Servicio as ServiceCatalogItemModel } from '../../../../generated/prisma/client.js';

/** Lo que sale de un servicio del catálogo por la API. */
export class ServiceCatalogItem {
  constructor(item: ServiceCatalogItemModel) {
    this.servicioId = item.servicioId;
    this.nombre = item.nombre;
    this.descripcion = item.descripcion;
    // Texto con dos decimales: serializado sin más, 120.50 viajaría como
    // «120.5».
    this.precioManoObra = item.precioManoObra.toFixed(2);
    this.activo = item.activo;
    this.creadoEn = item.creadoEn;
    this.actualizadoEn = item.actualizadoEn;
  }

  @ApiProperty({ format: 'uuid' })
  servicioId: string;

  @ApiProperty({ example: 'Cambio de aceite y filtro' })
  nombre: string;

  @ApiProperty({ type: String, nullable: true })
  descripcion: string | null;

  @ApiProperty({
    example: '60.00',
    description: 'Precio de mano de obra referencial, en soles',
  })
  precioManoObra: string;

  @ApiProperty()
  activo: boolean;

  @ApiProperty({ format: 'date-time' })
  creadoEn: Date;

  @ApiProperty({ format: 'date-time' })
  actualizadoEn: Date;
}
