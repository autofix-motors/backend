import { ApiProperty } from '@nestjs/swagger';
import type { MechanicLoad } from '../../work-orders/work-order-stats.js';

/** Cuántas órdenes abiertas tiene un mecánico. */
export class DashboardMechanicLoad {
  constructor(load: MechanicLoad) {
    this.usuarioId = load.usuarioId;
    this.nombre = load.nombre;
    this.abiertas = load.abiertas;
  }

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'null en la fila «Sin asignar»',
  })
  usuarioId: string | null;

  @ApiProperty({ example: 'Luis Quispe' })
  nombre: string;

  @ApiProperty({ example: 5 })
  abiertas: number;
}
