import type { Prisma } from '../../../generated/prisma/client.js';
import { EstadoOrden } from '../../../generated/prisma/enums.js';
import { fromDateColumn } from '../../../shared/date-column.js';
import { addDays, limaMonth } from '../../../shared/lima-dates.js';
import { isOverdue, OPEN_STATUSES } from './work-order-status.js';

// Los números del panel de inicio. Se calculan aquí, en funciones puras, sobre
// lo que el service ya leyó de la base: así cada regla (qué es vencida, a qué
// mes de Lima cae una entrega, cómo se ordena la carga) se prueba sin base.

/** Una orden abierta, con lo que el panel necesita de ella. */
export type OpenOrderSummary = {
  ordenTrabajoId: string;
  numero: number;
  estado: EstadoOrden;
  fechaPrometida: Date | null;
  vehiculo: { placa: string };
  mecanico: { usuarioId: string; nombre: string } | null;
};

export type StatusCount = { estado: EstadoOrden; cantidad: number };

export type MonthTrend = { mes: string; recibidas: number; entregadas: number };

export type MechanicLoad = {
  /** `null` es la fila de las órdenes sin mecánico asignado. */
  usuarioId: string | null;
  nombre: string;
  abiertas: number;
};

export type ServiceCount = { nombre: string; cantidad: number };

export type AttentionOrder = {
  ordenTrabajoId: string;
  numero: number;
  placa: string;
  estado: EstadoOrden;
  /** `AAAA-MM-DD`. */
  fechaPrometida: string;
  vencida: boolean;
};

export type OpenOrderIndicators = {
  abiertas: number;
  esperandoAprobacion: number;
  listas: number;
  vencidas: number;
};

/** Lo que el panel muestra de las órdenes. */
export type WorkOrderDashboardStats = {
  indicadores: OpenOrderIndicators & { entregadasMes: number };
  porEstado: StatusCount[];
  tendencia: MonthTrend[];
  atencion: AttentionOrder[];
  /** Solo si se pidió (lo ve el administrador); si no, `null`. */
  administracion: {
    /** Lo cobrado en las órdenes entregadas en el mes, en soles. */
    valorEntregadoMes: Prisma.Decimal;
    cargaMecanicos: MechanicLoad[];
    serviciosTop: ServiceCount[];
  } | null;
};

/** Cuántos días antes de la fecha prometida una orden pide atención. */
export const ATTENTION_DAYS = 2;
/** Cuántas órdenes salen en «requieren atención». */
export const ATTENTION_LIMIT = 6;
/** Cuántos servicios salen en el ranking del mes. */
export const TOP_SERVICES_LIMIT = 5;
/** El nombre de la fila de las órdenes abiertas sin mecánico. */
export const UNASSIGNED = 'Sin asignar';

/**
 * Los contadores de las órdenes abiertas. «Vencida» es la misma regla que el
 * filtro del listado (`isOverdue`): prometida para antes de hoy en Lima.
 */
export function openOrderIndicators(
  orders: readonly OpenOrderSummary[],
  today: string,
): OpenOrderIndicators {
  return {
    abiertas: orders.length,
    esperandoAprobacion: countWhere(
      orders,
      (o) => o.estado === EstadoOrden.ESPERANDO_APROBACION,
    ),
    listas: countWhere(orders, (o) => o.estado === EstadoOrden.LISTO),
    vencidas: countWhere(orders, (o) =>
      isOverdue(o.estado, promisedDay(o), today),
    ),
  };
}

/**
 * Cuántas órdenes abiertas hay en cada estado abierto, en el orden del flujo y
 * con los que están en 0: el gráfico tiene siempre las mismas barras.
 */
export function statusBreakdown(
  orders: readonly OpenOrderSummary[],
): StatusCount[] {
  return OPEN_STATUSES.map((estado) => ({
    estado,
    cantidad: countWhere(orders, (o) => o.estado === estado),
  }));
}

/**
 * Las órdenes recibidas y entregadas en cada mes de `months` (`AAAA-MM`, de
 * Lima). Un instante fuera de esos meses no cuenta.
 */
