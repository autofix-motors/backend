import { ApiProperty } from '@nestjs/swagger';
import type { ServiceCount } from '../../work-orders/work-order-stats.js';

/** Un servicio del catálogo y cuántas veces se agregó a una orden en el mes. */
export class DashboardServiceCount {
  constructor(count: ServiceCount) {
    this.nombre = count.nombre;
    this.cantidad = count.cantidad;
  }

  @ApiProperty({ example: 'Cambio de aceite' })
  nombre: string;

  @ApiProperty({
    example: 12,
    description: 'Detalles de orden con el servicio',
  })
  cantidad: number;
}
