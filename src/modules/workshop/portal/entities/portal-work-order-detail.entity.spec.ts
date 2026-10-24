import { Prisma } from '../../../../generated/prisma/client.js';
import type { WorkOrderWithTimeline } from '../../work-orders/entities/work-order-detail.entity.js';
import { PortalWorkOrderDetail } from './portal-work-order-detail.entity.js';
import { PortalWorkOrder } from './portal-work-order.entity.js';

// Lo que se prueba es lo que el cliente NO tiene que ver: costos, márgenes,
// notas internas, el número correlativo, quién del personal hizo cada cosa y
// los ids del catálogo. Una lista blanca de claves: un campo nuevo del
// personal no puede colarse en el portal sin que esta prueba falle.

const D = (value: string) => new Prisma.Decimal(value);
const STAFF = { userId: 'admin-1', name: 'Ana Admin' };

function order(overrides: Record<string, unknown> = {}) {
  return {
    workOrderId: 'wo-1',
    number: 123,
    trackingCode: 'AFM-7K3Q9X',
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    mechanicId: 'mech-1',
    createdById: 'admin-1',
    status: 'WAITING_APPROVAL',
    mileageIn: 85000,
    reason: 'Ruido al frenar',
    diagnosis: 'Pastillas gastadas',
    promisedDate: new Date('2026-10-20T00:00:00.000Z'),
    receivedAt: new Date('2026-10-18T14:00:00.000Z'),
    deliveredAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: new Date('2026-10-18T14:00:00.000Z'),
    updatedAt: new Date('2026-10-18T14:00:00.000Z'),
    vehicle: {
      vehicleId: 'veh-1',
      plate: 'ABC123',
      brand: 'Toyota',
      model: 'Yaris',
    },
    customer: { customerId: 'cust-1', name: 'Juan', phone: '987654321' },
    mechanic: { userId: 'mech-1', name: 'Mario Mecánico' },
    createdBy: STAFF,
    items: [
      {
        workOrderItemId: 'item-1',
        workOrderId: 'wo-1',
        type: 'SERVICE',
        serviceCatalogItemId: 'svc-1',
        productId: null,
        description: 'Cambio de pastillas de freno (por eje)',
        quantity: D('1'),
        unitPrice: D('80'),
        unitCost: null,
        product: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        workOrderItemId: 'item-2',
        workOrderId: 'wo-1',
        type: 'PRODUCT',
        serviceCatalogItemId: null,
        productId: 'prod-1',
        description: 'PAS-DEL-YARIS · Pastillas de freno delanteras',
        quantity: D('1'),
        unitPrice: D('120'),
        unitCost: D('70'),
        product: { unit: 'KIT' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    events: [
      {
        workOrderEventId: 'ev-1',
        workOrderId: 'wo-1',
        status: 'RECEIVED',
        note: 'Vehículo recibido en el taller',
        isPublic: true,
        createdById: 'admin-1',
        createdBy: STAFF,
        createdAt: new Date('2026-10-18T14:00:00.000Z'),
      },
      {
        workOrderEventId: 'ev-2',
        workOrderId: 'wo-1',
        status: null,
        note: 'El cliente discutió el precio',
        isPublic: false,
        createdById: 'admin-1',
        createdBy: STAFF,
        createdAt: new Date('2026-10-18T15:00:00.000Z'),
      },
    ],
    quotes: [
      {
        quoteId: 'q-1',
        workOrderId: 'wo-1',
        version: 1,
        status: 'PENDING',
        total: D('200'),
        sentById: 'admin-1',
        sentBy: STAFF,
        sentAt: new Date('2026-10-18T15:30:00.000Z'),
        decidedById: null,
        decidedBy: null,
        decidedAt: null,
        decisionChannel: null,
        decisionNote: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
          {
            quoteItemId: 'qi-1',
            quoteId: 'q-1',
            type: 'SERVICE',
            description: 'Cambio de pastillas de freno (por eje)',
            quantity: D('1'),
            unitPrice: D('80'),
            createdAt: new Date(),
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
        'workOrderId',
        'trackingCode',
        'status',
        'reason',
        'vehicle',
        'receivedAt',
        'promisedDate',
        'deliveredAt',
        'total',
        'hasPendingQuote',
        'mileageIn',
        'diagnosis',
        'mechanicName',
        'cancelReason',
        'items',
        'totals',
        'events',
        'quotes',
      ].sort(),
    );
    expect(keys(detail.items[0])).toEqual(
      [
        'type',
        'description',
        'quantity',
        'unit',
        'unitPrice',
        'subtotal',
      ].sort(),
    );
    expect(keys(detail.totals)).toEqual(['labor', 'parts', 'total'].sort());
    expect(keys(detail.events[0])).toEqual(
      ['status', 'note', 'createdAt'].sort(),
    );
    expect(keys(detail.quotes[0])).toEqual(
      [
        'quoteId',
        'version',
        'status',
        'total',
        'sentAt',
        'decidedAt',
        'decisionChannel',
        'decisionNote',
        'items',
      ].sort(),
    );
    expect(JSON.stringify(detail)).not.toMatch(
      /unitCost|partsCost|partsMargin|"number"|admin-1|Ana Admin|svc-1|prod-1/,
    );
  });

  it('muestra solo los eventos públicos', () => {
    const detail = new PortalWorkOrderDetail(order());
    expect(detail.events).toEqual([
      {
        status: 'RECEIVED',
        note: 'Vehículo recibido en el taller',
        createdAt: new Date('2026-10-18T14:00:00.000Z'),
      },
    ]);
  });

  it('trae el mecánico por su nombre, los montos y la unidad del repuesto', () => {
    const detail = new PortalWorkOrderDetail(order());
    expect(detail.mechanicName).toBe('Mario Mecánico');
    expect(detail.totals).toEqual({
      labor: '80.00',
      parts: '120.00',
      total: '200.00',
    });
    expect(detail.items[1]).toMatchObject({ unit: 'KIT', subtotal: '120.00' });
    expect(detail.promisedDate).toBe('2026-10-20');
  });

  it('avisa del presupuesto pendiente solo mientras la orden espera aprobación', () => {
    expect(new PortalWorkOrderDetail(order()).hasPendingQuote).toBe(true);
    expect(
      new PortalWorkOrderDetail(order({ status: 'CANCELLED' })).hasPendingQuote,
    ).toBe(false);
  });
});

describe('PortalWorkOrder (listado)', () => {
  it('con solo los ids de los presupuestos pendientes, también avisa', () => {
    const row = order({ quotes: [{ quoteId: 'q-1' }] });
    expect(new PortalWorkOrder(row).hasPendingQuote).toBe(true);
    expect(new PortalWorkOrder({ ...row, quotes: [] }).hasPendingQuote).toBe(
      false,
    );
  });
});
