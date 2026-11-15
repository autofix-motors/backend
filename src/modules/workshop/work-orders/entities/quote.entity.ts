import { ApiProperty } from '@nestjs/swagger';
import type {
  Presupuesto as QuoteModel,
  DetallePresupuesto as QuoteItemModel,
} from '../../../../generated/prisma/client.js';
import {
  CanalDecision,
  EstadoPresupuesto,
} from '../../../../generated/prisma/enums.js';
import { QuoteItem } from './quote-item.entity.js';
import {
  WorkOrderUser,
  type WorkOrderUserModel,
} from './work-order-user.entity.js';

/** El presupuesto como lo lee la orden: con quién lo envió, quién decidió y sus detalles. */
export type QuoteWithRelations = QuoteModel & {
  enviadoPor: WorkOrderUserModel;
  decididoPor: WorkOrderUserModel | null;
  detalles: QuoteItemModel[];
};

/**
 * Una versión del presupuesto de la orden: lo que se le propuso al cliente,
 * congelado al enviarlo, y su respuesta si ya la hubo.
 */
export class Quote {
  constructor(presupuesto: QuoteWithRelations) {
    this.presupuestoId = presupuesto.presupuestoId;
    this.version = presupuesto.version;
    this.estado = presupuesto.estado;
    this.total = presupuesto.total.toFixed(2);
    this.enviadoEn = presupuesto.enviadoEn;
    this.enviadoPor = new WorkOrderUser(presupuesto.enviadoPor);
    this.decididoEn = presupuesto.decididoEn;
    this.decididoPor =
      presupuesto.decididoPor && new WorkOrderUser(presupuesto.decididoPor);
    this.canalDecision = presupuesto.canalDecision;
    this.notaDecision = presupuesto.notaDecision;
    this.detalles = presupuesto.detalles.map((item) => new QuoteItem(item));
  }

  @ApiProperty({ format: 'uuid' })
  presupuestoId: string;

  @ApiProperty({ example: 2, description: '1, 2, 3… dentro de cada orden' })
  version: number;

  @ApiProperty({ enum: EstadoPresupuesto, enumName: 'EstadoPresupuesto' })
  estado: EstadoPresupuesto;

  @ApiProperty({
    example: '450.00',
    description: 'En soles, congelado al enviarlo',
  })
  total: string;

  @ApiProperty({ format: 'date-time' })
  enviadoEn: Date;

  @ApiProperty({ type: WorkOrderUser, description: 'Quién lo envió' })
  enviadoPor: WorkOrderUser;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decididoEn: Date | null;

  @ApiProperty({
    type: WorkOrderUser,
    nullable: true,
    description: 'El administrador que registró la respuesta del cliente',
  })
  decididoPor: WorkOrderUser | null;

  @ApiProperty({
    enum: CanalDecision,
    enumName: 'CanalDecision',
    nullable: true,
  })
  canalDecision: CanalDecision | null;

  @ApiProperty({ type: String, nullable: true })
  notaDecision: string | null;

  @ApiProperty({
    type: [QuoteItem],
    description: 'Los detalles como estaban al enviarlo',
  })
  detalles: QuoteItem[];
}
