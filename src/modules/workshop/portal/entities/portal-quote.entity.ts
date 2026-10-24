import { ApiProperty } from '@nestjs/swagger';
import {
  DecisionChannel,
  QuoteStatus,
} from '../../../../generated/prisma/enums.js';
import type { QuoteWithRelations } from '../../work-orders/entities/quote.entity.js';
import { PortalLine } from './portal-line.entity.js';

/**
 * Una versión del presupuesto, como la ve el cliente: el total, sus ítems y su
 * respuesta. Sin quién la envió ni quién registró la respuesta.
 */
export class PortalQuote {
  constructor(quote: QuoteWithRelations) {
    this.quoteId = quote.quoteId;
    this.version = quote.version;
    this.status = quote.status;
    this.total = quote.total.toFixed(2);
    this.sentAt = quote.sentAt;
    this.decidedAt = quote.decidedAt;
    this.decisionChannel = quote.decisionChannel;
    this.decisionNote = quote.decisionNote;
    this.items = quote.items.map((item) => new PortalLine(item));
  }

  @ApiProperty({ format: 'uuid' })
  quoteId: string;

  @ApiProperty({ example: 2 })
  version: number;

  @ApiProperty({ enum: QuoteStatus, enumName: 'QuoteStatus' })
  status: QuoteStatus;

  @ApiProperty({ example: '450.00' })
  total: string;

  @ApiProperty({ format: 'date-time' })
  sentAt: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt: Date | null;

  @ApiProperty({
    enum: DecisionChannel,
    enumName: 'DecisionChannel',
    nullable: true,
  })
  decisionChannel: DecisionChannel | null;

  @ApiProperty({ type: String, nullable: true })
  decisionNote: string | null;

  @ApiProperty({ type: [PortalLine], description: 'Como estaban al enviarlo' })
  items: PortalLine[];
}
