import { Prisma } from '../../../generated/prisma/client.js';
import type { WorkOrderItem } from '../../../generated/prisma/client.js';
import { ItemType } from '../../../generated/prisma/enums.js';

// Los montos de una orden salen de sus ítems y no se guardan (el schema lo
// explica: serían dos verdades). Se calculan con Decimal, nunca con `number`:
// 0.1 + 0.2 en coma flotante ya no da 0.3, y un céntimo de diferencia en el
// total es un reclamo en la caja.

/** Lo que hace falta de un ítem para su subtotal. */
export type PricedItem = Pick<WorkOrderItem, 'quantity' | 'unitPrice'>;

/** Lo que hace falta de un ítem para los totales de la orden. */
export type TotaledItem = PricedItem &
  Pick<WorkOrderItem, 'type'> &
  Partial<Pick<WorkOrderItem, 'unitCost'>>;

export type WorkOrderAmounts = {
  /** Mano de obra: la suma de los servicios. */
  labor: Prisma.Decimal;
  /** La suma de los repuestos, a precio de venta. */
  parts: Prisma.Decimal;
  total: Prisma.Decimal;
  /** Lo que costaron los repuestos (su costo congelado al consumirlos). */
  partsCost: Prisma.Decimal;
  /** Lo que se gana con los repuestos: `parts` menos `partsCost`. */
  partsMargin: Prisma.Decimal;
};

/**
 * Cantidad por precio, redondeado a céntimos (medio céntimo hacia arriba):
 * 1.25 L a S/ 38.90 son S/ 48.63. Los totales suman estos subtotales ya
 * redondeados, así que cuadran con lo que se ve línea por línea.
 */
export function itemSubtotal(item: PricedItem): Prisma.Decimal {
  return roundCents(item.quantity.times(item.unitPrice));
}

/** Lo mismo con el costo: lo que costó el repuesto de esa línea. */
function itemCost(item: TotaledItem): Prisma.Decimal {
  return roundCents(item.quantity.times(item.unitCost ?? 0));
}

export function workOrderAmounts(
  items: readonly TotaledItem[],
): WorkOrderAmounts {
  const zero = new Prisma.Decimal(0);
  let labor = zero;
  let parts = zero;
  let partsCost = zero;
  for (const item of items) {
    if (item.type === ItemType.SERVICE) {
      labor = labor.plus(itemSubtotal(item));
    } else {
      parts = parts.plus(itemSubtotal(item));
      partsCost = partsCost.plus(itemCost(item));
    }
  }
  return {
    labor,
    parts,
    total: labor.plus(parts),
    partsCost,
    partsMargin: parts.minus(partsCost),
  };
}

function roundCents(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