export function monthlyTrend(
  months: readonly string[],
  recibidas: readonly Date[],
  entregadas: readonly Date[],
): MonthTrend[] {
  const received = countByMonth(recibidas);
  const delivered = countByMonth(entregadas);
  return months.map((mes) => ({
    mes,
    recibidas: received.get(mes) ?? 0,
    entregadas: delivered.get(mes) ?? 0,
  }));
}

function countByMonth(dates: readonly Date[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const mes = limaMonth(date);
    counts.set(mes, (counts.get(mes) ?? 0) + 1);
  }
  return counts;
}

/**
 * Cuántas órdenes abiertas tiene cada mecánico, de la más cargada a la menos.
 * Las que no tienen mecánico van en su propia fila (`usuarioId: null`), porque
 * son trabajo que todavía nadie hace. Un mecánico sin órdenes no sale.
 */
export function mechanicWorkload(
  orders: readonly OpenOrderSummary[],
): MechanicLoad[] {
  const loads = new Map<string | null, MechanicLoad>();
  for (const { mecanico } of orders) {
    const usuarioId = mecanico?.usuarioId ?? null;
    const load = loads.get(usuarioId) ?? {
      usuarioId,
      nombre: mecanico?.nombre ?? UNASSIGNED,
      abiertas: 0,
    };
    load.abiertas++;
    loads.set(usuarioId, load);
  }
  // A igual carga, por nombre: el orden no cambia entre una carga y otra.
  return [...loads.values()].sort(
    (a, b) => b.abiertas - a.abiertas || a.nombre.localeCompare(b.nombre, 'es'),
  );
}

/**
 * Las órdenes abiertas vencidas o que vencen en `ATTENTION_DAYS` días o menos,
 * de la fecha prometida más antigua a la más nueva. Sin fecha prometida no hay
 * plazo que vigilar.
 */
export function attentionOrders(
  orders: readonly OpenOrderSummary[],
  today: string,
): AttentionOrder[] {
  const limit = addDays(today, ATTENTION_DAYS);
  return orders
    .flatMap((order) => {
      const fechaPrometida = promisedDay(order);
      if (fechaPrometida === null || fechaPrometida > limit) return [];
      return [
        {
          ordenTrabajoId: order.ordenTrabajoId,
          numero: order.numero,
          placa: order.vehiculo.placa,
          estado: order.estado,
          fechaPrometida,
          vencida: isOverdue(order.estado, fechaPrometida, today),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.fechaPrometida.localeCompare(b.fechaPrometida) || a.numero - b.numero,
    )
    .slice(0, ATTENTION_LIMIT);
}

/** Un servicio de una orden, para el ranking. */
export type ServiceLine = {
  servicioId: string | null;
  descripcion: string;
  servicio: { nombre: string } | null;
};

/**
 * Los servicios más hechos: en cuántos detalles de orden aparece cada uno.
 *
 * Se agrupa por `servicioId` y no por la descripción: la descripción se copia
 * del catálogo pero es editable en cada orden («Cambio de aceite 5W-30»), así
 * que agrupar por texto partiría el mismo servicio en varias filas. El nombre
 * es el del catálogo. Un detalle sin servicio (no debería haberlo: el service
 * lo exige) se agrupa por su descripción para no perderlo.
 */
export function topServices(
  lines: readonly ServiceLine[],
  limit = TOP_SERVICES_LIMIT,
): ServiceCount[] {
  const counts = new Map<string, ServiceCount>();
  for (const line of lines) {
    const key = line.servicioId ?? `descripcion:${line.descripcion}`;
    const count = counts.get(key) ?? {
      nombre: line.servicio?.nombre ?? line.descripcion,
      cantidad: 0,
    };
    count.cantidad++;
    counts.set(key, count);
  }
  return [...counts.values()]
    .sort(
      (a, b) =>
        b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'),
    )
    .slice(0, limit);
}

function promisedDay(order: OpenOrderSummary): string | null {
  return order.fechaPrometida && fromDateColumn(order.fechaPrometida);
}

function countWhere<T>(
  items: readonly T[],
  test: (item: T) => boolean,
): number {
  return items.reduce((total, item) => total + (test(item) ? 1 : 0), 0);
}
