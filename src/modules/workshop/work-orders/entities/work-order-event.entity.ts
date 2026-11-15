import { ApiProperty } from '@nestjs/swagger';
import type { EventoOrden as WorkOrderEventModel } from '../../../../generated/prisma/client.js';
import { EstadoOrden } from '../../../../generated/prisma/enums.js';
import {
  WorkOrderUser,
  type WorkOrderUserModel,
} from './work-order-user.entity.js';

export type WorkOrderEventWithAuthor = WorkOrderEventModel & {
  /** Vacío si lo hizo el cliente desde su portal. */
  creadoPor: WorkOrderUserModel | null;
};

/** Un evento de la línea de tiempo: un cambio de estado o una nota. */
export class WorkOrderEvent {
  constructor(event: WorkOrderEventWithAuthor) {
    this.eventoOrdenId = event.eventoOrdenId;
    this.estado = event.estado;
    this.nota = event.nota;
    this.esPublico = event.esPublico;
    this.creadoPor = event.creadoPor && new WorkOrderUser(event.creadoPor);
    this.creadoEn = event.creadoEn;
  }

  @ApiProperty({ format: 'uuid' })
  eventoOrdenId: string;

  @ApiProperty({
    enum: EstadoOrden,
    enumName: 'EstadoOrden',
    nullable: true,
    description: 'El estado al que pasó; null si es solo una nota',
  })
  estado: EstadoOrden | null;

  @ApiProperty({ type: String, nullable: true })
  nota: string | null;

  @ApiProperty({ description: 'Si el cliente lo ve en el seguimiento' })
  esPublico: boolean;

  @ApiProperty({
    type: WorkOrderUser,
    nullable: true,
    description: 'Vacío si lo hizo el cliente desde su portal',
  })
  creadoPor: WorkOrderUser | null;

  @ApiProperty({ format: 'date-time' })
  creadoEn: Date;
}
