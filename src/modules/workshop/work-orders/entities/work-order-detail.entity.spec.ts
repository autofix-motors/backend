import { WorkOrderDetail } from './work-order-detail.entity.js';
import { WorkOrder } from './work-order.entity.js';

// El modelo de respuesta decide qué sale: la fecha prometida como día, si está
// vencida, y de las personas y el vehículo solo lo resumido.

const RECEIVED_AT = new Date('2026-10-01T14:00:00.000Z');

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
    const detail = new WorkOrderDetail(row(), '2026-10-04');
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
