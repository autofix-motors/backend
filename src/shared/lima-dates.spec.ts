import {
  addDays,
  addMonths,
  lastLimaMonths,
  limaDayRange,
  limaDayStart,
  limaMonth,
  limaMonthRange,
  limaMonthStart,
  limaToday,
} from './lima-dates.js';

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

describe('addDays', () => {
  it('suma y resta días cruzando el fin de mes y de año', () => {
    expect(addDays('2026-10-04', 2)).toBe('2026-10-06');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('limaMonth', () => {
  it('el 1 del mes a las 00:30 de Lima ya es el mes nuevo, aunque en UTC no', () => {
    // 1 de noviembre a las 00:30 de Lima = 1 de noviembre a las 05:30 UTC; y
    // el 31 de octubre a las 23:30 de Lima ya es 1 de noviembre en UTC.
    expect(limaMonth(new Date('2026-11-01T05:30:00.000Z'))).toBe('2026-11');
    expect(limaMonth(new Date('2026-11-01T04:30:00.000Z'))).toBe('2026-10');
  });

  it('la última noche del año sigue en diciembre en Lima', () => {
    expect(limaMonth(new Date('2027-01-01T03:00:00.000Z'))).toBe('2026-12');
    expect(limaMonth(new Date('2027-01-01T05:00:00.000Z'))).toBe('2027-01');
  });
});

describe('addMonths', () => {
  it('cruza el cambio de año en los dos sentidos', () => {
    expect(addMonths('2026-11', 1)).toBe('2026-12');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-03', -5)).toBe('2025-10');
  });
});

describe('limaMonthRange', () => {
  it('va de la medianoche de Lima del 1 a la del 1 del mes siguiente', () => {
    expect(limaMonthRange('2026-12')).toEqual({
      gte: new Date('2026-12-01T05:00:00.000Z'),
      lt: new Date('2027-01-01T05:00:00.000Z'),
    });
    expect(limaMonthStart('2026-11')).toEqual(
      new Date('2026-11-01T05:00:00.000Z'),
    );
  });
});

describe('lastLimaMonths', () => {
  it('son los últimos meses de Lima, del más antiguo al actual', () => {
    expect(lastLimaMonths(6, new Date('2027-02-10T15:00:00.000Z'))).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('el mes actual es el de Lima, no el de UTC', () => {
    // 31 de enero a las 22:00 de Lima: en UTC ya es febrero.
    expect(lastLimaMonths(2, new Date('2027-02-01T03:00:00.000Z'))).toEqual([
      '2026-12',
      '2027-01',
    ]);
  });
});
