import { ApiProperty } from '@nestjs/swagger';
import type { WorkOrderEvent as WorkOrderEventModel } from '../../../../generated/prisma/client.js';
import { WorkOrderStatus } from '../../../../generated/prisma/enums.js';
import {
  WorkOrderUser,
  type WorkOrderUserModel,
} from './work-order-user.entity.js';

export type WorkOrderEventWithAuthor = WorkOrderEventModel & {
  /** Vacío si lo hizo el cliente desde su portal. */
  createdBy: WorkOrderUserModel | null;
};

/** Un evento de la línea de tiempo: un cambio de estado o una nota. */
export class WorkOrderEvent {
  constructor(event: WorkOrderEventWithAuthor) {
    this.workOrderEventId = event.workOrderEventId;
    this.status = event.status;
    this.note = event.note;
    this.isPublic = event.isPublic;
    this.createdBy = event.createdBy && new WorkOrderUser(event.createdBy);
    this.createdAt = event.createdAt;
  }

  @ApiProperty({ format: 'uuid' })
  workOrderEventId: string;

  @ApiProperty({
    enum: WorkOrderStatus,
    enumName: 'WorkOrderStatus',
    nullable: true,
    description: 'El estado al que pasó; null si es solo una nota',
  })
  status: WorkOrderStatus | null;

  @ApiProperty({ type: String, nullable: true })
  note: string | null;

  @ApiProperty({ description: 'Si el cliente lo ve en el seguimiento' })
  isPublic: boolean;

  @ApiProperty({
    type: WorkOrderUser,
    nullable: true,
    description: 'Vacío si lo hizo el cliente desde su portal',
  })
  createdBy: WorkOrderUser | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}
