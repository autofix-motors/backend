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
