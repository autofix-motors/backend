import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../../../core/auth/session-user.js';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  DecisionChannel,
  QuoteStatus,
} from '../../../generated/prisma/enums.js';
import type { CreateQuoteDto } from './dto/create-quote.dto.js';
import type { DecideQuoteDto, QuoteDecision } from './dto/decide-quote.dto.js';
import type { QuoteWithRelations } from './entities/quote.entity.js';
import type { WorkOrderWithTimeline } from './entities/work-order-detail.entity.js';
import {
  canApplySystemTransition,
  SYSTEM_TRANSITIONS,
  type SystemTransition,
  WORK_ORDER_STATUS_LABELS,
} from './work-order-status.js';
import { moneyText, workOrderAmounts } from './work-order-totals.js';
import { WITH_TIMELINE, WorkOrdersService } from './work-orders.service.js';

const QUOTE_NOT_FOUND = 'No se encontró el presupuesto en esta orden';
const NO_ITEMS =
  'Agrega al menos un servicio o repuesto antes de enviar el presupuesto';
const STALE_STATUS =
  'La orden cambió de estado mientras tanto: vuelve a cargarla';
const STALE_QUOTE =
  'El presupuesto cambió mientras tanto: vuelve a cargar la orden';

/** Por qué ya no se puede registrar la respuesta de una versión. */
const ALREADY_DECIDED: Record<
  Exclude<QuoteStatus, 'PENDING'>,
  (version: number) => string
> = {
  APPROVED: (version) =>
    `El presupuesto v${version} ya se registró como aprobado`,
  REJECTED: (version) =>
    `El presupuesto v${version} ya se registró como rechazado`,
  SUPERSEDED: (version) =>
    `El presupuesto v${version} fue reemplazado por una versión más nueva`,
};

const DECISION_TRANSITION: Record<QuoteDecision, SystemTransition> = {
  APPROVED: 'QUOTE_APPROVED',
  REJECTED: 'QUOTE_REJECTED',
};

const DECISION_TEXT: Record<QuoteDecision, string> = {
  APPROVED: 'aprobado',
  REJECTED: 'rechazado',
};

/**
 * Los presupuestos de una orden. Viven en el módulo de órdenes, como sus
 * ítems, porque son parte de la orden: el detalle los lee con su `include`,
 * cada cambio responde la orden completa, y para saber quién ve la orden se
 * necesita su service. Como módulo aparte, `work-orders` lo necesitaría para
 * el detalle y él a `work-orders` para la orden: una dependencia circular.
 *
 * Quién: solo el administrador envía y registra la respuesta (`@Roles` en el
 * controller); el mecánico asignado los ve en el detalle.
 *
 * Estado: enviar y decidir mueven la orden por las transiciones de sistema
 * (`SYSTEM_TRANSITIONS`), no por la tabla de los botones. Cada movimiento
 * escribe con el estado leído en el `where`, dentro de la transacción: si la
 * orden cambió entre medio, nada se guarda y se responde 409.
 */
