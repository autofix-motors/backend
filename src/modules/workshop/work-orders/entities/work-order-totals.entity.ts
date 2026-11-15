import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WorkOrderAmounts } from '../work-order-totals.js';

/**
 * Los montos de la orden, calculados de sus detalles. El costo y el margen de los
 * repuestos solo salen para ADMINISTRADOR.
 */
export class WorkOrderTotals {
  constructor(
    amounts: WorkOrderAmounts,
    { incluirCostos }: { incluirCostos: boolean },
  ) {
    this.manoObra = amounts.manoObra.toFixed(2);
    this.repuestos = amounts.repuestos.toFixed(2);
    this.total = amounts.total.toFixed(2);
    if (incluirCostos) {
      this.costoRepuestos = amounts.costoRepuestos.toFixed(2);
      this.margenRepuestos = amounts.margenRepuestos.toFixed(2);
    }
  }

  @ApiProperty({ example: '180.00', description: 'Mano de obra, en soles' })
  manoObra: string;

  @ApiProperty({ example: '95.50', description: 'Repuestos, en soles' })
  repuestos: string;

  @ApiProperty({ example: '275.50', description: 'Mano de obra más repuestos' })
  total: string;

  @ApiPropertyOptional({
    example: '61.00',
    description: 'Solo para ADMINISTRADOR. Lo que costaron los repuestos',
  })
  costoRepuestos?: string;

  @ApiPropertyOptional({
    example: '34.50',
    description: 'Solo para ADMINISTRADOR. Repuestos menos su costo',
  })
  margenRepuestos?: string;
}
