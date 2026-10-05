import { ValidateBy } from 'class-validator';
import { ToDecimalText, decimalError } from './decimal.js';

// Los montos en soles de la API van en columnas `Decimal(10, 2)`: las reglas
// comunes (no negativo, 2 decimales, el tope) están en decimal.ts.

/**
 * Por qué el valor no es un monto válido, o `null` si lo es. `label` es el
 * nombre del campo en el mensaje («El precio de mano de obra»).
 */
export function moneyError(value: unknown, label: string): string | null {
  return decimalError(
    value,
    label,
    `${label} es un monto en soles con hasta 2 decimales, por ejemplo 120.50`,
  );
}

/** Deja el monto como texto antes de validarlo (ver `ToDecimalText`). */
export const ToMoneyText = ToDecimalText;

/** Un monto en soles no negativo, con hasta 2 decimales, que cabe en la columna. */
export const IsMoney = (label: string) =>
  ValidateBy({
    name: 'isMoney',
    validator: {
      validate: (value: unknown) => moneyError(value, label) === null,
      defaultMessage: (args) => moneyError(args?.value, label) ?? '',
    },
  });
