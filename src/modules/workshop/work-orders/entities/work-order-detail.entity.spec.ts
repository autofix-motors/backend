import { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderDetail } from './work-order-detail.entity.js';
import { WorkOrder } from './work-order.entity.js';

// El modelo de respuesta decide qué sale: la fecha prometida como día, si está
// vencida, de las personas y el vehículo solo lo resumido, los montos como
// texto con dos decimales y el costo de los repuestos solo para ADMINISTRADOR.

const RECEIVED_AT = new Date('2026-10-01T14:00:00.000Z');
const D = (value: string) => new Prisma.Decimal(value);
const ADMINISTRADOR = { incluirCostos: true };
const MECANICO = { incluirCostos: false };

const item = (overrides: Record<string, unknown> = {}) => ({
  detalleOrdenId: 'i1',
  ordenTrabajoId: 'wo-1',
  tipo: 'SERVICIO' as const,
  servicioId: 's1',
  productoId: null,
  descripcion: 'Cambio de pastillas delanteras',
  cantidad: D('1'),
  precioUnitario: D('80'),
  costoUnitario: null,
  creadoEn: RECEIVED_AT,
  actualizadoEn: RECEIVED_AT,
  producto: null,
  ...overrides,
});
const part = item({
  detalleOrdenId: 'i2',
  tipo: 'PRODUCTO' as const,
  servicioId: null,
  productoId: 'p1',
  descripcion: 'PF-TOY-0446 · Pastillas de freno delanteras',
  cantidad: D('1.5'),
  precioUnitario: D('38.90'),
  costoUnitario: D('22.35'),
  producto: { unidad: 'KIT' as const },
});

const row = (overrides: Record<string, unknown> = {}) => ({
  ordenTrabajoId: 'wo-1',
  numero: 123,
  codigoSeguimiento: 'AFM-7K3Q9X',
  clienteId: 'c1',
  vehiculoId: 'v1',
  mecanicoId: 'u1',
  creadoPorId: 'u0',
  estado: 'EN_REPARACION' as const,
  kilometrajeIngreso: 84500,
  motivo: 'Ruido al frenar',
  diagnostico: 'Pastillas gastadas',
  fechaPrometida: new Date('2026-10-03T00:00:00.000Z'),
  recibidaEn: RECEIVED_AT,
  entregadaEn: null,
  canceladaEn: null,
  motivoCancelacion: null,
  creadoEn: RECEIVED_AT,
  actualizadoEn: RECEIVED_AT,
  // Lo que Prisma trae de más (como `correo` o `numeroDocumento` si alguien
  // amplía el select) no tiene que salir.
  vehiculo: {
    vehiculoId: 'v1',
    placa: 'ABK582',
    marca: 'Toyota',
    modelo: 'Yaris',
    vin: 'JTDBT923X91234567',
  },
  cliente: {
    clienteId: 'c1',
    nombre: 'Juan Pérez Rojas',
    telefono: '987654321',
    numeroDocumento: '45678912',
  },
  mecanico: {
    usuarioId: 'u1',
    nombre: 'Carlos Huamán Quispe',
    correo: 'x@y.pe',
  },
  creadoPor: { usuarioId: 'u0', nombre: 'Administrador' },
  eventos: [
    {
      eventoOrdenId: 'e1',
      ordenTrabajoId: 'wo-1',
      estado: 'RECIBIDO' as const,
      nota: 'Vehículo recibido en el taller',
      esPublico: true,
      creadoPorId: 'u0',
      creadoEn: RECEIVED_AT,
      creadoPor: { usuarioId: 'u0', nombre: 'Administrador' },
    },
  ],
  detalles: [item(), part],
  presupuestos: [],
  ...overrides,
});

