import {
  attentionOrders,
  mechanicWorkload,
  monthlyTrend,
  openOrderIndicators,
  type OpenOrderSummary,
  statusBreakdown,
  topServices,
} from './work-order-stats.js';

// Lo que se prueba es lo que decide: qué cuenta como vencida o a punto de
// vencer, a qué mes de Lima cae cada orden, cómo se ordena la carga del equipo
// y cómo se agrupan los servicios.

const TODAY = '2026-11-15';

let numero = 0;
function order(overrides: Partial<OpenOrderSummary> = {}): OpenOrderSummary {
  numero++;
  return {
    ordenTrabajoId: `ot-${numero}`,
    numero,
    estado: 'EN_REPARACION',
    fechaPrometida: null,
    vehiculo: { placa: `ABC${numero}` },
    mecanico: null,
    ...overrides,
  };
}

// Una columna `@db.Date`, como la devuelve Prisma: medianoche UTC.
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('openOrderIndicators', () => {
  it('cuenta las abiertas, las que esperan aprobación, las listas y las vencidas', () => {
    const orders = [
      order({ estado: 'ESPERANDO_APROBACION' }),
      order({ estado: 'LISTO', fechaPrometida: day('2026-11-14') }),
      order({ fechaPrometida: day('2026-11-15') }), // hoy: todavía no vence
      order({ fechaPrometida: day('2026-11-10') }),
    ];
    expect(openOrderIndicators(orders, TODAY)).toEqual({
      abiertas: 4,
      esperandoAprobacion: 1,
      listas: 1,
      vencidas: 2,
    });
  });
});

describe('statusBreakdown', () => {
  it('trae todos los estados abiertos en el orden del flujo, con los que están en 0', () => {
    const orders = [
      order({ estado: 'LISTO' }),
      order({ estado: 'RECIBIDO' }),
      order({ estado: 'LISTO' }),
    ];
    expect(statusBreakdown(orders)).toEqual([
      { estado: 'RECIBIDO', cantidad: 1 },
      { estado: 'EN_DIAGNOSTICO', cantidad: 0 },
      { estado: 'ESPERANDO_APROBACION', cantidad: 0 },
      { estado: 'EN_REPARACION', cantidad: 0 },
      { estado: 'ESPERANDO_REPUESTOS', cantidad: 0 },
      { estado: 'LISTO', cantidad: 2 },
    ]);
  });
});

describe('monthlyTrend', () => {
  it('agrupa por mes de Lima, aunque en UTC el instante caiga en otro mes', () => {
    const trend = monthlyTrend(
      ['2026-10', '2026-11'],
      [
        // 1 de noviembre a las 00:30 de Lima: en UTC es 1 de noviembre 05:30.
        new Date('2026-11-01T05:30:00.000Z'),
        // 31 de octubre a las 23:30 de Lima: en UTC ya es 1 de noviembre.
        new Date('2026-11-01T04:30:00.000Z'),
        new Date('2026-11-14T15:00:00.000Z'),
      ],
      [new Date('2026-10-20T15:00:00.000Z')],
    );
    expect(trend).toEqual([
      { mes: '2026-10', recibidas: 1, entregadas: 1 },
      { mes: '2026-11', recibidas: 2, entregadas: 0 },
    ]);
  });

  it('cruza el cambio de año y deja en 0 los meses sin órdenes', () => {
    const trend = monthlyTrend(
      ['2026-12', '2027-01'],
      // 31 de diciembre a las 22:00 de Lima: en UTC ya es 2027.
      [new Date('2027-01-01T03:00:00.000Z')],
      [],
    );
    expect(trend).toEqual([
      { mes: '2026-12', recibidas: 1, entregadas: 0 },
      { mes: '2027-01', recibidas: 0, entregadas: 0 },
    ]);
  });

  it('ignora lo que cae fuera de los meses pedidos', () => {
    expect(
      monthlyTrend(['2026-11'], [new Date('2026-05-10T15:00:00.000Z')], []),
    ).toEqual([{ mes: '2026-11', recibidas: 0, entregadas: 0 }]);
  });
});

