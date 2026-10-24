import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../../../core/auth/session-user.js';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { ProductsService } from '../../inventory/products/products.service.js';
import type { StockMovementsService } from '../../inventory/stock-movements/stock-movements.service.js';
import type { ServiceCatalogService } from '../service-catalog/service-catalog.service.js';
import {
  describeChanges,
  WorkOrderItemsService,
} from './work-order-items.service.js';
import {
  WITH_TIMELINE,
  type WorkOrdersService,
} from './work-orders.service.js';

// Lo que se prueba es lo que decide: quién agrega y quién fija precios, en
// qué estados, de dónde salen la descripción, el precio y el costo, que el
// repuesto mueva el stock en la misma transacción (y que sin stock no quede
// nada), que al quitarlo vuelva, y lo que queda en la línea de tiempo.

const ADMIN: SessionUser = { userId: 'admin-1', role: 'ADMIN' };
const MECHANIC: SessionUser = { userId: 'mech-1', role: 'MECHANIC' };

const D = (value: string) => new Prisma.Decimal(value);
const SERVICE_ID = '7a1c4f0e-2b3d-4e5f-8a9b-0c1d2e3f4a5b';
const PRODUCT_ID = '3f2e1d0c-9b8a-4f6e-8d4c-3b2a1f0e9d8c';

const serviceItem = {
  workOrderItemId: 'item-s',
  workOrderId: 'wo-1',
  type: 'SERVICE' as const,
  serviceCatalogItemId: SERVICE_ID,
  productId: null,
  description: 'Cambio de aceite y filtro',
  quantity: D('1'),
  unitPrice: D('80'),
  unitCost: null,
  product: null,
};
const productItem = {
  workOrderItemId: 'item-p',
  workOrderId: 'wo-1',
  type: 'PRODUCT' as const,
  serviceCatalogItemId: null,
  productId: PRODUCT_ID,
  description: 'FA-TOY-90915 · Filtro de aceite Toyota',
  quantity: D('2'),
  unitPrice: D('35'),
  unitCost: D('18.50'),
  product: { unit: 'UNIT' as const },
};

