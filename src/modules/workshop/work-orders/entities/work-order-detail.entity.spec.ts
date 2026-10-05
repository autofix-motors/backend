import { Prisma } from '../../../../generated/prisma/client.js';
import { WorkOrderDetail } from './work-order-detail.entity.js';
import { WorkOrder } from './work-order.entity.js';

// El modelo de respuesta decide qué sale: la fecha prometida como día, si está
// vencida, de las personas y el vehículo solo lo resumido, los montos como
// texto con dos decimales y el costo de los repuestos solo para ADMIN.

const RECEIVED_AT = new Date('2026-10-01T14:00:00.000Z');
const D = (value: string) => new Prisma.Decimal(value);
const ADMIN = { includeCosts: true };
const MECHANIC = { includeCosts: false };

const item = (overrides: Record<string, unknown> = {}) => ({
  workOrderItemId: 'i1',
  workOrderId: 'wo-1',
  type: 'SERVICE' as const,
  serviceCatalogItemId: 's1',
  productId: null,
  description: 'Cambio de pastillas delanteras',
  quantity: D('1'),
  unitPrice: D('80'),
  unitCost: null,
  createdAt: RECEIVED_AT,
  updatedAt: RECEIVED_AT,
  product: null,
  ...overrides,
});
const part = item({
  workOrderItemId: 'i2',
  type: 'PRODUCT' as const,
  serviceCatalogItemId: null,
  productId: 'p1',
  description: 'PF-TOY-0446 · Pastillas de freno delanteras',
  quantity: D('1.5'),
  unitPrice: D('38.90'),
  unitCost: D('22.35'),
  product: { unit: 'KIT' as const },
});

const row = (overrides: Record<string, unknown> = {}) => ({
  workOrderId: 'wo-1',
  number: 123,
  trackingCode: 'AFM-7K3Q9X',
  customerId: 'c1',
  vehicleId: 'v1',
  mechanicId: 'u1',
  createdById: 'u0',
  status: 'IN_PROGRESS' as const,
  mileageIn: 84500,
  reason: 'Ruido al frenar',
  diagnosis: 'Pastillas gastadas',
  promisedDate: new Date('2026-10-03T00:00:00.000Z'),
  receivedAt: RECEIVED_AT,
  deliveredAt: null,
  cancelledAt: null,
  cancelReason: null,
  createdAt: RECEIVED_AT,
  updatedAt: RECEIVED_AT,
  // Lo que Prisma trae de más (como `email` o `documentNumber` si alguien
  // amplía el select) no tiene que salir.
  vehicle: {
    vehicleId: 'v1',
    plate: 'ABK582',
    brand: 'Toyota',
    model: 'Yaris',
    vin: 'JTDBT923X91234567',
  },
  customer: {
    customerId: 'c1',
    name: 'Juan Pérez Rojas',
    phone: '987654321',
    documentNumber: '45678912',
  },
  mechanic: { userId: 'u1', name: 'Carlos Huamán Quispe', email: 'x@y.pe' },
  createdBy: { userId: 'u0', name: 'Administrador' },
  events: [
    {
      workOrderEventId: 'e1',
      workOrderId: 'wo-1',
      status: 'RECEIVED' as const,
      note: 'Vehículo recibido en el taller',
      isPublic: true,
      createdById: 'u0',
      createdAt: RECEIVED_AT,
      createdBy: { userId: 'u0', name: 'Administrador' },
    },
  ],
  items: [item(), part],
  ...overrides,
});

