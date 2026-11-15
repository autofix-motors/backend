import { ApiProperty } from '@nestjs/swagger';
import type { EventoOrden as WorkOrderEventModel } from '../../../../generated/prisma/client.js';
import { EstadoOrden } from '../../../../generated/prisma/enums.js';

/**
 * Un paso de la línea de tiempo, como lo ve el cliente: qué pasó y cuándo. Sin
 * quién lo hizo (el cliente sigue su vehículo, no al personal) y solo los
 * eventos públicos (el filtro lo hace el detalle).
 */
export class PortalEvent {
  constructor(event: WorkOrderEventModel) {
    this.estado = event.estado;
    this.nota = event.nota;
    this.creadoEn = event.creadoEn;
  }

  @ApiProperty({
    enum: EstadoOrden,
    enumName: 'EstadoOrden',
    nullable: true,
    description: 'El estado al que pasó; null si es solo una nota',
  })
  estado: EstadoOrden | null;

  @ApiProperty({ type: String, nullable: true })
  nota: string | null;

  @ApiProperty({ format: 'date-time' })
  creadoEn: Date;
}
