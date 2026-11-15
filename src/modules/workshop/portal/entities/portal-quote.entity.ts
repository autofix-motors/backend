import { ApiProperty } from '@nestjs/swagger';
import {
  CanalDecision,
  EstadoPresupuesto,
} from '../../../../generated/prisma/enums.js';
import type { QuoteWithRelations } from '../../work-orders/entities/quote.entity.js';
import { PortalLine } from './portal-line.entity.js';

/**
 * Una versión del presupuesto, como la ve el cliente: el total, sus detalles y su
 * respuesta. Sin quién la envió ni quién registró la respuesta.
 */
export class PortalQuote {
  constructor(presupuesto: QuoteWithRelations) {
    this.presupuestoId = presupuesto.presupuestoId;
    this.version = presupuesto.version;
    this.estado = presupuesto.estado;
    this.total = presupuesto.total.toFixed(2);
    this.enviadoEn = presupuesto.enviadoEn;
    this.decididoEn = presupuesto.decididoEn;
    this.canalDecision = presupuesto.canalDecision;
    this.notaDecision = presupuesto.notaDecision;
    this.detalles = presupuesto.detalles.map((item) => new PortalLine(item));
  }

  @ApiProperty({ format: 'uuid' })
  presupuestoId: string;

  @ApiProperty({ example: 2 })
  version: number;

  @ApiProperty({ enum: EstadoPresupuesto, enumName: 'EstadoPresupuesto' })
  estado: EstadoPresupuesto;

  @ApiProperty({ example: '450.00' })
  total: string;

  @ApiProperty({ format: 'date-time' })
  enviadoEn: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decididoEn: Date | null;

  @ApiProperty({
    enum: CanalDecision,
    enumName: 'CanalDecision',
    nullable: true,
  })
  canalDecision: CanalDecision | null;

  @ApiProperty({ type: String, nullable: true })
  notaDecision: string | null;

  @ApiProperty({ type: [PortalLine], description: 'Como estaban al enviarlo' })
  detalles: PortalLine[];
}
