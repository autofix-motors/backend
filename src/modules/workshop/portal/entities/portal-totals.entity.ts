import { ApiProperty } from '@nestjs/swagger';
import type { WorkOrderAmounts } from '../../work-orders/work-order-totals.js';

/** Los montos de la orden que ve el cliente: sin costo ni margen. */
export class PortalTotals {
  constructor(amounts: WorkOrderAmounts) {
    this.manoObra = amounts.manoObra.toFixed(2);
    this.repuestos = amounts.repuestos.toFixed(2);
    this.total = amounts.total.toFixed(2);
  }

  @ApiProperty({ example: '120.00', description: 'Mano de obra' })
  manoObra: string;

  @ApiProperty({ example: '330.00', description: 'Repuestos' })
  repuestos: string;

  @ApiProperty({ example: '450.00' })
  total: string;
}
