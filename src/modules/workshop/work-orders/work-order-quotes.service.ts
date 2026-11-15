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
  CanalDecision,
  EstadoPresupuesto,
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
  Exclude<EstadoPresupuesto, 'PENDIENTE'>,
  (version: number) => string
> = {
  APROBADO: (version) =>
    `El presupuesto v${version} ya se registró como aprobado`,
  RECHAZADO: (version) =>
    `El presupuesto v${version} ya se registró como rechazado`,
  REEMPLAZADO: (version) =>
    `El presupuesto v${version} fue reemplazado por una versión más nueva`,
};

const DECISION_TRANSITION: Record<QuoteDecision, SystemTransition> = {
  APROBADO: 'PRESUPUESTO_APROBADO',
  RECHAZADO: 'PRESUPUESTO_RECHAZADO',
};

const DECISION_TEXT: Record<QuoteDecision, string> = {
  APROBADO: 'aprobado',
  RECHAZADO: 'rechazado',
};

/**
 * Los presupuestos de una orden. Viven en el módulo de órdenes, como sus
 * detalles, porque son parte de la orden: el detalle los lee con su `include`,
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
   * Envía una versión nueva: la foto de los detalles de la orden y su total. La
   * versión PENDIENTE anterior, si la hay, queda REEMPLAZADO, y la orden pasa a
   * «Esperando aprobación» con un evento público. Todo en una transacción.
   */
  async send(
    ordenTrabajoId: string,
    dto: CreateQuoteDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOne(ordenTrabajoId, actor);
    const from = order.estado;
    if (!canApplySystemTransition('PRESUPUESTO_ENVIADO', from)) {
      throw new ConflictException(
        `No se puede enviar un presupuesto con la orden en «${WORK_ORDER_STATUS_LABELS[from]}»: se envía en diagnóstico, en reparación o esperando repuestos`,
      );
    }
    if (order.detalles.length === 0) throw new BadRequestException(NO_ITEMS);

    const { to } = SYSTEM_TRANSITIONS.PRESUPUESTO_ENVIADO;
    const enviadoEn = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Primero el estado, con el leído en el `where`: además de detectar un
      // cambio simultáneo, deja la fila de la orden tomada hasta el final, así
      // que un detalle que se agrega a la vez espera y después falla (la orden
      // ya no está en un estado que acepte detalles). Los detalles que se leen
      // abajo son entonces los definitivos.
      await unlessStale(
        tx.ordenTrabajo.update({
          where: { ordenTrabajoId, estado: from },
          data: { estado: to },
          select: { ordenTrabajoId: true },
        }),
      );

      const detalles = await tx.detalleOrden.findMany({
        where: { ordenTrabajoId },
        orderBy: [{ creadoEn: 'asc' }, { detalleOrdenId: 'asc' }],
      });
      // Alguien quitó el último detalle entre la lectura y la transacción.
      if (detalles.length === 0) throw new BadRequestException(NO_ITEMS);

      const last = await tx.presupuesto.findFirst({
        where: { ordenTrabajoId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;
      // Hoy una versión pendiente no convive con el envío de otra (la orden
      // sale de «Esperando aprobación» solo al decidir o cancelar), pero si
      // la hubiera, la nueva la reemplaza: nunca hay dos PENDIENTE.
      await tx.presupuesto.updateMany({
        where: { ordenTrabajoId, estado: EstadoPresupuesto.PENDIENTE },
        data: { estado: EstadoPresupuesto.REEMPLAZADO },
      });
      const { total } = workOrderAmounts(detalles);
      await tx.presupuesto.create({
        data: {
          ordenTrabajoId,
          version,
          total,
          enviadoPorId: actor.usuarioId,
          enviadoEn,
          detalles: {
            // La foto: sin costo (el cliente no lo ve) y sin apuntar al detalle
            // vivo. `DetallePresupuesto` no tiene columna de posición, así que el orden
            // de la orden se conserva con un `creadoEn` que avanza un
            // milisegundo por línea.
            create: detalles.map((item, index) => ({
              tipo: item.tipo,
              descripcion: item.descripcion,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              creadoEn: new Date(enviadoEn.getTime() + index),
            })),
          },
        },
      });

      const sent = `Presupuesto v${version} enviado: ${moneyText(total)}`;
      return tx.ordenTrabajo.update({
        where: { ordenTrabajoId },
        data: {
          eventos: {
            create: {
              estado: to,
              nota: dto.nota ? `${sent}\n${dto.nota}` : sent,
              esPublico: true,
              creadoPorId: actor.usuarioId,
              creadoEn: enviadoEn,
            },
          },
        },
        include: WITH_TIMELINE,
      });
    });
  }

  /**
   * Registra la respuesta del cliente sobre la versión PENDIENTE, como la
   * cuenta el administrador (por llamada, WhatsApp o en el taller): aprobado
   * lleva la orden a reparación; rechazado, de vuelta a diagnóstico.
   */
  async decide(
    ordenTrabajoId: string,
    presupuestoId: string,
    dto: DecideQuoteDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOne(ordenTrabajoId, actor);
    const presupuesto = assertDecidable(order, presupuestoId, dto.decision);
    return this.applyDecision(order, presupuesto, {
      decision: dto.decision,
      canal: dto.canal,
      nota: dto.nota ?? null,
      decididoPorId: actor.usuarioId,
      notaEvento: `Presupuesto v${presupuesto.version} ${DECISION_TEXT[dto.decision]}`,
    });
  }

  /**
   * La misma respuesta, dada por el propio cliente desde su portal. Solo
   * sobre una orden suya (si no, 404) y sin autor: el cliente no es un
   * usuario, así que el canal (PORTAL) dice quién respondió.
   */
  async decideByCustomer(
    ordenTrabajoId: string,
    presupuestoId: string,
    input: { decision: QuoteDecision; nota?: string | null },
    clienteId: string,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.workOrders.findOneForCustomer(
      ordenTrabajoId,
      clienteId,
    );
    const presupuesto = assertDecidable(order, presupuestoId, input.decision);
    return this.applyDecision(order, presupuesto, {
      decision: input.decision,
      canal: CanalDecision.PORTAL,
      nota: input.nota ?? null,
      decididoPorId: null,
      notaEvento: `Presupuesto v${presupuesto.version} ${DECISION_TEXT[input.decision]} por el cliente desde el portal`,
    });
  }

  /**
   * La decisión y el cambio de estado, en una transacción. La decisión
   * (quién, cuándo, por dónde y la nota) se guarda en el presupuesto y el
   * cambio de estado queda en la línea de tiempo, público.
   */
  private applyDecision(
    order: WorkOrderWithTimeline,
    presupuesto: QuoteWithRelations,
    decision: {
      decision: QuoteDecision;
      canal: CanalDecision;
      nota: string | null;
      /** Vacío cuando respondió el cliente desde su portal. */
      decididoPorId: string | null;
      notaEvento: string;
    },
  ): Promise<WorkOrderWithTimeline> {
    const { to } = SYSTEM_TRANSITIONS[DECISION_TRANSITION[decision.decision]];
    const decididoEn = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Con PENDIENTE en el `where`: si otro registró la respuesta entre medio,
      // no se pisa.
      const { count } = await tx.presupuesto.updateMany({
        where: {
          presupuestoId: presupuesto.presupuestoId,
          estado: EstadoPresupuesto.PENDIENTE,
        },
        data: {
          estado: decision.decision,
          decididoPorId: decision.decididoPorId,
          decididoEn,
          canalDecision: decision.canal,
          notaDecision: decision.nota,
        },
      });
      if (count === 0) throw new ConflictException(STALE_QUOTE);

      return unlessStale(
        tx.ordenTrabajo.update({
          where: { ordenTrabajoId: order.ordenTrabajoId, estado: order.estado },
          data: {
            estado: to,
            eventos: {
              create: {
                estado: to,
                nota: decision.notaEvento,
                esPublico: true,
                creadoPorId: decision.decididoPorId,
                creadoEn: decididoEn,
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
 * 404), estar PENDIENTE y la orden seguir esperando aprobación (si no, 409).
 */
function assertDecidable(
  order: WorkOrderWithTimeline,
  presupuestoId: string,
  decision: QuoteDecision,
): QuoteWithRelations {
  const presupuesto = findQuote(order, presupuestoId);
  if (presupuesto.estado !== EstadoPresupuesto.PENDIENTE) {
    throw new ConflictException(
      ALREADY_DECIDED[presupuesto.estado](presupuesto.version),
    );
  }
  // Una versión pendiente en una orden que ya no espera (la cancelaron
  // mientras esperaba): no hay respuesta que registrar.
  if (!canApplySystemTransition(DECISION_TRANSITION[decision], order.estado)) {
    throw new ConflictException(
      `La orden está en «${WORK_ORDER_STATUS_LABELS[order.estado]}»: la respuesta del cliente se registra mientras espera aprobación`,
    );
  }
  return presupuesto;
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
  presupuestoId: string,
): QuoteWithRelations {
  const presupuesto = order.presupuestos.find(
    (candidate) => candidate.presupuestoId === presupuestoId,
  );
  if (!presupuesto) throw new NotFoundException(QUOTE_NOT_FOUND);
  return presupuesto;
}