describe('WorkOrder', () => {
  it('la fecha prometida sale como día y la orden, vencida', () => {
    const order = new WorkOrder(row(), '2026-10-04');
    expect(order.fechaPrometida).toBe('2026-10-03');
    expect(order.vencida).toBe(true);
    expect(new WorkOrder(row(), '2026-10-03').vencida).toBe(false);
  });

  it('sin fecha prometida ni mecánico, null', () => {
    const order = new WorkOrder(
      row({ fechaPrometida: null, mecanico: null }),
      '2026-10-04',
    );
    expect(order.fechaPrometida).toBeNull();
    expect(order.vencida).toBe(false);
    expect(order.mecanico).toBeNull();
  });

  it('del vehículo, el cliente y el mecánico, solo lo resumido', () => {
    const order = new WorkOrder(row(), '2026-10-04');
    expect({ ...order.vehiculo }).toEqual({
      vehiculoId: 'v1',
      placa: 'ABK582',
      marca: 'Toyota',
      modelo: 'Yaris',
    });
    expect({ ...order.cliente }).toEqual({
      clienteId: 'c1',
      nombre: 'Juan Pérez Rojas',
      telefono: '987654321',
    });
    expect({ ...order.mecanico }).toEqual({
      usuarioId: 'u1',
      nombre: 'Carlos Huamán Quispe',
    });
    expect(Object.keys(order)).not.toContain('diagnostico');
  });
});

describe('WorkOrderDetail', () => {
  it('suma el diagnóstico, quién la registró y la línea de tiempo', () => {
    const detail = new WorkOrderDetail(row(), ADMINISTRADOR, '2026-10-04');
    expect(detail).toMatchObject({
      ordenTrabajoId: 'wo-1',
      vencida: true,
      diagnostico: 'Pastillas gastadas',
      canceladaEn: null,
      motivoCancelacion: null,
      creadoPor: { usuarioId: 'u0', nombre: 'Administrador' },
    });
    expect(detail.eventos.map((event) => ({ ...event }))).toEqual([
      {
        eventoOrdenId: 'e1',
        estado: 'RECIBIDO',
        nota: 'Vehículo recibido en el taller',
        esPublico: true,
        creadoPor: { usuarioId: 'u0', nombre: 'Administrador' },
        creadoEn: RECEIVED_AT,
      },
    ]);
  });
});

describe('WorkOrder: total', () => {
  it('suma los subtotales redondeados, sin pasar por number', () => {
    // 1.5 × 38.90 = 58.35; más 80.00 de mano de obra.
    expect(new WorkOrder(row(), '2026-10-04').total).toBe('138.35');
    expect(new WorkOrder(row({ detalles: [] }), '2026-10-04').total).toBe(
      '0.00',
    );
  });
});

describe('WorkOrderDetail: detalles y montos', () => {
  it('cada detalle con su subtotal, su unidad y montos de dos decimales', () => {
    const detail = new WorkOrderDetail(row(), ADMINISTRADOR, '2026-10-04');
    expect(detail.detalles.map((line) => ({ ...line }))).toEqual([
      {
        detalleOrdenId: 'i1',
        tipo: 'SERVICIO',
        descripcion: 'Cambio de pastillas delanteras',
        cantidad: '1.00',
        unidad: null,
        precioUnitario: '80.00',
        subtotal: '80.00',
        costoUnitario: null,
        servicioId: 's1',
        productoId: null,
        creadoEn: RECEIVED_AT,
      },
      {
        detalleOrdenId: 'i2',
        tipo: 'PRODUCTO',
        descripcion: 'PF-TOY-0446 · Pastillas de freno delanteras',
        cantidad: '1.50',
        unidad: 'KIT',
        precioUnitario: '38.90',
        subtotal: '58.35',
        costoUnitario: '22.35',
        servicioId: null,
        productoId: 'p1',
        creadoEn: RECEIVED_AT,
      },
    ]);
    // Costo: 1.5 × 22.35 = 33.525 → 33.53; margen 58.35 − 33.53.
    expect({ ...detail.totales }).toEqual({
      manoObra: '80.00',
      repuestos: '58.35',
      total: '138.35',
      costoRepuestos: '33.53',
      margenRepuestos: '24.82',
    });
  });

  it('al mecánico no le salen el costo ni el margen, ni como clave', () => {
    const json = JSON.parse(
      JSON.stringify(new WorkOrderDetail(row(), MECANICO, '2026-10-04')),
    );
    expect(json.detalles[1]).not.toHaveProperty('costoUnitario');
    expect(json.totales).toEqual({
      manoObra: '80.00',
      repuestos: '58.35',
      total: '138.35',
    });
  });
});