@Injectable()
export class WorkOrderQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workOrders: WorkOrdersService,
  ) {}

  /**
   * Envía una versión nueva: la foto de los ítems de la orden y su total. La
   * versión PENDING anterior, si la hay, queda SUPERSEDED, y la orden pasa a
   * «Esperando aprobación» con un evento público. Todo en una transacción.
   */
  async send(
    workOrderId: string,
    dto: CreateQuoteDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOne(workOrderId, actor);
    const from = order.status;
    if (!canApplySystemTransition('QUOTE_SENT', from)) {
      throw new ConflictException(
        `No se puede enviar un presupuesto con la orden en «${WORK_ORDER_STATUS_LABELS[from]}»: se envía en diagnóstico, en reparación o esperando repuestos`,
      );
    }
    if (order.items.length === 0) throw new BadRequestException(NO_ITEMS);

    const { to } = SYSTEM_TRANSITIONS.QUOTE_SENT;
    const sentAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Primero el estado, con el leído en el `where`: además de detectar un
      // cambio simultáneo, deja la fila de la orden tomada hasta el final, así
      // que un ítem que se agrega a la vez espera y después falla (la orden
      // ya no está en un estado que acepte ítems). Los ítems que se leen
      // abajo son entonces los definitivos.
      await unlessStale(
        tx.workOrder.update({
          where: { workOrderId, status: from },
          data: { status: to },
          select: { workOrderId: true },
        }),
      );

      const items = await tx.workOrderItem.findMany({
        where: { workOrderId },
        orderBy: [{ createdAt: 'asc' }, { workOrderItemId: 'asc' }],
      });
      // Alguien quitó el último ítem entre la lectura y la transacción.
      if (items.length === 0) throw new BadRequestException(NO_ITEMS);

      const last = await tx.quote.findFirst({
        where: { workOrderId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;
      // Hoy una versión pendiente no convive con el envío de otra (la orden
      // sale de «Esperando aprobación» solo al decidir o cancelar), pero si
      // la hubiera, la nueva la reemplaza: nunca hay dos PENDING.
      await tx.quote.updateMany({
        where: { workOrderId, status: QuoteStatus.PENDING },
        data: { status: QuoteStatus.SUPERSEDED },
      });
      const { total } = workOrderAmounts(items);
      await tx.quote.create({
        data: {
          workOrderId,
          version,
          total,
          sentById: actor.userId,
          sentAt,
          items: {
            // La foto: sin costo (el cliente no lo ve) y sin apuntar al ítem
            // vivo. `QuoteItem` no tiene columna de posición, así que el orden
            // de la orden se conserva con un `createdAt` que avanza un
            // milisegundo por línea.
            create: items.map((item, index) => ({
              type: item.type,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              createdAt: new Date(sentAt.getTime() + index),
            })),
          },
        },
      });

      const sent = `Presupuesto v${version} enviado: ${moneyText(total)}`;
      return tx.workOrder.update({
        where: { workOrderId },
        data: {
          events: {
            create: {
              status: to,
              note: dto.note ? `${sent}\n${dto.note}` : sent,
              isPublic: true,
              createdById: actor.userId,
              createdAt: sentAt,
            },
          },
        },
        include: WITH_TIMELINE,
      });
    });
  }

  /**
   * Registra la respuesta del cliente sobre la versión PENDING, como la
   * cuenta el administrador (por llamada, WhatsApp o en el taller): aprobado
   * lleva la orden a reparación; rechazado, de vuelta a diagnóstico.
   */
  async decide(
    workOrderId: string,
    quoteId: string,
    dto: DecideQuoteDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOne(workOrderId, actor);
    const quote = assertDecidable(order, quoteId, dto.decision);
    return this.applyDecision(order, quote, {
      decision: dto.decision,
      channel: dto.channel,
      note: dto.note ?? null,
      decidedById: actor.userId,
      eventNote: `Presupuesto v${quote.version} ${DECISION_TEXT[dto.decision]}`,
    });
  }

  /**
   * La misma respuesta, dada por el propio cliente desde su portal. Solo
   * sobre una orden suya (si no, 404) y sin autor: el cliente no es un
   * usuario, así que el canal (PORTAL) dice quién respondió.
   */
  async decideByCustomer(
    workOrderId: string,
    quoteId: string,
    input: { decision: QuoteDecision; note?: string | null },
    customerId: string,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOneForCustomer(
      workOrderId,
      customerId,
    );
    const quote = assertDecidable(order, quoteId, input.decision);
    return this.applyDecision(order, quote, {
      decision: input.decision,
      channel: DecisionChannel.PORTAL,
      note: input.note ?? null,
      decidedById: null,
      eventNote: `Presupuesto v${quote.version} ${DECISION_TEXT[input.decision]} por el cliente desde el portal`,
    });
  }

  /**
   * La decisión y el cambio de estado, en una transacción. La decisión
   * (quién, cuándo, por dónde y la nota) se guarda en el presupuesto y el
   * cambio de estado queda en la línea de tiempo, público.
   */
  private applyDecision(
    order: WorkOrderWithTimeline,
    quote: QuoteWithRelations,
    decision: {
      decision: QuoteDecision;
      channel: DecisionChannel;
      note: string | null;
      /** Vacío cuando respondió el cliente desde su portal. */
      decidedById: string | null;
      eventNote: string;
    },
  ): Promise<WorkOrderWithTimeline> {
    const { to } = SYSTEM_TRANSITIONS[DECISION_TRANSITION[decision.decision]];
    const decidedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Con PENDING en el `where`: si otro registró la respuesta entre medio,
      // no se pisa.
      const { count } = await tx.quote.updateMany({
        where: { quoteId: quote.quoteId, status: QuoteStatus.PENDING },
        data: {
          status: decision.decision,
          decidedById: decision.decidedById,
          decidedAt,
          decisionChannel: decision.channel,
          decisionNote: decision.note,
        },
      });
      if (count === 0) throw new ConflictException(STALE_QUOTE);

      return unlessStale(
        tx.workOrder.update({
          where: { workOrderId: order.workOrderId, status: order.status },
          data: {
            status: to,
            events: {
              create: {
                status: to,
                note: decision.eventNote,
                isPublic: true,
                createdById: decision.decidedById,
                createdAt: decidedAt,
              },
            },
          },
          include: WITH_TIMELINE,
        }),
      );
    });
  }
}

/**
 * La versión a responder, si se puede: tiene que ser de esta orden (si no,
 * 404), estar PENDING y la orden seguir esperando aprobación (si no, 409).
 */
function assertDecidable(
  order: WorkOrderWithTimeline,
  quoteId: string,
  decision: QuoteDecision,
): QuoteWithRelations {
  const quote = findQuote(order, quoteId);
  if (quote.status !== QuoteStatus.PENDING) {
    throw new ConflictException(ALREADY_DECIDED[quote.status](quote.version));
  }
  // Una versión pendiente en una orden que ya no espera (la cancelaron
  // mientras esperaba): no hay respuesta que registrar.
  if (!canApplySystemTransition(DECISION_TRANSITION[decision], order.status)) {
    throw new ConflictException(
      `La orden está en «${WORK_ORDER_STATUS_LABELS[order.status]}»: la respuesta del cliente se registra mientras espera aprobación`,
    );
  }
  return quote;
}

/**
 * Una escritura en la orden con el estado leído en el `where`: si otro la
 * movió entre medio, P2025 → 409, y como corre dentro de la transacción, lo
 * demás se deshace.
 */
async function unlessStale<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new ConflictException(STALE_STATUS);
    }
    throw error;
  }
}

/** El presupuesto de esta orden; uno de otra orden, para ella, no existe. */
function findQuote(
  order: WorkOrderWithTimeline,
  quoteId: string,
): QuoteWithRelations {
  const quote = order.quotes.find((candidate) => candidate.quoteId === quoteId);
  if (!quote) throw new NotFoundException(QUOTE_NOT_FOUND);
  return quote;
}
