import { Prisma } from '../../../generated/prisma/client.js';
import type { DetalleOrden } from '../../../generated/prisma/client.js';
import { TipoDetalle } from '../../../generated/prisma/enums.js';

// Los montos de una orden salen de sus detalles y no se guardan (el schema lo
// explica: serían dos verdades). Se calculan con Decimal, nunca con `number`:
// 0.1 + 0.2 en coma flotante ya no da 0.3, y un céntimo de diferencia en el
// total es un reclamo en la caja.

/** Lo que hace falta de un detalle para su subtotal. */
export type PricedItem = Pick<DetalleOrden, 'cantidad' | 'precioUnitario'>;

/** Lo que hace falta de un detalle para los totales de la orden. */
export type TotaledItem = PricedItem &
  Pick<DetalleOrden, 'tipo'> &
  Partial<Pick<DetalleOrden, 'costoUnitario'>>;

export type WorkOrderAmounts = {
  /** Mano de obra: la suma de los servicios. */
  manoObra: Prisma.Decimal;
  /** La suma de los repuestos, a precio de venta. */
  repuestos: Prisma.Decimal;
  total: Prisma.Decimal;
  /** Lo que costaron los repuestos (su costo congelado al consumirlos). */
  costoRepuestos: Prisma.Decimal;
  /** Lo que se gana con los repuestos: `repuestos` menos `costoRepuestos`. */
  margenRepuestos: Prisma.Decimal;
};

/**
 * Cantidad por precio, redondeado a céntimos (medio céntimo hacia arriba):
 * 1.25 L a S/ 38.90 son S/ 48.63. Los totales suman estos subtotales ya
 * redondeados, así que cuadran con lo que se ve línea por línea.
 */
export function itemSubtotal(item: PricedItem): Prisma.Decimal {
  return roundCents(item.cantidad.times(item.precioUnitario));
}

/** Lo mismo con el costo: lo que costó el repuesto de esa línea. */
function itemCost(item: TotaledItem): Prisma.Decimal {
  return roundCents(item.cantidad.times(item.costoUnitario ?? 0));
}

export function workOrderAmounts(
  detalles: readonly TotaledItem[],
): WorkOrderAmounts {
  const zero = new Prisma.Decimal(0);
  let manoObra = zero;
  let repuestos = zero;
  let costoRepuestos = zero;
  for (const item of detalles) {
    if (item.tipo === TipoDetalle.SERVICIO) {
      manoObra = manoObra.plus(itemSubtotal(item));
    } else {
      repuestos = repuestos.plus(itemSubtotal(item));
      costoRepuestos = costoRepuestos.plus(itemCost(item));
    }
  }
  return {
    manoObra,
    repuestos,
    total: manoObra.plus(repuestos),
    costoRepuestos,
    margenRepuestos: repuestos.minus(costoRepuestos),
  };
}

/**
 * Un monto como se escribe en la línea de tiempo: «S/ 35.00». Los detalles y los
 * presupuestos lo usan igual, para que el mismo monto se lea igual.
 */
export function moneyText(amount: Prisma.Decimal): string {
  return `S/ ${amount.toFixed(2)}`;
}

function roundCents(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