describe('WorkOrderDetail: presupuestos', () => {
  const SENT_AT = new Date('2026-10-02T15:00:00.000Z');
  const detallePresupuesto = (overrides: Record<string, unknown> = {}) => ({
    detallePresupuestoId: 'qi1',
    presupuestoId: 'q2',
    tipo: 'PRODUCTO' as const,
    descripcion: 'PF-TOY-0446 · Pastillas de freno delanteras',
    cantidad: D('1.5'),
    precioUnitario: D('38.90'),
    creadoEn: SENT_AT,
    ...overrides,
  });
  const presupuesto = (overrides: Record<string, unknown> = {}) => ({
    presupuestoId: 'q2',
    ordenTrabajoId: 'wo-1',
    version: 2,
    estado: 'APROBADO' as const,
    total: D('138.35'),
    enviadoPorId: 'u0',
    enviadoEn: SENT_AT,
    decididoPorId: 'u0',
    decididoEn: RECEIVED_AT,
    canalDecision: 'WHATSAPP' as const,
    notaDecision: 'Aprobó por WhatsApp',
    creadoEn: SENT_AT,
    actualizadoEn: RECEIVED_AT,
    enviadoPor: {
      usuarioId: 'u0',
      nombre: 'Administrador',
      correo: 'admin@x.pe',
    },
    decididoPor: { usuarioId: 'u0', nombre: 'Administrador' },
    detalles: [
      detallePresupuesto({
        detallePresupuestoId: 'qi0',
        tipo: 'SERVICIO',
        cantidad: D('1'),
        precioUnitario: D('80'),
      }),
      detallePresupuesto(),
    ],
    ...overrides,
  });

  it('cada versión con su total, quién la envió y decidió, y sus detalles con subtotal', () => {
    const json = JSON.parse(
      JSON.stringify(
        new WorkOrderDetail(
          row({
            presupuestos: [
              presupuesto(),
              presupuesto({
                presupuestoId: 'q1',
                version: 1,
                estado: 'RECHAZADO',
                total: D('200'),
                canalDecision: 'TELEFONO',
                notaDecision: null,
                detalles: [],
              }),
            ],
          }),
          MECANICO,
          '2026-10-04',
        ),
      ),
    );
    // El orden es el que trae la consulta (versión descendente).
    expect(
      json.presupuestos.map((q: { version: number }) => q.version),
    ).toEqual([2, 1]);
    expect(json.presupuestos[0]).toEqual({
      presupuestoId: 'q2',
      version: 2,
      estado: 'APROBADO',
      total: '138.35',
      enviadoEn: SENT_AT.toISOString(),
      // Solo el resumen de la persona: nada de su cuenta.
      enviadoPor: { usuarioId: 'u0', nombre: 'Administrador' },
      decididoEn: RECEIVED_AT.toISOString(),
      decididoPor: { usuarioId: 'u0', nombre: 'Administrador' },
      canalDecision: 'WHATSAPP',
      notaDecision: 'Aprobó por WhatsApp',
      detalles: [
        {
          detallePresupuestoId: 'qi0',
          tipo: 'SERVICIO',
          descripcion: 'PF-TOY-0446 · Pastillas de freno delanteras',
          cantidad: '1.00',
          precioUnitario: '80.00',
          subtotal: '80.00',
        },
        {
          detallePresupuestoId: 'qi1',
          tipo: 'PRODUCTO',
          descripcion: 'PF-TOY-0446 · Pastillas de freno delanteras',
          cantidad: '1.50',
          precioUnitario: '38.90',
          // 1.5 × 38.90 = 58.35, sin pasar por number.
          subtotal: '58.35',
        },
      ],
    });
    expect(json.presupuestos[1].total).toBe('200.00');
  });

  it('una versión pendiente no tiene decisión', () => {
    const [pending] = new WorkOrderDetail(
      row({
        presupuestos: [
          presupuesto({
            estado: 'PENDIENTE',
            decididoPorId: null,
            decididoEn: null,
            canalDecision: null,
            notaDecision: null,
            decididoPor: null,
          }),
        ],
      }),
      ADMINISTRADOR,
      '2026-10-04',
    ).presupuestos;
    expect(pending).toMatchObject({
      estado: 'PENDIENTE',
      decididoEn: null,
      decididoPor: null,
      canalDecision: null,
      notaDecision: null,
    });
  });
});
