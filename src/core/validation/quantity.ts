import { ValidateBy } from 'class-validator';
import { ToDecimalText, decimalError } from './decimal.js';

// Las cantidades en la unidad de un producto (unidades, litros, galones…) van
// en columnas `Decimal(10, 2)`, como los montos: con fracción porque hay
// litros y galones. Las reglas comunes están en decimal.ts.

/**
 * Por qué el valor no es una cantidad válida, o `null` si lo es. `label` es el
 * nombre del campo en el mensaje («El stock mínimo»).
 */
export function quantityError(value: unknown, label: string): string | null {
  return decimalError(
    value,
    label,
    `${label} es una cantidad con hasta 2 decimales, por ejemplo 4.50`,
  );
}

/** Deja la cantidad como texto antes de validarla (ver `ToDecimalText`). */
export const ToQuantityText = ToDecimalText;

/** Una cantidad no negativa, con hasta 2 decimales, que cabe en la columna. */
export const IsQuantity = (label: string) =>
  ValidateBy({
    name: 'isQuantity',
    validator: {
      validate: (value: unknown) => quantityError(value, label) === null,
      defaultMessage: (args) => quantityError(args?.value, label) ?? '',
    },
  });

/**
 * Por qué el valor no es la cantidad de un movimiento de stock, o `null` si lo
 * es. Un movimiento de 0 no mueve nada y solo ensucia el kardex, así que se
 * rechaza. Sin `signed` tiene que ser mayor que 0 (una compra entra); con
 * `signed` lleva su signo (un ajuste suma o resta).
 */
export function movementQuantityError(
  value: unknown,
  label: string,
  { signed }: { signed: boolean },
): string | null {
  // Sin signo, una negativa es lo mismo que un 0: no entra nada.
  const positive = `${label} tiene que ser mayor que 0`;
  if (!signed && typeof value === 'string' && value.startsWith('-')) {
    return positive;
  }
  const error = decimalError(
    value,
    label,
    signed
      ? `${label} es una cantidad con signo y hasta 2 decimales, por ejemplo -2.50`
      : `${label} es una cantidad con hasta 2 decimales, por ejemplo 4.50`,
    { signed },
  );
  if (error) return error;
  // Ya se comprobó la forma: `Number` solo decide si es cero.
  if (Number(value) === 0) {
    return signed
      ? `${label} no puede ser 0: positiva suma al stock y negativa resta`
      : positive;
  }
  return null;
}

/** La cantidad de un movimiento de stock (ver `movementQuantityError`). */
export const IsMovementQuantity = (
  label: string,
  options: { signed: boolean },
) =>
  ValidateBy({
    name: 'isMovementQuantity',
    validator: {
      validate: (value: unknown) =>
        movementQuantityError(value, label, options) === null,
      defaultMessage: (args) =>
        movementQuantityError(args?.value, label, options) ?? '',
    },
  });