describe('WorkOrderItemsService', () => {
  const tx = {
    workOrderItem: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    workOrder: { update: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };
  const workOrders = { findOne: vi.fn() };
  const serviceCatalog = { findOne: vi.fn() };
  const products = { findOne: vi.fn() };
  const stockMovements = { record: vi.fn() };
  const service = new WorkOrderItemsService(
    prisma as unknown as PrismaService,
    workOrders as unknown as WorkOrdersService,
    serviceCatalog as unknown as ServiceCatalogService,
    products as unknown as ProductsService,
    stockMovements as unknown as StockMovementsService,
  );

  const order = (overrides: Record<string, unknown> = {}) => ({
    workOrderId: 'wo-1',
    number: 123,
    status: 'IN_PROGRESS',
    mechanicId: 'mech-1',
    items: [serviceItem, productItem],
    ...overrides,
  });
  const knownError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(code, {
      code,
      clientVersion: 'test',
    });
  const eventNote = () =>
    tx.workOrder.update.mock.calls[0][0].data.events.create.note;

  beforeEach(() => {
    workOrders.findOne.mockResolvedValue(order());
    serviceCatalog.findOne.mockResolvedValue({
      serviceCatalogItemId: SERVICE_ID,
      name: 'Cambio de aceite y filtro',
      laborPrice: D('80'),
      isActive: true,
    });
    products.findOne.mockResolvedValue({
      productId: PRODUCT_ID,
      code: 'FA-TOY-90915',
      name: 'Filtro de aceite Toyota',
      price: D('35'),
      cost: D('18.50'),
      isActive: true,
    });
    tx.workOrderItem.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        workOrderItemId: 'item-new',
        quantity: D(String(data.quantity)),
        unitPrice: D(String(data.unitPrice)),
      }),
    );
    tx.workOrder.update.mockResolvedValue(order());
    stockMovements.record.mockResolvedValue({});
  });

  afterEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('un servicio copia el nombre y el precio del catálogo, con cantidad 1', async () => {
      await service.create(
        'wo-1',
        { type: 'SERVICE', serviceCatalogItemId: SERVICE_ID },
        MECHANIC,
      );
      expect(tx.workOrderItem.create).toHaveBeenCalledWith({
        data: {
          workOrderId: 'wo-1',
          type: 'SERVICE',
          serviceCatalogItemId: SERVICE_ID,
          productId: null,
          description: 'Cambio de aceite y filtro',
          quantity: '1',
          unitPrice: D('80'),
          unitCost: null,
        },
      });
      // Un servicio no mueve stock.
      expect(stockMovements.record).not.toHaveBeenCalled();
      expect(eventNote()).toBe(
        'Se agregó: 1 × Cambio de aceite y filtro (S/ 80.00 c/u)',
      );
    });

    it('el administrador puede fijar su precio y su descripción', async () => {
      await service.create(
        'wo-1',
        {
          type: 'SERVICE',
          serviceCatalogItemId: SERVICE_ID,
          quantity: '2',
          unitPrice: '70.00',
          description: 'Cambio de aceite (precio de cliente frecuente)',
        },
        ADMIN,
      );
      expect(tx.workOrderItem.create.mock.calls[0][0].data).toMatchObject({
        description: 'Cambio de aceite (precio de cliente frecuente)',
        quantity: '2',
        unitPrice: '70.00',
      });
    });

    it('el mecánico no fija precios ni descripciones (403, nada se escribe)', async () => {
      for (const extra of [{ unitPrice: '1.00' }, { description: 'Otro' }]) {
        await expect(
          service.create(
            'wo-1',
            { type: 'SERVICE', serviceCatalogItemId: SERVICE_ID, ...extra },
            MECHANIC,
          ),
        ).rejects.toThrow(
          new ForbiddenException(
            'Solo el administrador fija el precio o la descripción de un ítem',
          ),
        );
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('un repuesto copia «código · nombre», precio y costo, y descuenta el stock en la misma transacción', async () => {
      await service.create(
        'wo-1',
        { type: 'PRODUCT', productId: PRODUCT_ID, quantity: '2' },
        MECHANIC,
      );
      expect(tx.workOrderItem.create).toHaveBeenCalledWith({
        data: {
          workOrderId: 'wo-1',
          type: 'PRODUCT',
          serviceCatalogItemId: null,
          productId: PRODUCT_ID,
          description: 'FA-TOY-90915 · Filtro de aceite Toyota',
          quantity: '2',
          unitPrice: D('35'),
          unitCost: D('18.50'),
        },
      });
      expect(stockMovements.record).toHaveBeenCalledWith(tx, {
        type: 'WORK_ORDER',
        productId: PRODUCT_ID,
        quantity: D('-2'),
        workOrderItemId: 'item-new',
        note: 'Consumo en OT-000123',
        createdById: 'mech-1',
      });
      expect(tx.workOrder.update).toHaveBeenCalledWith({
        where: { workOrderId: 'wo-1', status: 'IN_PROGRESS' },
        data: {
          events: {
            create: {
              note: 'Se agregó: 2 × FA-TOY-90915 · Filtro de aceite Toyota (S/ 35.00 c/u)',
              isPublic: false,
              createdById: 'mech-1',
            },
          },
        },
        include: WITH_TIMELINE,
      });
    });

    it('sin stock suficiente falla con 409 y no anota nada (la transacción se deshace)', async () => {
      stockMovements.record.mockRejectedValue(
        new ConflictException(
          'Stock insuficiente: quedan 1.00 de FA-TOY-90915',
        ),
      );
      await expect(
        service.create(
          'wo-1',
          { type: 'PRODUCT', productId: PRODUCT_ID, quantity: '2' },
          ADMIN,
        ),
      ).rejects.toThrow('Stock insuficiente: quedan 1.00 de FA-TOY-90915');
      // El ítem se creó dentro de la transacción que se deshace con el error.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.workOrder.update).not.toHaveBeenCalled();
    });

    it('el servicio o el repuesto tiene que estar activo', async () => {
      serviceCatalog.findOne.mockResolvedValue({ isActive: false });
      await expect(
        service.create(
          'wo-1',
          { type: 'SERVICE', serviceCatalogItemId: SERVICE_ID },
          ADMIN,
        ),
      ).rejects.toThrow(BadRequestException);
      products.findOne.mockResolvedValue({ isActive: false });
      await expect(
        service.create(
          'wo-1',
          { type: 'PRODUCT', productId: PRODUCT_ID },
          ADMIN,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'El repuesto está inactivo: actívalo antes de agregarlo a una orden',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('un ítem es una cosa o la otra, nunca los dos', async () => {
      await expect(
        service.create(
          'wo-1',
          {
            type: 'SERVICE',
            serviceCatalogItemId: SERVICE_ID,
            productId: PRODUCT_ID,
          },
          ADMIN,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(
          'wo-1',
          {
            type: 'PRODUCT',
            productId: PRODUCT_ID,
            serviceCatalogItemId: SERVICE_ID,
          },
          ADMIN,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it.each(['WAITING_APPROVAL', 'READY', 'DELIVERED', 'CANCELLED'])(
      '409 con la orden en %s',
      async (status) => {
        workOrders.findOne.mockResolvedValue(order({ status }));
        await expect(
          service.create(
            'wo-1',
            { type: 'SERVICE', serviceCatalogItemId: SERVICE_ID },
            ADMIN,
          ),
        ).rejects.toThrow(ConflictException);
        expect(serviceCatalog.findOne).not.toHaveBeenCalled();
      },
    );

    it('el 409 dice en qué estado está la orden', async () => {
      workOrders.findOne.mockResolvedValue(order({ status: 'READY' }));
      await expect(
        service.create(
          'wo-1',
          { type: 'PRODUCT', productId: PRODUCT_ID },
          ADMIN,
        ),
      ).rejects.toThrow(
        'Los servicios y repuestos no se pueden cambiar con la orden en «Listo para recoger»',
      );
    });

    it('la orden de otro mecánico no existe para él', async () => {
      workOrders.findOne.mockRejectedValue(
        new NotFoundException('No se encontró la orden de trabajo'),
      );
      await expect(
        service.create(
          'wo-1',
          { type: 'PRODUCT', productId: PRODUCT_ID },
          MECHANIC,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('si la orden cambió de estado mientras tanto, 409 y se deshace todo', async () => {
      tx.workOrder.update.mockRejectedValue(knownError('P2025'));
      await expect(
        service.create(
          'wo-1',
          { type: 'PRODUCT', productId: PRODUCT_ID },
          ADMIN,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'La orden cambió de estado mientras tanto: vuelve a cargarla',
        ),
      );
    });
  });

  describe('update', () => {
    it('la cantidad de un servicio, también para el mecánico', async () => {
      await service.update('wo-1', 'item-s', { quantity: '2' }, MECHANIC);
      expect(tx.workOrderItem.update).toHaveBeenCalledWith({
        where: { workOrderItemId: 'item-s' },
        data: { quantity: '2', unitPrice: undefined, description: undefined },
      });
      expect(eventNote()).toBe(
        'Se modificó «Cambio de aceite y filtro»: cantidad 1 → 2',
      );
    });

    it('la cantidad de un repuesto no se edita: se quita y se vuelve a agregar', async () => {
      await expect(
        service.update('wo-1', 'item-p', { quantity: '3' }, ADMIN),
      ).rejects.toThrow(
        new BadRequestException(
          'La cantidad de un repuesto no se cambia: quítalo y vuelve a agregarlo con la cantidad correcta',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('el administrador cambia el precio y la descripción de un repuesto', async () => {
      await service.update(
        'wo-1',
        'item-p',
        { unitPrice: '32.00', description: 'Filtro de aceite original' },
        ADMIN,
      );
      expect(eventNote()).toBe(
        'Se modificó «FA-TOY-90915 · Filtro de aceite Toyota»: precio S/ 35.00 → S/ 32.00, descripción «Filtro de aceite original»',
      );
    });

    it('el mecánico no cambia precios', async () => {
      await expect(
        service.update('wo-1', 'item-s', { unitPrice: '1.00' }, MECHANIC),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sin nada distinto no escribe ni anota', async () => {
      const result = await service.update(
        'wo-1',
        'item-s',
        { quantity: '1.00', unitPrice: '80' },
        ADMIN,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual(order());
    });

    it('un ítem de otra orden no existe en esta', async () => {
      await expect(
        service.update('wo-1', 'item-ajeno', { quantity: '2' }, ADMIN),
      ).rejects.toThrow(
        new NotFoundException('No se encontró el ítem en esta orden'),
      );
    });

    it('409 fuera de los estados en que se trabaja', async () => {
      workOrders.findOne.mockResolvedValue(order({ status: 'DELIVERED' }));
      await expect(
        service.update('wo-1', 'item-s', { quantity: '2' }, ADMIN),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('un repuesto vuelve al stock con un movimiento positivo, en la misma transacción', async () => {
      await service.remove('wo-1', 'item-p', MECHANIC);
      expect(tx.workOrderItem.delete).toHaveBeenCalledWith({
        where: { workOrderItemId: 'item-p' },
      });
      expect(stockMovements.record).toHaveBeenCalledWith(tx, {
        type: 'WORK_ORDER',
        productId: PRODUCT_ID,
        quantity: D('2'),
        workOrderItemId: null,
        note: 'Devolución: ítem quitado de OT-000123',
        createdById: 'mech-1',
      });
      expect(eventNote()).toBe(
        'Se quitó: 2 × FA-TOY-90915 · Filtro de aceite Toyota (S/ 35.00 c/u) (vuelve al stock)',
      );
    });

    it('un servicio se quita sin mover stock', async () => {
      await service.remove('wo-1', 'item-s', ADMIN);
      expect(stockMovements.record).not.toHaveBeenCalled();
      expect(eventNote()).toBe(
        'Se quitó: 1 × Cambio de aceite y filtro (S/ 80.00 c/u)',
      );
    });

    it('si otro ya lo quitó, el delete falla y el stock no vuelve dos veces', async () => {
      tx.workOrderItem.delete.mockRejectedValueOnce(knownError('P2025'));
      await expect(service.remove('wo-1', 'item-p', ADMIN)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
      expect(stockMovements.record).not.toHaveBeenCalled();
    });

    it('409 fuera de los estados en que se trabaja', async () => {
      workOrders.findOne.mockResolvedValue(order({ status: 'READY' }));
      await expect(service.remove('wo-1', 'item-p', ADMIN)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404 si el ítem no es de la orden', async () => {
      await expect(service.remove('wo-1', 'otro', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

describe('describeChanges', () => {
  const current = {
    description: 'Afinamiento',
    quantity: D('1'),
    unitPrice: D('150'),
  };

  it('solo lo que cambia, comparado como número', () => {
    expect(
      describeChanges(current, { quantity: '1.0', unitPrice: '150.00' }),
    ).toBe('');
    expect(describeChanges(current, { quantity: '1.5' })).toBe(
      'cantidad 1 → 1.50',
    );
    expect(
      describeChanges(current, {
        unitPrice: '140',
        description: 'Afinamiento mayor',
      }),
    ).toBe('precio S/ 150.00 → S/ 140.00, descripción «Afinamiento mayor»');
  });
});
