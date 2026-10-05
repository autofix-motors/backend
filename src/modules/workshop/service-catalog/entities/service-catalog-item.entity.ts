import { ApiProperty } from '@nestjs/swagger';
import type { ServiceCatalogItem as ServiceCatalogItemModel } from '../../../../generated/prisma/client.js';

/** Lo que sale de un servicio del catálogo por la API. */
export class ServiceCatalogItem {
  constructor(item: ServiceCatalogItemModel) {
    this.serviceCatalogItemId = item.serviceCatalogItemId;
    this.name = item.name;
    this.description = item.description;
    // Texto con dos decimales: serializado sin más, 120.50 viajaría como
    // «120.5».
    this.laborPrice = item.laborPrice.toFixed(2);
    this.isActive = item.isActive;
    this.createdAt = item.createdAt;
    this.updatedAt = item.updatedAt;
  }

  @ApiProperty({ format: 'uuid' })
  serviceCatalogItemId: string;

  @ApiProperty({ example: 'Cambio de aceite y filtro' })
  name: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({
    example: '60.00',
    description: 'Precio de mano de obra referencial, en soles',
  })
  laborPrice: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
