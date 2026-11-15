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

const ADMINISTRADOR: SessionUser = {
  usuarioId: 'admin-1',
  rol: 'ADMINISTRADOR',
};
const MECANICO: SessionUser = { usuarioId: 'mech-1', rol: 'MECANICO' };

const D = (value: string) => new Prisma.Decimal(value);
const SERVICE_ID = '7a1c4f0e-2b3d-4e5f-8a9b-0c1d2e3f4a5b';
const PRODUCT_ID = '3f2e1d0c-9b8a-4f6e-8d4c-3b2a1f0e9d8c';

const serviceItem = {
  detalleOrdenId: 'item-s',
  ordenTrabajoId: 'wo-1',
  tipo: 'SERVICIO' as const,
  servicioId: SERVICE_ID,
  productoId: null,
  descripcion: 'Cambio de aceite y filtro',
  cantidad: D('1'),
  precioUnitario: D('80'),
  costoUnitario: null,
  producto: null,
};
const productItem = {
  detalleOrdenId: 'item-p',
  ordenTrabajoId: 'wo-1',
  tipo: 'PRODUCTO' as const,
  servicioId: null,
  productoId: PRODUCT_ID,
  descripcion: 'FA-TOY-90915 · Filtro de aceite Toyota',
  cantidad: D('2'),
  precioUnitario: D('35'),
  costoUnitario: D('18.50'),
  producto: { unidad: 'UNIT' as const },
};