describe('mechanicWorkload', () => {
  const ana = { usuarioId: 'u-ana', nombre: 'Ana' };
  const beto = { usuarioId: 'u-beto', nombre: 'Beto' };

  it('cuenta por mecánico, de la más cargada a la menos, con la fila «Sin asignar»', () => {
    const orders = [
      order({ mecanico: beto }),
      order({ mecanico: null }),
      order({ mecanico: beto }),
      order({ mecanico: ana }),
      order({ mecanico: null }),
      order({ mecanico: beto }),
    ];
    expect(mechanicWorkload(orders)).toEqual([
      { usuarioId: 'u-beto', nombre: 'Beto', abiertas: 3 },
      { usuarioId: null, nombre: 'Sin asignar', abiertas: 2 },
      { usuarioId: 'u-ana', nombre: 'Ana', abiertas: 1 },
    ]);
  });

  it('a igual carga ordena por nombre; sin órdenes sin mecánico no hay fila «Sin asignar»', () => {
    expect(
      mechanicWorkload([order({ mecanico: beto }), order({ mecanico: ana })]),
    ).toEqual([
      { usuarioId: 'u-ana', nombre: 'Ana', abiertas: 1 },
      { usuarioId: 'u-beto', nombre: 'Beto', abiertas: 1 },
    ]);
  });
});

describe('attentionOrders', () => {
  it('trae las vencidas y las que vencen en 2 días o menos, la más antigua primero', () => {
    const orders = [
      order({ numero: 10, fechaPrometida: day('2026-11-17') }), // en 2 días
      order({ numero: 11, fechaPrometida: day('2026-11-18') }), // en 3: no
      order({ numero: 12, fechaPrometida: null }), // sin plazo: no
      order({ numero: 13, fechaPrometida: day('2026-11-12') }), // vencida
      order({ numero: 14, fechaPrometida: day('2026-11-15') }), // hoy
    ];
    expect(attentionOrders(orders, TODAY)).toEqual([
      expect.objectContaining({
        numero: 13,
        fechaPrometida: '2026-11-12',
        vencida: true,
      }),
      expect.objectContaining({
        numero: 14,
        fechaPrometida: '2026-11-15',
        vencida: false,
      }),
      expect.objectContaining({
        numero: 10,
        fechaPrometida: '2026-11-17',
        vencida: false,
      }),
    ]);
  });

  it('devuelve la placa y el estado, y como mucho 6, desempatando por número', () => {
    const orders = Array.from({ length: 8 }, (_, i) =>
      order({ numero: 100 - i, fechaPrometida: day('2026-11-01') }),
    );
    const result = attentionOrders(orders, TODAY);
    expect(result).toHaveLength(6);
    expect(result.map((o) => o.numero)).toEqual([93, 94, 95, 96, 97, 98]);
    expect(result[0]).toEqual({
      ordenTrabajoId: orders[7].ordenTrabajoId,
      numero: 93,
      placa: orders[7].vehiculo.placa,
      estado: 'EN_REPARACION',
      fechaPrometida: '2026-11-01',
      vencida: true,
    });
  });
});

describe('topServices', () => {
  const line = (
    servicioId: string | null,
    descripcion: string,
    nombre?: string,
  ) => ({
    servicioId,
    descripcion,
    servicio: nombre ? { nombre } : null,
  });

  it('agrupa por servicio del catálogo aunque la descripción se haya editado', () => {
    const lines = [
      line('s-aceite', 'Cambio de aceite 5W-30', 'Cambio de aceite'),
      line('s-aceite', 'Cambio de aceite', 'Cambio de aceite'),
      line('s-frenos', 'Revisión de frenos', 'Frenos'),
      line(null, 'Lavado de motor'),
    ];
    expect(topServices(lines)).toEqual([
      { nombre: 'Cambio de aceite', cantidad: 2 },
      { nombre: 'Frenos', cantidad: 1 },
      { nombre: 'Lavado de motor', cantidad: 1 },
    ]);
  });

  it('se queda con los más hechos', () => {
    const lines = ['a', 'b', 'b', 'c', 'c', 'c'].map((id) =>
      line(id, id, id.toUpperCase()),
    );
    expect(topServices(lines, 2)).toEqual([
      { nombre: 'C', cantidad: 3 },
      { nombre: 'B', cantidad: 2 },
    ]);
  });
});
