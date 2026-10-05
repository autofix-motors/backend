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
import { UserRole, WorkOrderStatus } from '../../../generated/prisma/enums.js';
import { fromDateColumn, toDateColumn } from '../../../shared/date-column.js';
import { limaDayRange, limaToday } from '../../../shared/lima-dates.js';
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

const USER_SUMMARY = { select: { userId: true, name: true } } as const;

// El vehículo, el cliente y las personas se leen por las relaciones de la
// propia orden: es leer el modelo de este módulo, no consultar las tablas de
// otro por su cuenta.
const WITH_RELATIONS = {
  vehicle: {
    select: { vehicleId: true, plate: true, brand: true, model: true },
  },
  customer: { select: { customerId: true, name: true, phone: true } },
  mechanic: USER_SUMMARY,
  // Para el total del listado alcanza con el tipo, la cantidad y el precio:
  // una consulta más por página (Prisma trae los ítems de todas sus órdenes
  // juntos), sin guardar el total en la orden.
  items: { select: { type: true, quantity: true, unitPrice: true } },
} satisfies Prisma.WorkOrderInclude;

/** La orden completa: lo que responde el detalle y cada cambio. */
export const WITH_TIMELINE = {
  ...WITH_RELATIONS,
  createdBy: USER_SUMMARY,
  events: {
    include: { createdBy: USER_SUMMARY },
    // Dos eventos del mismo instante salen siempre en el mismo orden.
    orderBy: [{ createdAt: 'asc' }, { workOrderEventId: 'asc' }],
  },
  // La unidad del repuesto se lee por la relación del propio ítem, como el
  // vehículo de la orden: dice en qué se mide la cantidad.
  items: {
    include: { product: { select: { unit: true } } },
    orderBy: [{ createdAt: 'asc' }, { workOrderItemId: 'asc' }],
  },
  // El presupuesto es parte de la orden (vive en este módulo): la versión más
  // nueva primero, que es la que importa. Sus ítems, en el orden de la foto.
  quotes: {
    include: {
      sentBy: USER_SUMMARY,
      decidedBy: USER_SUMMARY,
      items: { orderBy: [{ createdAt: 'asc' }, { quoteItemId: 'asc' }] },
    },
    orderBy: { version: 'desc' },
  },
} satisfies Prisma.WorkOrderInclude;

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
  DELIVERED: 'La orden ya se entregó: no se puede editar',
  CANCELLED: 'La orden está cancelada: no se puede editar',
};

/**
 * Mientras se puede escribir el diagnóstico: hasta que el trabajo termina.
 * Esperando aprobación no, porque el cliente está evaluando un presupuesto
 * armado sobre ese diagnóstico.
 */