describe('WorkOrderItemsService', () => {
  const tx = {
    detalleOrden: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    ordenTrabajo: { update: vi.fn() },
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
    ordenTrabajoId: 'wo-1',
    numero: 123,
    estado: 'EN_REPARACION',
    mecanicoId: 'mech-1',
    detalles: [serviceItem, productItem],
    ...overrides,
  });
  const knownError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(code, {
      code,
      clientVersion: 'test',
    });
  const notaEvento = () =>
    tx.ordenTrabajo.update.mock.calls[0][0].data.eventos.create.nota;

  beforeEach(() => {
    workOrders.findOne.mockResolvedValue(order());
    serviceCatalog.findOne.mockResolvedValue({
      servicioId: SERVICE_ID,
      nombre: 'Cambio de aceite y filtro',
      precioManoObra: D('80'),
      activo: true,
    });
    products.findOne.mockResolvedValue({
      productoId: PRODUCT_ID,
      codigo: 'FA-TOY-90915',
      nombre: 'Filtro de aceite Toyota',
      precio: D('35'),
      costo: D('18.50'),
      activo: true,
    });
    tx.detalleOrden.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        detalleOrdenId: 'item-new',
        cantidad: D(String(data.cantidad)),
        precioUnitario: D(String(data.precioUnitario)),
      }),
    );
    tx.ordenTrabajo.update.mockResolvedValue(order());
    stockMovements.record.mockResolvedValue({});
  });

  afterEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('un servicio copia el nombre y el precio del catálogo, con cantidad 1', async () => {
      await service.create(
        'wo-1',
        { tipo: 'SERVICIO', servicioId: SERVICE_ID },
        MECANICO,
      );
      expect(tx.detalleOrden.create).toHaveBeenCalledWith({
        data: {
          ordenTrabajoId: 'wo-1',
          tipo: 'SERVICIO',
          servicioId: SERVICE_ID,
          productoId: null,
          descripcion: 'Cambio de aceite y filtro',
          cantidad: '1',
          precioUnitario: D('80'),
          costoUnitario: null,
        },
      });
      // Un servicio no mueve stock.
      expect(stockMovements.record).not.toHaveBeenCalled();
      expect(notaEvento()).toBe(
        'Se agregó: 1 × Cambio de aceite y filtro (S/ 80.00 c/u)',
      );
    });

    it('el administrador puede fijar su precio y su descripción', async () => {
      await service.create(
        'wo-1',
        {
          tipo: 'SERVICIO',
          servicioId: SERVICE_ID,
          cantidad: '2',
          precioUnitario: '70.00',
          descripcion: 'Cambio de aceite (precio de cliente frecuente)',
        },
        ADMINISTRADOR,
      );
      expect(tx.detalleOrden.create.mock.calls[0][0].data).toMatchObject({
        descripcion: 'Cambio de aceite (precio de cliente frecuente)',
        cantidad: '2',
        precioUnitario: '70.00',
      });
    });

    it('el mecánico no fija precios ni descripciones (403, nada se escribe)', async () => {
      for (const extra of [
        { precioUnitario: '1.00' },
        { descripcion: 'Otro' },
      ]) {
        await expect(
          service.create(
            'wo-1',
            { tipo: 'SERVICIO', servicioId: SERVICE_ID, ...extra },
            MECANICO,
          ),
        ).rejects.toThrow(
          new ForbiddenException(
            'Solo el administrador fija el precio o la descripción de un detalle',
          ),
        );
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('un repuesto copia «código · nombre», precio y costo, y descuenta el stock en la misma transacción', async () => {
      await service.create(
        'wo-1',
        { tipo: 'PRODUCTO', productoId: PRODUCT_ID, cantidad: '2' },
        MECANICO,
      );
      expect(tx.detalleOrden.create).toHaveBeenCalledWith({
        data: {
          ordenTrabajoId: 'wo-1',
          tipo: 'PRODUCTO',
          servicioId: null,
          productoId: PRODUCT_ID,
          descripcion: 'FA-TOY-90915 · Filtro de aceite Toyota',
          cantidad: '2',
          precioUnitario: D('35'),
          costoUnitario: D('18.50'),
        },
      });
      expect(stockMovements.record).toHaveBeenCalledWith(tx, {
        tipo: 'ORDEN_TRABAJO',
        productoId: PRODUCT_ID,
        cantidad: D('-2'),
        detalleOrdenId: 'item-new',
        nota: 'Consumo en OT-000123',
        creadoPorId: 'mech-1',
      });
      expect(tx.ordenTrabajo.update).toHaveBeenCalledWith({
        where: { ordenTrabajoId: 'wo-1', estado: 'EN_REPARACION' },
        data: {
          eventos: {
            create: {
              nota: 'Se agregó: 2 × FA-TOY-90915 · Filtro de aceite Toyota (S/ 35.00 c/u)',
              esPublico: false,
              creadoPorId: 'mech-1',
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
          { tipo: 'PRODUCTO', productoId: PRODUCT_ID, cantidad: '2' },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow('Stock insuficiente: quedan 1.00 de FA-TOY-90915');
      // El detalle se creó dentro de la transacción que se deshace con el error.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.ordenTrabajo.update).not.toHaveBeenCalled();
    });

    it('el servicio o el repuesto tiene que estar activo', async () => {
      serviceCatalog.findOne.mockResolvedValue({ activo: false });
      await expect(
        service.create(
          'wo-1',
          { tipo: 'SERVICIO', servicioId: SERVICE_ID },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(BadRequestException);
      products.findOne.mockResolvedValue({ activo: false });
      await expect(
        service.create(
          'wo-1',
          { tipo: 'PRODUCTO', productoId: PRODUCT_ID },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'El repuesto está inactivo: actívalo antes de agregarlo a una orden',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('un detalle es una cosa o la otra, nunca los dos', async () => {
      await expect(
        service.create(
          'wo-1',
          {
            tipo: 'SERVICIO',
            servicioId: SERVICE_ID,
            productoId: PRODUCT_ID,
          },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(
          'wo-1',
          {
            tipo: 'PRODUCTO',
            productoId: PRODUCT_ID,
            servicioId: SERVICE_ID,
          },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it.each(['ESPERANDO_APROBACION', 'LISTO', 'ENTREGADO', 'CANCELADO'])(
      '409 con la orden en %s',
      async (estado) => {
        workOrders.findOne.mockResolvedValue(order({ estado }));
        await expect(
          service.create(
            'wo-1',
            { tipo: 'SERVICIO', servicioId: SERVICE_ID },
            ADMINISTRADOR,
          ),
        ).rejects.toThrow(ConflictException);
        expect(serviceCatalog.findOne).not.toHaveBeenCalled();
      },
    );

    it('el 409 dice en qué estado está la orden', async () => {
      workOrders.findOne.mockResolvedValue(order({ estado: 'LISTO' }));
      await expect(
        service.create(
          'wo-1',
          { tipo: 'PRODUCTO', productoId: PRODUCT_ID },
          ADMINISTRADOR,
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
          { tipo: 'PRODUCTO', productoId: PRODUCT_ID },
          MECANICO,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('si la orden cambió de estado mientras tanto, 409 y se deshace todo', async () => {
      tx.ordenTrabajo.update.mockRejectedValue(knownError('P2025'));
      await expect(
        service.create(
          'wo-1',
          { tipo: 'PRODUCTO', productoId: PRODUCT_ID },
          ADMINISTRADOR,
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
      await service.update('wo-1', 'item-s', { cantidad: '2' }, MECANICO);
      expect(tx.detalleOrden.update).toHaveBeenCalledWith({
        where: { detalleOrdenId: 'item-s' },
        data: {
          cantidad: '2',
          precioUnitario: undefined,
          descripcion: undefined,
        },
      });
      expect(notaEvento()).toBe(
        'Se modificó «Cambio de aceite y filtro»: cantidad 1 → 2',
      );
    });

    it('la cantidad de un repuesto no se edita: se quita y se vuelve a agregar', async () => {
      await expect(
        service.update('wo-1', 'item-p', { cantidad: '3' }, ADMINISTRADOR),
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
        { precioUnitario: '32.00', descripcion: 'Filtro de aceite original' },
        ADMINISTRADOR,
      );
      expect(notaEvento()).toBe(
        'Se modificó «FA-TOY-90915 · Filtro de aceite Toyota»: precio S/ 35.00 → S/ 32.00, descripción «Filtro de aceite original»',
      );
    });

    it('el mecánico no cambia precios', async () => {
      await expect(
        service.update('wo-1', 'item-s', { precioUnitario: '1.00' }, MECANICO),
      ).rejects.toThrow(ForbiddenException);
    });

    it('sin nada distinto no escribe ni anota', async () => {
      const result = await service.update(
        'wo-1',
        'item-s',
        { cantidad: '1.00', precioUnitario: '80' },
        ADMINISTRADOR,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual(order());
    });

    it('un detalle de otra orden no existe en esta', async () => {
      await expect(
        service.update('wo-1', 'item-ajeno', { cantidad: '2' }, ADMINISTRADOR),
      ).rejects.toThrow(
        new NotFoundException('No se encontró el detalle en esta orden'),
      );
    });

    it('409 fuera de los estados en que se trabaja', async () => {
      workOrders.findOne.mockResolvedValue(order({ estado: 'ENTREGADO' }));
      await expect(
        service.update('wo-1', 'item-s', { cantidad: '2' }, ADMINISTRADOR),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('un repuesto vuelve al stock con un movimiento positivo, en la misma transacción', async () => {
      await service.remove('wo-1', 'item-p', MECANICO);
      expect(tx.detalleOrden.delete).toHaveBeenCalledWith({
        where: { detalleOrdenId: 'item-p' },
      });
      expect(stockMovements.record).toHaveBeenCalledWith(tx, {
        tipo: 'ORDEN_TRABAJO',
        productoId: PRODUCT_ID,
        cantidad: D('2'),
        detalleOrdenId: null,
        nota: 'Devolución: detalle quitado de OT-000123',
        creadoPorId: 'mech-1',
      });
      expect(notaEvento()).toBe(
        'Se quitó: 2 × FA-TOY-90915 · Filtro de aceite Toyota (S/ 35.00 c/u) (vuelve al stock)',
      );
    });

    it('un servicio se quita sin mover stock', async () => {
      await service.remove('wo-1', 'item-s', ADMINISTRADOR);
      expect(stockMovements.record).not.toHaveBeenCalled();
      expect(notaEvento()).toBe(
        'Se quitó: 1 × Cambio de aceite y filtro (S/ 80.00 c/u)',
      );
    });

    it('si otro ya lo quitó, el delete falla y el stock no vuelve dos veces', async () => {
      tx.detalleOrden.delete.mockRejectedValueOnce(knownError('P2025'));
      await expect(
        service.remove('wo-1', 'item-p', ADMINISTRADOR),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
      expect(stockMovements.record).not.toHaveBeenCalled();
    });

    it('409 fuera de los estados en que se trabaja', async () => {
      workOrders.findOne.mockResolvedValue(order({ estado: 'LISTO' }));
      await expect(
        service.remove('wo-1', 'item-p', ADMINISTRADOR),
      ).rejects.toThrow(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('404 si el detalle no es de la orden', async () => {
      await expect(
        service.remove('wo-1', 'otro', ADMINISTRADOR),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

describe('describeChanges', () => {
  const current = {
    descripcion: 'Afinamiento',
    cantidad: D('1'),
    precioUnitario: D('150'),
  };

  it('solo lo que cambia, comparado como número', () => {
    expect(
      describeChanges(current, { cantidad: '1.0', precioUnitario: '150.00' }),
    ).toBe('');
    expect(describeChanges(current, { cantidad: '1.5' })).toBe(
      'cantidad 1 → 1.50',
    );
    expect(
      describeChanges(current, {
        precioUnitario: '140',
        descripcion: 'Afinamiento mayor',
      }),
    ).toBe('precio S/ 150.00 → S/ 140.00, descripción «Afinamiento mayor»');
  });
});
