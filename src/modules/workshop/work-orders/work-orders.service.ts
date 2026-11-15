import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../../../core/auth/session-user.js';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  EstadoPresupuesto,
  RolUsuario,
  EstadoOrden,
  TipoDetalle,
} from '../../../generated/prisma/enums.js';
import { fromDateColumn, toDateColumn } from '../../../shared/date-column.js';
import {
  lastLimaMonths,
  limaDayRange,
  limaMonth,
  limaMonthRange,
  limaMonthStart,
  limaToday,
} from '../../../shared/lima-dates.js';
import {
  pageWindow,
  paginationMeta,
  type Page,
} from '../../../shared/pagination.js';
import { UsersService } from '../../core/users/users.service.js';
import { CustomersService } from '../../customer/customers/customers.service.js';
import { normalizeIdentifier } from '../../customer/vehicles/vehicle-identifiers.js';
import { VehiclesService } from '../../customer/vehicles/vehicles.service.js';
import type { ChangeWorkOrderStatusDto } from './dto/change-work-order-status.dto.js';
import type { CreateWorkOrderNoteDto } from './dto/create-work-order-note.dto.js';
import type { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import type { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto.js';
import type { UpdateWorkOrderDiagnosisDto } from './dto/update-work-order-diagnosis.dto.js';
import type { UpdateWorkOrderDto } from './dto/update-work-order.dto.js';
import type { WorkOrderWithTimeline } from './entities/work-order-detail.entity.js';
import type { WorkOrderWithRelations } from './entities/work-order.entity.js';
import {
  formatWorkOrderNumber,
  generateTrackingCode,
  parseWorkOrderNumber,
} from './work-order-codes.js';
import {
  canTransition,
  CLOSED_STATUSES,
  isClosed,
  type ClosedStatus,
  WORK_ORDER_STATUS_LABELS,
} from './work-order-status.js';
import {
  attentionOrders,
  mechanicWorkload,
  monthlyTrend,
  openOrderIndicators,
  statusBreakdown,
  topServices,
  type WorkOrderDashboardStats,
} from './work-order-stats.js';
import { workOrderAmounts } from './work-order-totals.js';

const USER_SUMMARY = { select: { usuarioId: true, nombre: true } } as const;

// El vehículo, el cliente y las personas se leen por las relaciones de la
// propia orden: es leer el modelo de este módulo, no consultar las tablas de
// otro por su cuenta.
const WITH_RELATIONS = {
  vehiculo: {
    select: { vehiculoId: true, placa: true, marca: true, modelo: true },
  },
  cliente: { select: { clienteId: true, nombre: true, telefono: true } },
  mecanico: USER_SUMMARY,
  // Para el total del listado alcanza con el tipo, la cantidad y el precio:
  // una consulta más por página (Prisma trae los detalles de todas sus órdenes
  // juntos), sin guardar el total en la orden.
  detalles: { select: { tipo: true, cantidad: true, precioUnitario: true } },
} satisfies Prisma.OrdenTrabajoInclude;

/** La orden completa: lo que responde el detalle y cada cambio. */
export const WITH_TIMELINE = {
  ...WITH_RELATIONS,
  creadoPor: USER_SUMMARY,
  eventos: {
    include: { creadoPor: USER_SUMMARY },
    // Dos eventos del mismo instante salen siempre en el mismo orden.
    orderBy: [{ creadoEn: 'asc' }, { eventoOrdenId: 'asc' }],
  },
  // La unidad del repuesto se lee por la relación del propio detalle, como el
  // vehículo de la orden: dice en qué se mide la cantidad.
  detalles: {
    include: { producto: { select: { unidad: true } } },
    orderBy: [{ creadoEn: 'asc' }, { detalleOrdenId: 'asc' }],
  },
  // El presupuesto es parte de la orden (vive en este módulo): la versión más
  // nueva primero, que es la que importa. Sus detalles, en el orden de la foto.
  presupuestos: {
    include: {
      enviadoPor: USER_SUMMARY,
      decididoPor: USER_SUMMARY,
      detalles: {
        orderBy: [{ creadoEn: 'asc' }, { detallePresupuestoId: 'asc' }],
      },
    },
    orderBy: { version: 'desc' },
  },
} satisfies Prisma.OrdenTrabajoInclude;

/**
 * La orden del listado del portal: lo del listado más si hay un presupuesto
 * esperando la respuesta del cliente (solo su id: lo demás está en el detalle).
 */
const WITH_PENDING_QUOTE = {
  ...WITH_RELATIONS,
  presupuestos: {
    where: { estado: EstadoPresupuesto.PENDIENTE },
    select: { presupuestoId: true },
  },
} satisfies Prisma.OrdenTrabajoInclude;

export type WorkOrderWithPendingQuote = WorkOrderWithRelations & {
  presupuestos: { presupuestoId: string }[];
};

/** Cuántos meses, contando el actual, tiene la tendencia del panel. */
const TREND_MONTHS = 6;

/**
 * Lo que el panel lee de cada orden abierta. El vehículo y el mecánico van por
 * las relaciones de la propia orden, como en el listado.
 */
const OPEN_ORDER_SUMMARY = {
  ordenTrabajoId: true,
  numero: true,
  estado: true,
  fechaPrometida: true,
  vehiculo: { select: { placa: true } },
  mecanico: USER_SUMMARY,
} satisfies Prisma.OrdenTrabajoSelect;

const NOT_FOUND = 'No se encontró la orden de trabajo';
const INACTIVE_CUSTOMER =
  'El dueño del vehículo está inactivo: actívalo antes de registrarle una orden';
const INACTIVE_USER =
  'El usuario está inactivo: no se le pueden asignar órdenes';
const PAST_PROMISED_DATE = 'La fecha prometida no puede ser anterior a hoy';
const CANCEL_REASON = 'Indica el motivo de la cancelación en la nota';
const STALE_STATUS =
  'La orden cambió de estado mientras tanto: vuelve a cargarla';
const RECEIVED_NOTE = 'Vehículo recibido en el taller';

/** Por qué una orden cerrada no se edita. */
const CLOSED_EDIT: Record<ClosedStatus, string> = {
  ENTREGADO: 'La orden ya se entregó: no se puede editar',
  CANCELADO: 'La orden está cancelada: no se puede editar',
};

/**
 * Mientras se puede escribir el diagnóstico: hasta que el trabajo termina.
 * Esperando aprobación no, porque el cliente está evaluando un presupuesto
 * armado sobre ese diagnóstico.
 */
const DIAGNOSIS_STATUSES: readonly EstadoOrden[] = [
  EstadoOrden.RECIBIDO,
  EstadoOrden.EN_DIAGNOSTICO,
  EstadoOrden.EN_REPARACION,
  EstadoOrden.ESPERANDO_REPUESTOS,
];

/**
 * Cuántas veces se sortea otro código de seguimiento si el sorteado ya existe.
 * Con 887 millones de códigos, un choque es rarísimo y dos seguidos,
 * prácticamente imposible: el tope solo evita un bucle infinito.
 */
const TRACKING_CODE_ATTEMPTS = 5;

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
    private readonly customers: CustomersService,
    private readonly users: UsersService,
  ) {}

  /** El listado. El mecánico solo ve las suyas, pida lo que pida. */
  async findAll(
    query: ListWorkOrdersQueryDto,
    actor: SessionUser,
  ): Promise<Page<WorkOrderWithRelations>> {
    const where = workOrdersWhere(
      {
        ...query,
        mecanicoId:
          actor.rol === RolUsuario.MECANICO
            ? actor.usuarioId
            : query.mecanicoId,
      },
      limaToday(),
    );
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ordenTrabajo.findMany({
        where,
        include: WITH_RELATIONS,
        // El desempate por id hace que la paginación sea estable: con varias
        // órdenes de la misma fecha, el orden no cambia entre páginas.
        orderBy: [workOrdersOrderBy(query), { ordenTrabajoId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.ordenTrabajo.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  /**
   * La orden con su línea de tiempo. Para un mecánico que no la tiene
   * asignada, «no existe»: un 403 confirmaría que la orden está ahí.
   */
  async findOne(
    ordenTrabajoId: string,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.prisma.ordenTrabajo.findUnique({
      where: { ordenTrabajoId },
      include: WITH_TIMELINE,
    });
    if (!order || !canSee(order, actor)) {
      throw new NotFoundException(NOT_FOUND);
    }
    return order;
  }

  /**
   * Las órdenes que trajo un cliente, para su portal: en curso (`enCurso`) o
   * anteriores, las más recientes primero. Trae si tienen un presupuesto
   * esperando su respuesta.
   */
  async findAllForCustomer(
    clienteId: string,
    query: {
      enCurso: boolean;
      vehiculoId?: string;
      page: number;
      pageSize: number;
    },
  ): Promise<Page<WorkOrderWithPendingQuote>> {
    const where: Prisma.OrdenTrabajoWhereInput = {
      clienteId,
      vehiculoId: query.vehiculoId,
      estado: query.enCurso
        ? { notIn: [...CLOSED_STATUSES] }
        : { in: [...CLOSED_STATUSES] },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ordenTrabajo.findMany({
        where,
        include: WITH_PENDING_QUOTE,
        orderBy: [{ recibidaEn: 'desc' }, { ordenTrabajoId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.ordenTrabajo.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  /**
   * Una orden del cliente, completa. Si no la trajo él, «no existe» (404),
   * igual que para el mecánico: un 403 confirmaría que está ahí.
   */
  async findOneForCustomer(
    ordenTrabajoId: string,
    clienteId: string,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.prisma.ordenTrabajo.findFirst({
      where: { ordenTrabajoId, clienteId },
      include: WITH_TIMELINE,
    });
    if (!order) throw new NotFoundException(NOT_FOUND);
    return order;
  }

  /**
   * Los números del panel de inicio. Con `mecanicoId`, todo se limita a sus
   * órdenes; con `incluirAdministracion`, suma lo que solo ve el
   * administrador (lo cobrado en el mes, la carga por mecánico y los servicios
   * más hechos), y si no, `administracion` es `null`.
   *
   * Las órdenes abiertas se traen enteras (solo lo que hace falta) y se cuentan
   * en `work-order-stats.ts`: en un taller son decenas, no miles, y así cada
   * indicador sale de una regla pura y probada en vez de una consulta por
   * número. La tendencia trae solo las fechas de los últimos meses, por la
   * misma razón: agruparlas por mes de Lima en SQL obligaría a una consulta
   * cruda con la zona horaria escrita a mano.
   */
  async dashboardStats(
    {
      mecanicoId,
      incluirAdministracion,
    }: { mecanicoId?: string; incluirAdministracion: boolean },
    now: Date = new Date(),
  ): Promise<WorkOrderDashboardStats> {
    const today = limaToday(now);
    const months = lastLimaMonths(TREND_MONTHS, now);
    const currentMonth = limaMonthRange(limaMonth(now));
    const trendStart = limaMonthStart(months[0]);
    // `undefined` no filtra: el administrador ve todas.
    const scope: Prisma.OrdenTrabajoWhereInput = { mecanicoId };
    const delivered: Prisma.OrdenTrabajoWhereInput = {
      ...scope,
      estado: EstadoOrden.ENTREGADO,
    };

    const [openOrders, received, deliveredDates, administracion] =
      await Promise.all([
        this.prisma.ordenTrabajo.findMany({
          where: { ...scope, estado: { notIn: [...CLOSED_STATUSES] } },
          select: OPEN_ORDER_SUMMARY,
        }),
        this.prisma.ordenTrabajo.findMany({
          where: { ...scope, recibidaEn: { gte: trendStart } },
          select: { recibidaEn: true },
        }),
        this.prisma.ordenTrabajo.findMany({
          where: { ...delivered, entregadaEn: { gte: trendStart } },
          select: { entregadaEn: true },
        }),
        incluirAdministracion
          ? this.administrationStats(scope, delivered, currentMonth)
          : null,
      ]);

    const tendencia = monthlyTrend(
      months,
      received.map((order) => order.recibidaEn),
      // Una orden ENTREGADO siempre tiene `entregadaEn` (lo llena el cambio de
      // estado); el filtro solo descarta lo que no debería existir.
      deliveredDates.flatMap((order) => order.entregadaEn ?? []),
    );
    return {
      indicadores: {
        ...openOrderIndicators(openOrders, today),
        // El mes actual de la tendencia: el mismo número en los dos lados.
        entregadasMes: tendencia[tendencia.length - 1].entregadas,
      },
      porEstado: statusBreakdown(openOrders),
      tendencia,
      atencion: attentionOrders(openOrders, today),
      administracion: administracion && {
        ...administracion,
        cargaMecanicos: mechanicWorkload(openOrders),
      },
    };
  }

  /**
   * Lo del panel que solo ve el administrador y necesita los detalles: lo
   * cobrado en las entregas del mes (con la misma suma que el total de cada
   * orden, línea por línea redondeada) y los servicios de las órdenes
   * recibidas en el mes. Las canceladas no cuentan para el ranking: su
   * trabajo no se hizo, o no se cobró.
   */
  private async administrationStats(
    scope: Prisma.OrdenTrabajoWhereInput,
    delivered: Prisma.OrdenTrabajoWhereInput,
    month: { gte: Date; lt: Date },
  ) {
    const [deliveredLines, serviceLines] = await Promise.all([
      this.prisma.detalleOrden.findMany({
        where: { ordenTrabajo: { ...delivered, entregadaEn: month } },
        select: { tipo: true, cantidad: true, precioUnitario: true },
      }),
      this.prisma.detalleOrden.findMany({
        where: {
          tipo: TipoDetalle.SERVICIO,
          ordenTrabajo: {
            ...scope,
            recibidaEn: month,
            estado: { not: EstadoOrden.CANCELADO },
          },
        },
        select: {
          servicioId: true,
          descripcion: true,
          servicio: { select: { nombre: true } },
        },
      }),
    ]);
    return {
      valorEntregadoMes: workOrderAmounts(deliveredLines).total,
      serviciosTop: topServices(serviceLines),
    };
  }

  /**
   * Recibe un vehículo. El cliente se congela del dueño actual, que tiene que
   * estar activo; el vehículo no puede tener otra orden abierta. La orden nace
   * con su evento RECIBIDO en la misma escritura.
   */
  async create(
    dto: CreateWorkOrderDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const vehiculo = await this.vehicles.findOne(dto.vehiculoId);
    const owner = await this.customers.findOne(vehiculo.clienteId);
    if (!owner.activo) throw new BadRequestException(INACTIVE_CUSTOMER);
    if (dto.mecanicoId) await this.activeUser(dto.mecanicoId);
    if (dto.fechaPrometida) assertNotPast(dto.fechaPrometida);
    await this.assertNoOpenOrder(vehiculo.vehiculoId);

    for (let attempt = 1; ; attempt++) {
      try {
        // El evento va anidado en el mismo `create`: Prisma lo escribe en una
        // sola transacción, así que no hay orden sin su «Recibido».
        return await this.prisma.ordenTrabajo.create({
          data: {
            codigoSeguimiento: generateTrackingCode(),
            vehiculoId: vehiculo.vehiculoId,
            clienteId: owner.clienteId,
            mecanicoId: dto.mecanicoId ?? null,
            creadoPorId: actor.usuarioId,
            kilometrajeIngreso: dto.kilometrajeIngreso,
            motivo: dto.motivo,
            fechaPrometida: dto.fechaPrometida
              ? toDateColumn(dto.fechaPrometida)
              : null,
            eventos: {
              create: {
                estado: EstadoOrden.RECIBIDO,
                nota: RECEIVED_NOTE,
                esPublico: true,
                creadoPorId: actor.usuarioId,
              },
            },
          },
          include: WITH_TIMELINE,
        });
      } catch (error) {
        // El único único que se escribe aquí es el código de seguimiento (el
        // número lo pone la base): si chocó, se sortea otro.
        if (!isUniqueViolation(error) || attempt >= TRACKING_CODE_ATTEMPTS) {
          throw error;
        }
      }
    }
  }

  /**
   * Edita los datos del ingreso y el mecánico. Cambiar el mecánico deja un
   * evento interno en la línea de tiempo, en la misma escritura.
   */
  async update(
    ordenTrabajoId: string,
    dto: UpdateWorkOrderDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const current = await this.findOne(ordenTrabajoId, actor);
    assertOpen(current.estado);

    // Solo se valida si cambia: una orden ya vencida se tiene que poder seguir
    // editando sin moverle la fecha.
    const currentDate =
      current.fechaPrometida && fromDateColumn(current.fechaPrometida);
    if (dto.fechaPrometida && dto.fechaPrometida !== currentDate) {
      assertNotPast(dto.fechaPrometida);
    }

    let assignmentNote: string | undefined;
    if (dto.mecanicoId !== undefined && dto.mecanicoId !== current.mecanicoId) {
      assignmentNote = dto.mecanicoId
        ? `Asignada a ${(await this.activeUser(dto.mecanicoId)).nombre}`
        : 'Sin mecánico asignado';
    }

    return this.prisma.ordenTrabajo.update({
      where: { ordenTrabajoId },
      data: {
        kilometrajeIngreso: dto.kilometrajeIngreso,
        motivo: dto.motivo,
        mecanicoId: dto.mecanicoId,
        fechaPrometida:
          dto.fechaPrometida === undefined
            ? undefined
            : dto.fechaPrometida && toDateColumn(dto.fechaPrometida),
        ...(assignmentNote && {
          eventos: {
            create: {
              nota: assignmentNote,
              esPublico: false,
              creadoPorId: actor.usuarioId,
            },
          },
        }),
      },
      include: WITH_TIMELINE,
    });
  }

  async updateDiagnosis(
    ordenTrabajoId: string,
    dto: UpdateWorkOrderDiagnosisDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const current = await this.findOne(ordenTrabajoId, actor);
    if (!DIAGNOSIS_STATUSES.includes(current.estado)) {
      throw new ConflictException(
        `El diagnóstico no se puede cambiar con la orden en «${WORK_ORDER_STATUS_LABELS[current.estado]}»`,
      );
    }
    return this.prisma.ordenTrabajo.update({
      where: { ordenTrabajoId },
      data: { diagnostico: dto.diagnostico },
      include: WITH_TIMELINE,
    });
  }

  /**
   * Lleva la orden a otro estado, según la tabla de `work-order-estado.ts`, y
   * lo deja en la línea de tiempo en la misma escritura. Cancelar exige el
   * motivo (la nota) y lo guarda también en `motivoCancelacion`; entregar llena
   * `entregadaEn`.
   */
  async changeStatus(
    ordenTrabajoId: string,
    dto: ChangeWorkOrderStatusDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const current = await this.findOne(ordenTrabajoId, actor);
    const from = current.estado;
    const to = dto.estado;

    if (!canTransition(from, to, RolUsuario.ADMINISTRADOR)) {
      throw new ConflictException(
        `Una orden en «${WORK_ORDER_STATUS_LABELS[from]}» no puede pasar a «${WORK_ORDER_STATUS_LABELS[to]}»`,
      );
    }
    if (!canTransition(from, to, actor.rol)) {
      throw new ForbiddenException(
        'Solo el administrador entrega o cancela una orden',
      );
    }
    const nota = dto.nota ?? null;
    if (to === EstadoOrden.CANCELADO && !nota) {
      throw new BadRequestException(CANCEL_REASON);
    }

    const now = new Date();
    try {
      return await this.prisma.ordenTrabajo.update({
        // Con el estado leído en el `where`: si otro lo cambió entre la
        // lectura y esta escritura, no se pisa (P2025) y se avisa.
        where: { ordenTrabajoId, estado: from },
        data: {
          estado: to,
          ...(to === EstadoOrden.ENTREGADO && { entregadaEn: now }),
          ...(to === EstadoOrden.CANCELADO && {
            canceladaEn: now,
            motivoCancelacion: nota,
          }),
          eventos: {
            create: {
              estado: to,
              nota,
              esPublico: dto.esPublico ?? true,
              creadoPorId: actor.usuarioId,
              creadoEn: now,
            },
          },
        },
        include: WITH_TIMELINE,
      });
    } catch (error) {
      if (isNotFound(error)) throw new ConflictException(STALE_STATUS);
      throw error;
    }
  }

  /** Una nota en la línea de tiempo, sin cambiar el estado. */
  async addNote(
    ordenTrabajoId: string,
    dto: CreateWorkOrderNoteDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    await this.findOne(ordenTrabajoId, actor);
    return this.prisma.ordenTrabajo.update({
      where: { ordenTrabajoId },
      data: {
        eventos: {
          create: {
            nota: dto.nota,
            esPublico: dto.esPublico,
            creadoPorId: actor.usuarioId,
          },
        },
      },
      include: WITH_TIMELINE,
    });
  }

  /**
   * Borra la orden de verdad: es para la registrada por error. Si ya tiene
   * detalles o presupuestos, es historial (y la base no deja borrarlos):
   * se comprueba antes para decir por qué, y lo que corresponde es cancelarla.
   * Los eventos se van con ella: son de la orden.
   */
  async remove(ordenTrabajoId: string): Promise<void> {
    const order = await this.prisma.ordenTrabajo.findUnique({
      where: { ordenTrabajoId },
      select: {
        _count: {
          select: { detalles: true, presupuestos: true },
        },
      },
    });
    if (!order) throw new NotFoundException(NOT_FOUND);

    const history = describeHistory(order._count);
    if (history) {
      throw new ConflictException(
        `No se puede eliminar: la orden tiene ${history}. Puedes cancelarla`,
      );
    }
    await this.prisma.ordenTrabajo.delete({ where: { ordenTrabajoId } });
  }

  /**
   * El usuario a asignar tiene que existir y estar activo (de cualquier rol:
   * el dueño que trabaja en el taller también puede llevar una orden). Se
   * pregunta a UsersService: este módulo no lee la tabla de usuarios.
   */
  private async activeUser(usuarioId: string) {
    const user = await this.users.findOne(usuarioId);
    if (!user.activo) throw new BadRequestException(INACTIVE_USER);
    return user;
  }

  /**
   * Un vehículo está en el taller una vez a la vez: una segunda orden abierta
   * repartiría el trabajo y los cobros entre dos.
   */
  private async assertNoOpenOrder(vehiculoId: string): Promise<void> {
    const open = await this.prisma.ordenTrabajo.findFirst({
      where: { vehiculoId, estado: { notIn: [...CLOSED_STATUSES] } },
      select: { numero: true },
    });
    if (open) {
      throw new ConflictException(
        `El vehículo ya tiene abierta la orden ${formatWorkOrderNumber(open.numero)}: ciérrala o cancélala antes de registrar otra`,
      );
    }
  }
}

/** El `where` del listado. `today` es el día de Lima, para las vencidas. */
export function workOrdersWhere(
  query: Pick<
    ListWorkOrdersQueryDto,
    | 'search'
    | 'estado'
    | 'mecanicoId'
    | 'vehiculoId'
    | 'clienteId'
    | 'vencidas'
    | 'desde'
    | 'hasta'
  >,
  today: string,
): Prisma.OrdenTrabajoWhereInput {
  return {
    estado: query.estado && { in: query.estado },
    mecanicoId: query.mecanicoId,
    vehiculoId: query.vehiculoId,
    clienteId: query.clienteId,
    recibidaEn: limaDayRange(query.desde, query.hasta),
    // En un AND aparte para no pisar el filtro de estado: los dos se combinan
    // («en reparación» y vencidas).
    ...(query.vencidas !== undefined && {
      AND: [
        query.vencidas ? overdueWhere(today) : { NOT: overdueWhere(today) },
      ],
    }),
    ...(query.search && { OR: searchConditions(query.search) }),
  };
}

/** Vencida: prometida para antes de hoy y todavía en el taller. */
function overdueWhere(today: string): Prisma.OrdenTrabajoWhereInput {
  return {
    fechaPrometida: { lt: toDateColumn(today) },
    estado: { notIn: [...CLOSED_STATUSES] },
  };
}

function searchConditions(search: string): Prisma.OrdenTrabajoWhereInput[] {
  const text = { contains: search, mode: 'insensitive' } as const;
  const conditions: Prisma.OrdenTrabajoWhereInput[] = [
    { cliente: { nombre: text } },
    { codigoSeguimiento: text },
  ];
  // La placa se guarda normalizada: se busca igual, para que «abk-5» encuentre
  // «ABK582». Una búsqueda de solo guiones no busca placas.
  const placa = normalizeIdentifier(search);
  if (placa) conditions.unshift({ vehiculo: { placa: { contains: placa } } });
  const number = parseWorkOrderNumber(search);
  if (number !== undefined) conditions.unshift({ numero: number });
  return conditions;
}

/** El orden del listado. Sin fecha prometida va al final, en los dos sentidos. */
export function workOrdersOrderBy(
  query: Pick<ListWorkOrdersQueryDto, 'ordenarPor' | 'sentido'>,
): Prisma.OrdenTrabajoOrderByWithRelationInput {
  if (query.ordenarPor === 'fechaPrometida') {
    return { fechaPrometida: { sort: query.sentido, nulls: 'last' } };
  }
  return { [query.ordenarPor]: query.sentido };
}

/** El administrador ve todas; el mecánico, las que tiene asignadas. */
function canSee(
  order: { mecanicoId: string | null },
  actor: SessionUser,
): boolean {
  return (
    actor.rol === RolUsuario.ADMINISTRADOR ||
    order.mecanicoId === actor.usuarioId
  );
}

function assertOpen(estado: EstadoOrden): void {
  if (isClosed(estado)) throw new ConflictException(CLOSED_EDIT[estado]);
}

function assertNotPast(fechaPrometida: string): void {
  if (fechaPrometida < limaToday()) {
    throw new BadRequestException(PAST_PROMISED_DATE);
  }
}

/** «2 detalles y 1 presupuesto»; vacío si no tiene nada. */
function describeHistory(counts: {
  detalles: number;
  presupuestos: number;
}): string {
  const repuestos = (
    [
      [counts.detalles, 'detalle', 'detalles'],
      [counts.presupuestos, 'presupuesto', 'presupuestos'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  const last = repuestos.pop();
  return repuestos.length ? `${repuestos.join(', ')} y ${last}` : (last ?? '');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}
