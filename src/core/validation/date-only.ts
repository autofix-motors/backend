import { ValidateBy } from 'class-validator';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Si el valor es un día `AAAA-MM-DD` que existe en el calendario. La forma
 * sola no basta: «2026-02-30» la tiene, y `new Date` lo correría en silencio
 * al 2 de marzo.
 */
export function isDateOnly(value: unknown): value is string {
  const match = typeof value === 'string' ? DATE_ONLY.exec(value) : null;
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Un día sin hora, `AAAA-MM-DD`. `label` es el campo en el mensaje. */
export const IsDateOnly = (label: string) =>
  ValidateBy({
    name: 'isDateOnly',
    validator: {
      validate: isDateOnly,
      defaultMessage: () =>
        `${label} es un día con el formato AAAA-MM-DD, por ejemplo 2026-10-04`,
    },
  });
