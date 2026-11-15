import { Prisma } from '../../../../generated/prisma/client.js';
import type { WorkOrderWithTimeline } from '../../work-orders/entities/work-order-detail.entity.js';
import { PortalWorkOrderDetail } from './portal-work-order-detail.entity.js';
import { PortalWorkOrder } from './portal-work-order.entity.js';

// Lo que se prueba es lo que el cliente NO tiene que ver: costos, márgenes,
// notas internas, el número correlativo, quién del personal hizo cada cosa y
// los ids del catálogo. Una lista blanca de claves: un campo nuevo del
// personal no puede colarse en el portal sin que esta prueba falle.

const D = (value: string) => new Prisma.Decimal(value);
const STAFF = { usuarioId: 'admin-1', nombre: 'Ana Admin' };

function order(overrides: Record<string, unknown> = {}) {
  return {
    ordenTrabajoId: 'wo-1',
    numero: 123,
    codigoSeguimiento: 'AFM-7K3Q9X',
    clienteId: 'cust-1',
    vehiculoId: 'veh-1',
    mecanicoId: 'mech-1',
    creadoPorId: 'admin-1',
    estado: 'ESPERANDO_APROBACION',
    kilometrajeIngreso: 85000,
    motivo: 'Ruido al frenar',
    diagnostico: 'Pastillas gastadas',
    fechaPrometida: new Date('2026-10-20T00:00:00.000Z'),
    recibidaEn: new Date('2026-10-18T14:00:00.000Z'),
    entregadaEn: null,
    canceladaEn: null,
    motivoCancelacion: null,
    creadoEn: new Date('2026-10-18T14:00:00.000Z'),
    actualizadoEn: new Date('2026-10-18T14:00:00.000Z'),
    vehiculo: {
      vehiculoId: 'veh-1',
      placa: 'ABC123',
      marca: 'Toyota',
      modelo: 'Yaris',
    },
    cliente: { clienteId: 'cust-1', nombre: 'Juan', telefono: '987654321' },
    mecanico: { usuarioId: 'mech-1', nombre: 'Mario Mecánico' },
    creadoPor: STAFF,
    detalles: [
      {
        detalleOrdenId: 'item-1',
        ordenTrabajoId: 'wo-1',
        tipo: 'SERVICIO',
        servicioId: 'svc-1',
        productoId: null,
        descripcion: 'Cambio de pastillas de freno (por eje)',
        cantidad: D('1'),
        precioUnitario: D('80'),
        costoUnitario: null,
        producto: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      },
      {
        detalleOrdenId: 'item-2',
        ordenTrabajoId: 'wo-1',
        tipo: 'PRODUCTO',
        servicioId: null,
        productoId: 'prod-1',
        descripcion: 'PAS-DEL-YARIS · Pastillas de freno delanteras',
        cantidad: D('1'),
        precioUnitario: D('120'),
        costoUnitario: D('70'),
        producto: { unidad: 'KIT' },
        creadoEn: new Date(),
        actualizadoEn: new Date(),
      },
    ],
    eventos: [
      {
        eventoOrdenId: 'ev-1',
        ordenTrabajoId: 'wo-1',
        estado: 'RECIBIDO',
        nota: 'Vehículo recibido en el taller',
        esPublico: true,
        creadoPorId: 'admin-1',
        creadoPor: STAFF,
        creadoEn: new Date('2026-10-18T14:00:00.000Z'),
      },
      {
        eventoOrdenId: 'ev-2',
        ordenTrabajoId: 'wo-1',
        estado: null,
        nota: 'El cliente discutió el precio',
        esPublico: false,
        creadoPorId: 'admin-1',
        creadoPor: STAFF,
        creadoEn: new Date('2026-10-18T15:00:00.000Z'),
      },
    ],
    presupuestos: [
      {
        presupuestoId: 'q-1',
        ordenTrabajoId: 'wo-1',
        version: 1,
        estado: 'PENDIENTE',
        total: D('200'),
        enviadoPorId: 'admin-1',
        enviadoPor: STAFF,
        enviadoEn: new Date('2026-10-18T15:30:00.000Z'),
        decididoPorId: null,
        decididoPor: null,
        decididoEn: null,
        canalDecision: null,
        notaDecision: null,
        creadoEn: new Date(),
        actualizadoEn: new Date(),
        detalles: [
          {
            detallePresupuestoId: 'qi-1',
            presupuestoId: 'q-1',
            tipo: 'SERVICIO',
            descripcion: 'Cambio de pastillas de freno (por eje)',
            cantidad: D('1'),
            precioUnitario: D('80'),
            creadoEn: new Date(),
          },
        ],
      },
    ],
    ...overrides,
  } as unknown as WorkOrderWithTimeline;
}

