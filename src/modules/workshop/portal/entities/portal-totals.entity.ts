import { ApiProperty } from '@nestjs/swagger';
import type { WorkOrderAmounts } from '../../work-orders/work-order-totals.js';

/** Los montos de la orden que ve el cliente: sin costo ni margen. */
export class PortalTotals {
  constructor(amounts: WorkOrderAmounts) {
    this.labor = amounts.labor.toFixed(2);
    this.parts = amounts.parts.toFixed(2);
    this.total = amounts.total.toFixed(2);
  }

  @ApiProperty({ example: '120.00', description: 'Mano de obra' })
  labor: string;

  @ApiProperty({ example: '330.00', description: 'Repuestos' })
  parts: string;

  @ApiProperty({ example: '450.00' })
  total: string;
}
