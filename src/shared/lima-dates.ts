// El taller trabaja en Lima: «el 4 de octubre» es el día de Lima, no el de
// UTC. Un movimiento registrado el 4 a las 20:00 queda en la base como el 5 a
// la 01:00 UTC, y un filtro que tomara el día en UTC lo mostraría en el día
// siguiente. Perú no usa horario de verano desde 1994, así que la diferencia
// es fija.
const LIMA_OFFSET = '-05:00';

/** El instante en que empieza un día `AAAA-MM-DD` en Lima. */
export function limaDayStart(day: string): Date {
  return new Date(`${day}T00:00:00${LIMA_OFFSET}`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * El filtro de Prisma para un rango de días de Lima, los dos opcionales y los
 * dos inclusivos: `to` abarca su día entero, hasta antes de que empiece el
 * siguiente. `undefined` si no hay rango.
 */
export function limaDayRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: limaDayStart(from) }),
    ...(to && { lt: new Date(limaDayStart(to).getTime() + DAY_MS) }),
  };
}

/**
 * El día de hoy en Lima, `AAAA-MM-DD`. Entre las 19:00 y la medianoche de
 * Lima, UTC ya va en el día siguiente: tomar `toISOString()` a secas daría por
 * vencida una orden prometida para hoy.
 */
export function limaToday(now: Date = new Date()): string {
  return LIMA_DAY.format(now);
}

// «en-CA» escribe la fecha como AAAA-MM-DD.
const LIMA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * El día `days` días después (o antes, con negativo) de `day`, `AAAA-MM-DD`.
 * Se calcula sobre la medianoche UTC del día, que es solo aritmética de
 * calendario: no hay hora de por medio.
 */
export function addDays(day: string, days: number): string {
  const start = new Date(`${day}T00:00:00.000Z`).getTime();
  return new Date(start + days * DAY_MS).toISOString().slice(0, 10);
}

// Los meses, igual que los días, son los de Lima: lo entregado el 1 de
// noviembre a las 00:30 de Lima (31 de octubre a las 05:30 UTC) es de
// noviembre. Se escriben `AAAA-MM`, que se ordena bien como texto.

/** El mes de Lima en que cae un instante, `AAAA-MM`. */
export function limaMonth(date: Date): string {
  return limaToday(date).slice(0, 7);
}

/** El mes `months` meses después (o antes, con negativo) de `month`. */
export function addMonths(month: string, months: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const index = year * 12 + (monthNumber - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

/** El instante en que empieza un mes `AAAA-MM` en Lima. */
export function limaMonthStart(month: string): Date {
  return limaDayStart(`${month}-01`);
}

/** El filtro de Prisma para un mes de Lima entero. */
export function limaMonthRange(month: string): { gte: Date; lt: Date } {
  return {
    gte: limaMonthStart(month),
    lt: limaMonthStart(addMonths(month, 1)),
  };
}

/**
 * Los últimos `count` meses de Lima, del más antiguo al actual (incluido), en
 * el orden en que se dibujan en un gráfico.
 */
export function lastLimaMonths(
  count: number,
  now: Date = new Date(),
): string[] {
  const current = limaMonth(now);
  return Array.from({ length: count }, (_, i) =>
    addMonths(current, i - (count - 1)),
  );
}
