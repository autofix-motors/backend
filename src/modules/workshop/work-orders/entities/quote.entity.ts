import { ApiProperty } from '@nestjs/swagger';
import type {
  Quote as QuoteModel,
  QuoteItem as QuoteItemModel,
} from '../../../../generated/prisma/client.js';
import {
  DecisionChannel,
  QuoteStatus,
} from '../../../../generated/prisma/enums.js';
import { QuoteItem } from './quote-item.entity.js';
import {
  WorkOrderUser,
  type WorkOrderUserModel,
} from './work-order-user.entity.js';

/** El presupuesto como lo lee la orden: con quién lo envió, quién decidió y sus ítems. */
export type QuoteWithRelations = QuoteModel & {
  sentBy: WorkOrderUserModel;
  decidedBy: WorkOrderUserModel | null;
  items: QuoteItemModel[];
};

/**
 * Una versión del presupuesto de la orden: lo que se le propuso al cliente,
 * congelado al enviarlo, y su respuesta si ya la hubo.
 */
export class Quote {
  constructor(quote: QuoteWithRelations) {
    this.quoteId = quote.quoteId;
    this.version = quote.version;
    this.status = quote.status;
    this.total = quote.total.toFixed(2);
    this.sentAt = quote.sentAt;
    this.sentBy = new WorkOrderUser(quote.sentBy);
    this.decidedAt = quote.decidedAt;
    this.decidedBy = quote.decidedBy && new WorkOrderUser(quote.decidedBy);
    this.decisionChannel = quote.decisionChannel;
    this.decisionNote = quote.decisionNote;
    this.items = quote.items.map((item) => new QuoteItem(item));
  }

  @ApiProperty({ format: 'uuid' })
  quoteId: string;

  @ApiProperty({ example: 2, description: '1, 2, 3… dentro de cada orden' })
  version: number;

  @ApiProperty({ enum: QuoteStatus, enumName: 'QuoteStatus' })
  status: QuoteStatus;

  @ApiProperty({
    example: '450.00',
    description: 'En soles, congelado al enviarlo',
  })
  total: string;

  @ApiProperty({ format: 'date-time' })
  sentAt: Date;

  @ApiProperty({ type: WorkOrderUser, description: 'Quién lo envió' })
  sentBy: WorkOrderUser;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  decidedAt: Date | null;

  @ApiProperty({
    type: WorkOrderUser,
    nullable: true,
    description: 'El administrador que registró la respuesta del cliente',
  })
  decidedBy: WorkOrderUser | null;

  @ApiProperty({
    enum: DecisionChannel,
    enumName: 'DecisionChannel',
    nullable: true,
  })
  decisionChannel: DecisionChannel | null;

  @ApiProperty({ type: String, nullable: true })
  decisionNote: string | null;

  @ApiProperty({
    type: [QuoteItem],
    description: 'Los ítems como estaban al enviarlo',
  })
  items: QuoteItem[];
}
