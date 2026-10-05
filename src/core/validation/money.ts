import { Transform } from 'class-transformer';
import { ValidateBy } from 'class-validator';

/**
 * Los montos en soles de la API van en columnas `Decimal(10, 2)`: hasta ocho
 * dígitos enteros y dos decimales. Llegan como texto («120.50») o como número
 * (120.5) y se validan como texto, que es como los recibe Prisma: así no pasan
 * por un `number` que los redondee en silencio.
 */
const MONEY_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;
const MAX_INTEGER_DIGITS = 8;

/**
 * Por qué el valor no es un monto válido, o `null` si lo es. `label` es el
 * nombre del campo en el mensaje («El precio de mano de obra»).
 */
export function moneyError(value: unknown, label: string): string | null {
  const match = typeof value === 'string' ? MONEY_PATTERN.exec(value) : null;
  if (!match) {
    return `${label} es un monto en soles con hasta 2 decimales, por ejemplo 120.50`;
  }
  const [, sign, integer, decimals = ''] = match;
  if (sign) return `${label} no puede ser negativo`;
  if (decimals.length > 2) return `${label} tiene como máximo 2 decimales`;
  if (integer.replace(/^0+(?=\d)/, '').length > MAX_INTEGER_DIGITS) {
    return `${label} es como máximo 99999999.99`;
  }
  return null;
}

/**
 * Deja el monto como texto antes de validarlo: recorta los espacios y pasa a
 * texto un número finito. Lo demás (un booleano, un objeto) sigue igual y lo
 * rechaza `@IsMoney`.
 */
export const ToMoneyText = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return typeof value === 'string' ? value.trim() : value;
  });

/** Un monto en soles no negativo, con hasta 2 decimales, que cabe en la columna. */
export const IsMoney = (label: string) =>
  ValidateBy({
    name: 'isMoney',
    validator: {
      validate: (value: unknown) => moneyError(value, label) === null,
      defaultMessage: (args) => moneyError(args?.value, label) ?? '',
    },
  });
