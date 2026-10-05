import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WorkOrderAmounts } from '../work-order-totals.js';

/**
 * Los montos de la orden, calculados de sus ítems. El costo y el margen de los
 * repuestos solo salen para ADMIN.
 */
export class WorkOrderTotals {
  constructor(
    amounts: WorkOrderAmounts,
    { includeCosts }: { includeCosts: boolean },
  ) {
    this.labor = amounts.labor.toFixed(2);
    this.parts = amounts.parts.toFixed(2);
    this.total = amounts.total.toFixed(2);
    if (includeCosts) {
      this.partsCost = amounts.partsCost.toFixed(2);
      this.partsMargin = amounts.partsMargin.toFixed(2);
    }
  }

  @ApiProperty({ example: '180.00', description: 'Mano de obra, en soles' })
  labor: string;

  @ApiProperty({ example: '95.50', description: 'Repuestos, en soles' })
  parts: string;

  @ApiProperty({ example: '275.50', description: 'Mano de obra más repuestos' })
  total: string;

  @ApiPropertyOptional({
    example: '61.00',
    description: 'Solo para ADMIN. Lo que costaron los repuestos',
  })
  partsCost?: string;

  @ApiPropertyOptional({
    example: '34.50',
    description: 'Solo para ADMIN. Repuestos menos su costo',
  })
  partsMargin?: string;
}
