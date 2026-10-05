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
 * Cómo se extiende (módulo de presupuestos): `WAITING_APPROVAL` no se pide a
 * mano. Entra al **enviar** un presupuesto (DIAGNOSIS → WAITING_APPROVAL) y
 * sale al **registrar la decisión** (→ IN_PROGRESS si se aprueba, → DIAGNOSIS
 * si se rechaza). Esas salidas no van en esta tabla, que es la de los botones:
 * las aplica el service de presupuestos dentro de su propia transacción, con
 * su propia regla (solo ADMIN decide, solo un presupuesto PENDING), creando el
 * mismo `WorkOrderEvent` que un cambio manual. Si algún día una de esas salidas
 * también se quiere a mano (por ejemplo, cancelar la espera y volver a
 * diagnóstico), se agrega aquí y en la copia del frontend, con su test.
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
