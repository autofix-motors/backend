// Una columna `@db.Date` guarda un día sin hora. Prisma la lee y la escribe
// como un `Date` a la medianoche UTC, así que el día se pasa por UTC en los
// dos sentidos: con la hora local, «2026-10-08» volvería como el 7 en Lima.

/** El valor para Prisma de un día `AAAA-MM-DD`. */
export function toDateColumn(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** El día `AAAA-MM-DD` que guarda una columna `@db.Date`. */
export function fromDateColumn(date: Date): string {
  return date.toISOString().slice(0, 10);
}
