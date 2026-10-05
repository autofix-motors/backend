import { limaDayRange, limaDayStart, limaToday } from './lima-dates.js';

describe('limaDayStart', () => {
  it('es la medianoche de Lima, cinco horas después de la de UTC', () => {
    expect(limaDayStart('2026-10-04').toISOString()).toBe(
      '2026-10-04T05:00:00.000Z',
    );
  });
});

describe('limaDayRange', () => {
  it('sin fechas no hay rango', () => {
    expect(limaDayRange(undefined, undefined)).toBeUndefined();
  });

  it('el «hasta» abarca su día entero de Lima', () => {
    const range = limaDayRange('2026-10-04', '2026-10-04');
    // Un movimiento del 4 a las 23:30 de Lima (el 5 a las 04:30 UTC) entra.
    const lateNight = new Date('2026-10-05T04:30:00.000Z');
    expect(range).toEqual({
      gte: new Date('2026-10-04T05:00:00.000Z'),
      lt: new Date('2026-10-05T05:00:00.000Z'),
    });
    expect(lateNight >= range!.gte! && lateNight < range!.lt!).toBe(true);
  });

  it('cruza el fin de mes y de año', () => {
    expect(limaDayRange(undefined, '2026-12-31')).toEqual({
      lt: new Date('2027-01-01T05:00:00.000Z'),
    });
  });
});

describe('limaToday', () => {
  it('es el día de Lima aunque en UTC ya sea el siguiente', () => {
    // El 4 a las 23:30 de Lima es el 5 a las 04:30 UTC.
    expect(limaToday(new Date('2026-10-05T04:30:00.000Z'))).toBe('2026-10-04');
    expect(limaToday(new Date('2026-10-05T05:00:00.000Z'))).toBe('2026-10-05');
  });
});