const keys = (value: object) => Object.keys(value).sort();

describe('PortalWorkOrderDetail', () => {
  it('expone solo los campos permitidos, en la orden y en cada parte', () => {
    const detail = new PortalWorkOrderDetail(order());

    expect(keys(detail)).toEqual(
      [
        'ordenTrabajoId',
        'codigoSeguimiento',
        'estado',
        'motivo',
        'vehiculo',
        'recibidaEn',
        'fechaPrometida',
        'entregadaEn',
        'total',
        'tienePresupuestoPendiente',
        'kilometrajeIngreso',
        'diagnostico',
        'nombreMecanico',
        'motivoCancelacion',
        'detalles',
        'totales',
        'eventos',
        'presupuestos',
      ].sort(),
    );
    expect(keys(detail.detalles[0])).toEqual(
      [
        'tipo',
        'descripcion',
        'cantidad',
        'unidad',
        'precioUnitario',
        'subtotal',
      ].sort(),
    );
    expect(keys(detail.totales)).toEqual(
      ['manoObra', 'repuestos', 'total'].sort(),
    );
    expect(keys(detail.eventos[0])).toEqual(
      ['estado', 'nota', 'creadoEn'].sort(),
    );
    expect(keys(detail.presupuestos[0])).toEqual(
      [
        'presupuestoId',
        'version',
        'estado',
        'total',
        'enviadoEn',
        'decididoEn',
        'canalDecision',
        'notaDecision',
        'detalles',
      ].sort(),
    );
    expect(JSON.stringify(detail)).not.toMatch(
      /costoUnitario|costoRepuestos|margenRepuestos|"numero"|admin-1|Ana Admin|svc-1|prod-1/,
    );
  });

  it('muestra solo los eventos públicos', () => {
    const detail = new PortalWorkOrderDetail(order());
    expect(detail.eventos).toEqual([
      {
        estado: 'RECIBIDO',
        nota: 'Vehículo recibido en el taller',
        creadoEn: new Date('2026-10-18T14:00:00.000Z'),
      },
    ]);
  });

  it('trae el mecánico por su nombre, los montos y la unidad del repuesto', () => {
    const detail = new PortalWorkOrderDetail(order());
    expect(detail.nombreMecanico).toBe('Mario Mecánico');
    expect(detail.totales).toEqual({
      manoObra: '80.00',
      repuestos: '120.00',
      total: '200.00',
    });
    expect(detail.detalles[1]).toMatchObject({
      unidad: 'KIT',
      subtotal: '120.00',
    });
    expect(detail.fechaPrometida).toBe('2026-10-20');
  });

  it('avisa del presupuesto pendiente solo mientras la orden espera aprobación', () => {
    expect(new PortalWorkOrderDetail(order()).tienePresupuestoPendiente).toBe(
      true,
    );
    expect(
      new PortalWorkOrderDetail(order({ estado: 'CANCELADO' }))
        .tienePresupuestoPendiente,
    ).toBe(false);
  });
});

describe('PortalWorkOrder (listado)', () => {
  it('con solo los ids de los presupuestos pendientes, también avisa', () => {
    const row = order({ presupuestos: [{ presupuestoId: 'q-1' }] });
    expect(new PortalWorkOrder(row).tienePresupuestoPendiente).toBe(true);
    expect(
      new PortalWorkOrder({ ...row, presupuestos: [] })
        .tienePresupuestoPendiente,
    ).toBe(false);
  });
});
