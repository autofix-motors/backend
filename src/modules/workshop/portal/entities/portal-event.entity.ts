import { ApiProperty } from '@nestjs/swagger';
import type { WorkOrderEvent as WorkOrderEventModel } from '../../../../generated/prisma/client.js';
import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';

/**
 * Un paso de la línea de tiempo, como lo ve el cliente: qué pasó y cuándo. Sin
 * quién lo hizo (el cliente sigue su vehículo, no al personal) y solo los
 * eventos públicos (el filtro lo hace el detalle).
 */
export class PortalEvent {
  constructor(event: WorkOrderEventModel) {
    this.status = event.status;
    this.note = event.note;
    this.createdAt = event.createdAt;
  }

  @ApiProperty({
    enum: WorkOrderStatus,
    enumName: 'WorkOrderStatus',
    nullable: true,
    description: 'El estado al que pasó; null si es solo una nota',
  })
  status: WorkOrderStatus | null;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}