describe('WorkOrder', () => {
  it('la fecha prometida sale como día y la orden, vencida', () => {
    const order = new WorkOrder(row(), '2026-10-04');
    expect(order.promisedDate).toBe('2026-10-03');
    expect(order.isOverdue).toBe(true);
    expect(new WorkOrder(row(), '2026-10-03').isOverdue).toBe(false);
  });

  it('sin fecha prometida ni mecánico, null', () => {
    const order = new WorkOrder(
      row({ promisedDate: null, mechanic: null }),
      '2026-10-04',
    );
    expect(order.promisedDate).toBeNull();
    expect(order.isOverdue).toBe(false);
    expect(order.mechanic).toBeNull();
  });

  it('del vehículo, el cliente y el mecánico, solo lo resumido', () => {
    const order = new WorkOrder(row(), '2026-10-04');
    expect({ ...order.vehicle }).toEqual({
      vehicleId: 'v1',
      plate: 'ABK582',
      brand: 'Toyota',
      model: 'Yaris',
    });
    expect({ ...order.customer }).toEqual({
      customerId: 'c1',
      name: 'Juan Pérez Rojas',
      phone: '987654321',
    });
    expect({ ...order.mechanic }).toEqual({
      userId: 'u1',
      name: 'Carlos Huamán Quispe',
    });
    expect(Object.keys(order)).not.toContain('diagnosis');
  });
});

describe('WorkOrderDetail', () => {
  it('suma el diagnóstico, quién la registró y la línea de tiempo', () => {
    const detail = new WorkOrderDetail(row(), ADMIN, '2026-10-04');
    expect(detail).toMatchObject({
      workOrderId: 'wo-1',
      isOverdue: true,
      diagnosis: 'Pastillas gastadas',
      cancelledAt: null,
      cancelReason: null,
      createdBy: { userId: 'u0', name: 'Administrador' },
    });
    expect(detail.events.map((event) => ({ ...event }))).toEqual([
      {
        workOrderEventId: 'e1',
        status: 'RECEIVED',
        note: 'Vehículo recibido en el taller',
        isPublic: true,
        createdBy: { userId: 'u0', name: 'Administrador' },
        createdAt: RECEIVED_AT,
      },
    ]);
  });
});

describe('WorkOrder: total', () => {
  it('suma los subtotales redondeados, sin pasar por number', () => {
    // 1.5 × 38.90 = 58.35; más 80.00 de mano de obra.
    expect(new WorkOrder(row(), '2026-10-04').total).toBe('138.35');
    expect(new WorkOrder(row({ items: [] }), '2026-10-04').total).toBe('0.00');
  });
});

describe('WorkOrderDetail: ítems y montos', () => {
  it('cada ítem con su subtotal, su unidad y montos de dos decimales', () => {
    const detail = new WorkOrderDetail(row(), ADMIN, '2026-10-04');
    expect(detail.items.map((line) => ({ ...line }))).toEqual([
      {
        workOrderItemId: 'i1',
        type: 'SERVICE',
        description: 'Cambio de pastillas delanteras',
        quantity: '1.00',
        unit: null,
        unitPrice: '80.00',
        subtotal: '80.00',
        unitCost: null,
        serviceCatalogItemId: 's1',
        productId: null,
        createdAt: RECEIVED_AT,
      },
      {
        workOrderItemId: 'i2',
        type: 'PRODUCT',
        description: 'PF-TOY-0446 · Pastillas de freno delanteras',
        quantity: '1.50',
        unit: 'KIT',
        unitPrice: '38.90',
        subtotal: '58.35',
        unitCost: '22.35',
        serviceCatalogItemId: null,
        productId: 'p1',
        createdAt: RECEIVED_AT,
      },
    ]);
    // Costo: 1.5 × 22.35 = 33.525 → 33.53; margen 58.35 − 33.53.
    expect({ ...detail.totals }).toEqual({
      labor: '80.00',
      parts: '58.35',
      total: '138.35',
      partsCost: '33.53',
      partsMargin: '24.82',
    });
  });

  it('al mecánico no le salen el costo ni el margen, ni como clave', () => {
    const json = JSON.parse(
      JSON.stringify(new WorkOrderDetail(row(), MECHANIC, '2026-10-04')),
    );
    expect(json.items[1]).not.toHaveProperty('unitCost');
    expect(json.totals).toEqual({
      labor: '80.00',
      parts: '58.35',
      total: '138.35',
    });
  });
});
