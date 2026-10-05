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
