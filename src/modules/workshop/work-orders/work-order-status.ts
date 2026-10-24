import { UserRole, WorkOrderStatus } from '../../../generated/prisma/enums.js';

const {
  RECEIVED,
  DIAGNOSIS,
  WAITING_APPROVAL,
  IN_PROGRESS,
  WAITING_PARTS,
  READY,
  DELIVERED,
  CANCELLED,
} = WorkOrderStatus;

/**
 * A dónde se puede llevar una orden **a mano** (`POST /work-orders/:id/status`)
 * desde cada estado. Es la única fuente de las reglas: el frontend tiene una
 * copia en `work-orders.schemas.ts` para dibujar solo los botones que la API
 * va a aceptar.
 *
 * `WAITING_APPROVAL` no se pide a mano: entra y sale con el presupuesto, por
 * las transiciones de sistema (`SYSTEM_TRANSITIONS`, abajo). Desde ahí, a mano,
 * solo se cancela. Si algún día una de esas salidas también se quiere a mano
 * (por ejemplo, cancelar la espera y volver a diagnóstico), se agrega aquí y
 * en la copia del frontend, con su test.
 */
export const MANUAL_TRANSITIONS: Readonly<
  Record<WorkOrderStatus, readonly WorkOrderStatus[]>
> = {
  [RECEIVED]: [DIAGNOSIS, IN_PROGRESS, CANCELLED],
  [DIAGNOSIS]: [IN_PROGRESS, CANCELLED],
  [WAITING_APPROVAL]: [CANCELLED],
  [IN_PROGRESS]: [WAITING_PARTS, READY, CANCELLED],
  [WAITING_PARTS]: [IN_PROGRESS, CANCELLED],
  // Volver a reparación es el retrabajo: el cliente encontró algo al recoger.
  // Cancelar sigue valiendo: el alcance permite cancelar antes de entregar.
  [READY]: [DELIVERED, IN_PROGRESS, CANCELLED],
  [DELIVERED]: [],
  [CANCELLED]: [],
};

/**
 * Los cambios de estado que **no son botones**: los aplica el presupuesto
 * (`WorkOrderQuotesService`), dentro de su transacción y con su regla (solo
 * ADMIN, y la decisión solo sobre la versión PENDING), creando el mismo
 * `WorkOrderEvent` que un cambio manual. No van en `MANUAL_TRANSITIONS`
 * porque ahí la orden se mueve sola: «Esperando aprobación» no se elige, se
 * llega enviando el presupuesto, y se sale registrando la respuesta del
 * cliente. El frontend no las copia: no dibuja botones de estado para ellas.
 */
export const SYSTEM_TRANSITIONS = {
  /**
   * Enviar un presupuesto: al terminar el diagnóstico o, si aparece otro
   * problema, a mitad de la reparación (también esperando repuestos).
   */
  QUOTE_SENT: {
    from: [DIAGNOSIS, IN_PROGRESS, WAITING_PARTS],
    to: WAITING_APPROVAL,
  },
  /** El cliente lo aprobó: se repara. */
  QUOTE_APPROVED: { from: [WAITING_APPROVAL], to: IN_PROGRESS },
  /**
   * El cliente lo rechazó: la orden vuelve al taller, que ajusta el
   * presupuesto y lo vuelve a enviar, o la cancela.
   */
  QUOTE_REJECTED: { from: [WAITING_APPROVAL], to: DIAGNOSIS },
} as const satisfies Record<
  string,
  { from: readonly WorkOrderStatus[]; to: WorkOrderStatus }
>;

export type SystemTransition = keyof typeof SYSTEM_TRANSITIONS;

/** Si la transición de sistema se puede aplicar a una orden en `from`. */
export function canApplySystemTransition(
  transition: SystemTransition,
  from: WorkOrderStatus,
): boolean {
  const allowed: readonly WorkOrderStatus[] =
    SYSTEM_TRANSITIONS[transition].from;
  return allowed.includes(from);
}

/**
 * Los estados a los que el mecánico puede llevar su orden: el trabajo del
 * taller. Entregar y cancelar tocan al cliente (y a la caja), así que son del
 * administrador.
 */
const MECHANIC_TARGETS: ReadonlySet<WorkOrderStatus> = new Set([
  DIAGNOSIS,
  IN_PROGRESS,
  WAITING_PARTS,
  READY,
]);

/** Los estados en que la orden ya terminó: no se edita ni cambia de estado. */
export const CLOSED_STATUSES = [DELIVERED, CANCELLED] as const;
export type ClosedStatus = (typeof CLOSED_STATUSES)[number];

export function isClosed(status: WorkOrderStatus): status is ClosedStatus {
  return (CLOSED_STATUSES as readonly WorkOrderStatus[]).includes(status);
}

/**
 * Mientras se pueden agregar, cambiar o quitar servicios y repuestos: mientras
 * se diagnostica y se repara. Esperando aprobación no, porque el cliente
 * evalúa un presupuesto armado con esos ítems; listo o cerrada, el trabajo ya
 * terminó y lo que se cobra no se mueve.
 */
export const ITEM_STATUSES: readonly WorkOrderStatus[] = [
  RECEIVED,
  DIAGNOSIS,
  IN_PROGRESS,
  WAITING_PARTS,
];

export function canChangeItems(status: WorkOrderStatus): boolean {
  return ITEM_STATUSES.includes(status);
}

/** Si `role` puede llevar a mano una orden de `from` a `to`. */
export function canTransition(
  from: WorkOrderStatus,
  to: WorkOrderStatus,
  role: UserRole,
): boolean {
  if (!MANUAL_TRANSITIONS[from].includes(to)) return false;
  return role === UserRole.ADMIN || MECHANIC_TARGETS.has(to);
}

/** Cómo se nombra cada estado en los mensajes de la API. */
export const WORK_ORDER_STATUS_LABELS: Readonly<
  Record<WorkOrderStatus, string>
> = {
  [RECEIVED]: 'Recibido',
  [DIAGNOSIS]: 'En diagnóstico',
  [WAITING_APPROVAL]: 'Esperando aprobación',
  [IN_PROGRESS]: 'En reparación',
  [WAITING_PARTS]: 'Esperando repuestos',
  [READY]: 'Listo para recoger',
  [DELIVERED]: 'Entregado',
  [CANCELLED]: 'Cancelado',
};

/**
 * Si la orden está vencida: se le prometió al cliente para un día que ya pasó
 * (en Lima) y sigue en el taller. El mismo día prometido todavía no vence.
 * Las fechas son `AAAA-MM-DD`, que se comparan bien como texto.
 */
export function isOverdue(
  status: WorkOrderStatus,
  promisedDate: string | null,
  today: string,
): boolean {
  return promisedDate !== null && promisedDate < today && !isClosed(status);
}