const DIAGNOSIS_STATUSES: readonly WorkOrderStatus[] = [
  WorkOrderStatus.RECEIVED,
  WorkOrderStatus.DIAGNOSIS,
  WorkOrderStatus.IN_PROGRESS,
  WorkOrderStatus.WAITING_PARTS,
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
        mechanicId:
          actor.role === UserRole.MECHANIC ? actor.userId : query.mechanicId,
      },
      limaToday(),
    );
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workOrder.findMany({
        where,
        include: WITH_RELATIONS,
        // El desempate por id hace que la paginación sea estable: con varias
        // órdenes de la misma fecha, el orden no cambia entre páginas.
        orderBy: [workOrdersOrderBy(query), { workOrderId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  /**
   * La orden con su línea de tiempo. Para un mecánico que no la tiene
   * asignada, «no existe»: un 403 confirmaría que la orden está ahí.
   */
  async findOne(
    workOrderId: string,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const order = await this.prisma.workOrder.findUnique({
      where: { workOrderId },
      include: WITH_TIMELINE,
    });
    if (!order || !canSee(order, actor)) {
      throw new NotFoundException(NOT_FOUND);
    }
    return order;
  }

  /**
   * Recibe un vehículo. El cliente se congela del dueño actual, que tiene que
   * estar activo; el vehículo no puede tener otra orden abierta. La orden nace
   * con su evento RECEIVED en la misma escritura.
   */
  async create(
    dto: CreateWorkOrderDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const vehicle = await this.vehicles.findOne(dto.vehicleId);
    const owner = await this.customers.findOne(vehicle.customerId);
    if (!owner.isActive) throw new BadRequestException(INACTIVE_CUSTOMER);
    if (dto.mechanicId) await this.activeUser(dto.mechanicId);
    if (dto.promisedDate) assertNotPast(dto.promisedDate);
    await this.assertNoOpenOrder(vehicle.vehicleId);

    for (let attempt = 1; ; attempt++) {
      try {
        // El evento va anidado en el mismo `create`: Prisma lo escribe en una
        // sola transacción, así que no hay orden sin su «Recibido».
        return await this.prisma.workOrder.create({
          data: {
            trackingCode: generateTrackingCode(),
            vehicleId: vehicle.vehicleId,
            customerId: owner.customerId,
            mechanicId: dto.mechanicId ?? null,
            createdById: actor.userId,
            mileageIn: dto.mileageIn,
            reason: dto.reason,
            promisedDate: dto.promisedDate
              ? toDateColumn(dto.promisedDate)
              : null,
            events: {
              create: {
                status: WorkOrderStatus.RECEIVED,
                note: RECEIVED_NOTE,
                isPublic: true,
                createdById: actor.userId,
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
    workOrderId: string,
    dto: UpdateWorkOrderDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const current = await this.findOne(workOrderId, actor);
    assertOpen(current.status);

    // Solo se valida si cambia: una orden ya vencida se tiene que poder seguir
    // editando sin moverle la fecha.
    const currentDate =
      current.promisedDate && fromDateColumn(current.promisedDate);
    if (dto.promisedDate && dto.promisedDate !== currentDate) {
      assertNotPast(dto.promisedDate);
    }

    let assignmentNote: string | undefined;
    if (dto.mechanicId !== undefined && dto.mechanicId !== current.mechanicId) {
      assignmentNote = dto.mechanicId
        ? `Asignada a ${(await this.activeUser(dto.mechanicId)).name}`
        : 'Sin mecánico asignado';
    }

    return this.prisma.workOrder.update({
      where: { workOrderId },
      data: {
        mileageIn: dto.mileageIn,
        reason: dto.reason,
        mechanicId: dto.mechanicId,
        promisedDate:
          dto.promisedDate === undefined
            ? undefined
            : dto.promisedDate && toDateColumn(dto.promisedDate),
        ...(assignmentNote && {
          events: {
            create: {
              note: assignmentNote,
              isPublic: false,
              createdById: actor.userId,
            },
          },
        }),
      },
      include: WITH_TIMELINE,
    });
  }

  async updateDiagnosis(
    workOrderId: string,
    dto: UpdateWorkOrderDiagnosisDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const current = await this.findOne(workOrderId, actor);
    if (!DIAGNOSIS_STATUSES.includes(current.status)) {
      throw new ConflictException(
        `El diagnóstico no se puede cambiar con la orden en «${WORK_ORDER_STATUS_LABELS[current.status]}»`,
      );
    }
    return this.prisma.workOrder.update({
      where: { workOrderId },
      data: { diagnosis: dto.diagnosis },
      include: WITH_TIMELINE,
    });
  }

  /**
   * Lleva la orden a otro estado, según la tabla de `work-order-status.ts`, y
   * lo deja en la línea de tiempo en la misma escritura. Cancelar exige el
   * motivo (la nota) y lo guarda también en `cancelReason`; entregar llena
   * `deliveredAt`.
   */
  async changeStatus(
    workOrderId: string,
    dto: ChangeWorkOrderStatusDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    const current = await this.findOne(workOrderId, actor);
    const from = current.status;
    const to = dto.status;

    if (!canTransition(from, to, UserRole.ADMIN)) {
      throw new ConflictException(
        `Una orden en «${WORK_ORDER_STATUS_LABELS[from]}» no puede pasar a «${WORK_ORDER_STATUS_LABELS[to]}»`,
      );
    }
    if (!canTransition(from, to, actor.role)) {
      throw new ForbiddenException(
        'Solo el administrador entrega o cancela una orden',
      );
    }
    const note = dto.note ?? null;
    if (to === WorkOrderStatus.CANCELLED && !note) {
      throw new BadRequestException(CANCEL_REASON);
    }

    const now = new Date();
    try {
      return await this.prisma.workOrder.update({
        // Con el estado leído en el `where`: si otro lo cambió entre la
        // lectura y esta escritura, no se pisa (P2025) y se avisa.
        where: { workOrderId, status: from },
        data: {
          status: to,
          ...(to === WorkOrderStatus.DELIVERED && { deliveredAt: now }),
          ...(to === WorkOrderStatus.CANCELLED && {
            cancelledAt: now,
            cancelReason: note,
          }),
          events: {
            create: {
              status: to,
              note,
              isPublic: dto.isPublic ?? true,
              createdById: actor.userId,
              createdAt: now,
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
    workOrderId: string,
    dto: CreateWorkOrderNoteDto,
    actor: SessionUser,
  ): Promise<WorkOrderWithTimeline> {
    await this.findOne(workOrderId, actor);
    return this.prisma.workOrder.update({
      where: { workOrderId },
      data: {
        events: {
          create: {
            note: dto.note,
            isPublic: dto.isPublic,
            createdById: actor.userId,
          },
        },
      },
      include: WITH_TIMELINE,
    });
  }

  /**
   * Borra la orden de verdad: es para la registrada por error. Si ya tiene
   * ítems, presupuestos o pagos, es historial (y la base no deja borrarlos):
   * se comprueba antes para decir por qué, y lo que corresponde es cancelarla.
   * Los eventos se van con ella: son de la orden.
   */
  async remove(workOrderId: string): Promise<void> {
    const order = await this.prisma.workOrder.findUnique({
      where: { workOrderId },
      select: {
        _count: { select: { items: true, quotes: true, payments: true } },
      },
    });
    if (!order) throw new NotFoundException(NOT_FOUND);

    const history = describeHistory(order._count);
    if (history) {
      throw new ConflictException(
        `No se puede eliminar: la orden tiene ${history}. Puedes cancelarla`,
      );
    }
    await this.prisma.workOrder.delete({ where: { workOrderId } });
  }

  /**
   * El usuario a asignar tiene que existir y estar activo (de cualquier rol:
   * el dueño que trabaja en el taller también puede llevar una orden). Se
   * pregunta a UsersService: este módulo no lee la tabla de usuarios.
   */
  private async activeUser(userId: string) {
    const user = await this.users.findOne(userId);
    if (!user.isActive) throw new BadRequestException(INACTIVE_USER);
    return user;
  }

  /**
   * Un vehículo está en el taller una vez a la vez: una segunda orden abierta
   * repartiría el trabajo y los cobros entre dos.
   */
  private async assertNoOpenOrder(vehicleId: string): Promise<void> {
    const open = await this.prisma.workOrder.findFirst({
      where: { vehicleId, status: { notIn: [...CLOSED_STATUSES] } },
      select: { number: true },
    });
    if (open) {
      throw new ConflictException(
        `El vehículo ya tiene abierta la orden ${formatWorkOrderNumber(open.number)}: ciérrala o cancélala antes de registrar otra`,
      );
    }
  }
}

/** El `where` del listado. `today` es el día de Lima, para las vencidas. */
export function workOrdersWhere(
  query: Pick<
    ListWorkOrdersQueryDto,
    | 'search'
    | 'status'
    | 'mechanicId'
    | 'vehicleId'
    | 'customerId'
    | 'overdue'
    | 'from'
    | 'to'
  >,
  today: string,
): Prisma.WorkOrderWhereInput {
  return {
    status: query.status && { in: query.status },
    mechanicId: query.mechanicId,
    vehicleId: query.vehicleId,
    customerId: query.customerId,
    receivedAt: limaDayRange(query.from, query.to),
    // En un AND aparte para no pisar el filtro de estado: los dos se combinan
    // («en reparación» y vencidas).
    ...(query.overdue !== undefined && {
      AND: [query.overdue ? overdueWhere(today) : { NOT: overdueWhere(today) }],
    }),
    ...(query.search && { OR: searchConditions(query.search) }),
  };
}

/** Vencida: prometida para antes de hoy y todavía en el taller. */
function overdueWhere(today: string): Prisma.WorkOrderWhereInput {
  return {
    promisedDate: { lt: toDateColumn(today) },
    status: { notIn: [...CLOSED_STATUSES] },
  };
}

function searchConditions(search: string): Prisma.WorkOrderWhereInput[] {
  const text = { contains: search, mode: 'insensitive' } as const;
  const conditions: Prisma.WorkOrderWhereInput[] = [
    { customer: { name: text } },
    { trackingCode: text },
  ];
  // La placa se guarda normalizada: se busca igual, para que «abk-5» encuentre
  // «ABK582». Una búsqueda de solo guiones no busca placas.
  const plate = normalizeIdentifier(search);
  if (plate) conditions.unshift({ vehicle: { plate: { contains: plate } } });
  const number = parseWorkOrderNumber(search);
  if (number !== undefined) conditions.unshift({ number });
  return conditions;
}

/** El orden del listado. Sin fecha prometida va al final, en los dos sentidos. */
export function workOrdersOrderBy(
  query: Pick<ListWorkOrdersQueryDto, 'sortBy' | 'sortOrder'>,
): Prisma.WorkOrderOrderByWithRelationInput {
  if (query.sortBy === 'promisedDate') {
    return { promisedDate: { sort: query.sortOrder, nulls: 'last' } };
  }
  return { [query.sortBy]: query.sortOrder };
}

/** El administrador ve todas; el mecánico, las que tiene asignadas. */
function canSee(
  order: { mechanicId: string | null },
  actor: SessionUser,
): boolean {
  return actor.role === UserRole.ADMIN || order.mechanicId === actor.userId;
}

function assertOpen(status: WorkOrderStatus): void {
  if (isClosed(status)) throw new ConflictException(CLOSED_EDIT[status]);
}

function assertNotPast(promisedDate: string): void {
  if (promisedDate < limaToday()) {
    throw new BadRequestException(PAST_PROMISED_DATE);
  }
}

/** «2 ítems, 1 presupuesto y 1 pago»; vacío si no tiene nada. */
function describeHistory(counts: {
  items: number;
  quotes: number;
  payments: number;
}): string {
  const parts = (
    [
      [counts.items, 'ítem', 'ítems'],
      [counts.quotes, 'presupuesto', 'presupuestos'],
      [counts.payments, 'pago', 'pagos'],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  const last = parts.pop();
  return parts.length ? `${parts.join(', ')} y ${last}` : (last ?? '');
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
