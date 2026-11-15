import { RolUsuario, EstadoOrden } from '../../../generated/prisma/enums.js';

const {
  RECIBIDO,
  EN_DIAGNOSTICO,
  ESPERANDO_APROBACION,
  EN_REPARACION,
  ESPERANDO_REPUESTOS,
  LISTO,
  ENTREGADO,
  CANCELADO,
} = EstadoOrden;

/**
 * A dónde se puede llevar una orden **a mano** (`POST /work-orders/:id/estado`)
 * desde cada estado. Es la única fuente de las reglas: el frontend tiene una
 * copia en `work-orders.schemas.ts` para dibujar solo los botones que la API
 * va a aceptar.
 *
 * `ESPERANDO_APROBACION` no se pide a mano: entra y sale con el presupuesto, por
 * las transiciones de sistema (`SYSTEM_TRANSITIONS`, abajo). Desde ahí, a mano,
 * solo se cancela. Si algún día una de esas salidas también se quiere a mano
 * (por ejemplo, cancelar la espera y volver a diagnóstico), se agrega aquí y
 * en la copia del frontend, con su test.
 */
export const MANUAL_TRANSITIONS: Readonly<
  Record<EstadoOrden, readonly EstadoOrden[]>
> = {
  [RECIBIDO]: [EN_DIAGNOSTICO, EN_REPARACION, CANCELADO],
  [EN_DIAGNOSTICO]: [EN_REPARACION, CANCELADO],
  [ESPERANDO_APROBACION]: [CANCELADO],
  [EN_REPARACION]: [ESPERANDO_REPUESTOS, LISTO, CANCELADO],
  [ESPERANDO_REPUESTOS]: [EN_REPARACION, CANCELADO],
  // Volver a reparación es el retrabajo: el cliente encontró algo al recoger.
  // Cancelar sigue valiendo: el alcance permite cancelar antes de entregar.
  [LISTO]: [ENTREGADO, EN_REPARACION, CANCELADO],
  [ENTREGADO]: [],
  [CANCELADO]: [],
};

/**
 * Los cambios de estado que **no son botones**: los aplica el presupuesto
 * (`WorkOrderQuotesService`), dentro de su transacción y con su regla (solo
 * ADMINISTRADOR, y la decisión solo sobre la versión PENDIENTE), creando el mismo
 * `EventoOrden` que un cambio manual. No van en `MANUAL_TRANSITIONS`
 * porque ahí la orden se mueve sola: «Esperando aprobación» no se elige, se
 * llega enviando el presupuesto, y se sale registrando la respuesta del
 * cliente. El frontend no las copia: no dibuja botones de estado para ellas.
 */
export const SYSTEM_TRANSITIONS = {
  /**
   * Enviar un presupuesto: al terminar el diagnóstico o, si aparece otro
   * problema, a mitad de la reparación (también esperando repuestos).
   */
  PRESUPUESTO_ENVIADO: {
    from: [EN_DIAGNOSTICO, EN_REPARACION, ESPERANDO_REPUESTOS],
    to: ESPERANDO_APROBACION,
  },
  /** El cliente lo aprobó: se repara. */
  PRESUPUESTO_APROBADO: { from: [ESPERANDO_APROBACION], to: EN_REPARACION },
  /**
   * El cliente lo rechazó: la orden vuelve al taller, que ajusta el
   * presupuesto y lo vuelve a enviar, o la cancela.
   */
  PRESUPUESTO_RECHAZADO: { from: [ESPERANDO_APROBACION], to: EN_DIAGNOSTICO },
} as const satisfies Record<
  string,
  { from: readonly EstadoOrden[]; to: EstadoOrden }
>;

export type SystemTransition = keyof typeof SYSTEM_TRANSITIONS;

/** Si la transición de sistema se puede aplicar a una orden en `from`. */
export function canApplySystemTransition(
  transition: SystemTransition,
  from: EstadoOrden,
): boolean {
  const allowed: readonly EstadoOrden[] = SYSTEM_TRANSITIONS[transition].from;
  return allowed.includes(from);
}

/**
 * Los estados a los que el mecánico puede llevar su orden: el trabajo del
 * taller. Entregar y cancelar tocan al cliente (y a la caja), así que son del
 * administrador.
 */
const MECHANIC_TARGETS: ReadonlySet<EstadoOrden> = new Set([
  EN_DIAGNOSTICO,
  EN_REPARACION,
  ESPERANDO_REPUESTOS,
  LISTO,
]);

/** Los estados en que la orden ya terminó: no se edita ni cambia de estado. */
export const CLOSED_STATUSES = [ENTREGADO, CANCELADO] as const;
export type ClosedStatus = (typeof CLOSED_STATUSES)[number];

export function isClosed(estado: EstadoOrden): estado is ClosedStatus {
  return (CLOSED_STATUSES as readonly EstadoOrden[]).includes(estado);
}

/**
 * Los estados de una orden que sigue en el taller, en el orden del enum (el
 * del flujo). Sale de `CLOSED_STATUSES` para que un estado nuevo caiga solo en
 * uno de los dos lados.
 */
export const OPEN_STATUSES: readonly EstadoOrden[] = Object.values(
  EstadoOrden,
).filter((estado) => !isClosed(estado));

/**
 * Mientras se pueden agregar, cambiar o quitar servicios y repuestos: mientras
 * se diagnostica y se repara. Esperando aprobación no, porque el cliente
 * evalúa un presupuesto armado con esos detalles; listo o cerrada, el trabajo ya
 * terminó y lo que se cobra no se mueve.
 */
export const ITEM_STATUSES: readonly EstadoOrden[] = [
  RECIBIDO,
  EN_DIAGNOSTICO,
  EN_REPARACION,
  ESPERANDO_REPUESTOS,
];

export function canChangeItems(estado: EstadoOrden): boolean {
  return ITEM_STATUSES.includes(estado);
}

/** Si `rol` puede llevar a mano una orden de `from` a `to`. */
export function canTransition(
  from: EstadoOrden,
  to: EstadoOrden,
  rol: RolUsuario,
): boolean {
  if (!MANUAL_TRANSITIONS[from].includes(to)) return false;
  return rol === RolUsuario.ADMINISTRADOR || MECHANIC_TARGETS.has(to);
}

/** Cómo se nombra cada estado en los mensajes de la API. */
export const WORK_ORDER_STATUS_LABELS: Readonly<Record<EstadoOrden, string>> = {
  [RECIBIDO]: 'Recibido',
  [EN_DIAGNOSTICO]: 'En diagnóstico',
  [ESPERANDO_APROBACION]: 'Esperando aprobación',
  [EN_REPARACION]: 'En reparación',
  [ESPERANDO_REPUESTOS]: 'Esperando repuestos',
  [LISTO]: 'Listo para recoger',
  [ENTREGADO]: 'Entregado',
  [CANCELADO]: 'Cancelado',
};

/**
 * Si la orden está vencida: se le prometió al cliente para un día que ya pasó
 * (en Lima) y sigue en el taller. El mismo día prometido todavía no vence.
 * Las fechas son `AAAA-MM-DD`, que se comparan bien como texto.
 */
export function isOverdue(
  estado: EstadoOrden,
  fechaPrometida: string | null,
  today: string,
): boolean {
  return fechaPrometida !== null && fechaPrometida < today && !isClosed(estado);
}
