import { Transform } from 'class-transformer';

/**
 * Las columnas `Decimal(10, 2)` de la base —los montos en soles y las
 * cantidades en la unidad de un producto— admiten hasta ocho dígitos enteros y
 * dos decimales. Los valores llegan como texto («4.50») o como número (4.5) y
 * se validan como texto, que es como los recibe Prisma: así no pasan por un
 * `number` que los redondee en silencio. `money.ts` y `quantity.ts` le ponen
 * nombre y mensajes a cada uso; las reglas viven aquí una sola vez.
 */
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;
const MAX_INTEGER_DIGITS = 8;

/**
 * Por qué el valor no cabe en un `Decimal(10, 2)`, o `null` si cabe. `label`
 * es el nombre del campo en el mensaje («El costo») e `invalidMessage`, el
 * mensaje para lo que ni siquiera tiene forma de número. Sin `signed` exige
 * que no sea negativo, que es lo que piden los montos y casi todas las
 * cantidades; con `signed` acepta el signo (un ajuste de stock que resta).
 */
export function decimalError(
  value: unknown,
  label: string,
  invalidMessage: string,
  { signed = false }: { signed?: boolean } = {},
): string | null {
  const match = typeof value === 'string' ? DECIMAL_PATTERN.exec(value) : null;
  if (!match) return invalidMessage;
  const [, sign, integer, decimals = ''] = match;
  if (sign && !signed) return `${label} no puede ser negativo`;
  if (decimals.length > 2) return `${label} tiene como máximo 2 decimales`;
  if (integer.replace(/^0+(?=\d)/, '').length > MAX_INTEGER_DIGITS) {
    return signed
      ? `${label} va de -99999999.99 a 99999999.99`
      : `${label} es como máximo 99999999.99`;
  }
  return null;
}

/**
 * Deja el valor como texto antes de validarlo: recorta los espacios y pasa a
 * texto un número finito. Lo demás (un booleano, un objeto) sigue igual y lo
 * rechaza el validador.
 */
export const ToDecimalText = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return typeof value === 'string' ? value.trim() : value;
  });
