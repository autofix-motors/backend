import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../../../core/auth/session-user.js';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { WorkOrderQuotesService } from './work-order-quotes.service.js';
import {
  WITH_TIMELINE,
  type WorkOrdersService,
} from './work-orders.service.js';

// Lo que se prueba es lo que decide: desde qué estados se envía y se decide,
// la versión que sigue y la pendiente que queda reemplazada, la foto de los
// ítems (sin costo, sin apuntar al ítem vivo, en su orden), el total con
// Decimal, lo que queda en la línea de tiempo, que la decisión solo valga
// sobre la versión pendiente, y que un cambio simultáneo no se pise.

const ADMIN: SessionUser = { userId: 'admin-1', role: 'ADMIN' };

const D = (value: string) => new Prisma.Decimal(value);
const SENT_AT = new Date('2026-10-04T15:00:00.000Z');

const service1 = {
  workOrderItemId: 'item-1',
  workOrderId: 'wo-1',
  type: 'SERVICE' as const,
  serviceCatalogItemId: 'svc-1',
  productId: null,
  description: 'Cambio de aceite y filtro',
  quantity: D('1'),
  unitPrice: D('60'),
  unitCost: null,
};
const part1 = {
  workOrderItemId: 'item-2',
  workOrderId: 'wo-1',
  type: 'PRODUCT' as const,
  serviceCatalogItemId: null,
  productId: 'prod-1',
  description: 'ACE-1030-LT · Aceite de motor 10W-30 (litro)',
  quantity: D('1.25'),
  unitPrice: D('38.90'),
  unitCost: D('22.00'),
};

const quote = (overrides: Record<string, unknown> = {}) => ({
  quoteId: 'q-2',
  workOrderId: 'wo-1',
  version: 2,
  status: 'PENDING',
  ...overrides,
});

describe('WorkOrderQuotesService', () => {
  const tx = {
    workOrder: { update: vi.fn() },
    workOrderItem: { findMany: vi.fn() },
    quote: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };
  const workOrders = { findOne: vi.fn() };
  const service = new WorkOrderQuotesService(
    prisma as unknown as PrismaService,
    workOrders as unknown as WorkOrdersService,
  );

  const order = (overrides: Record<string, unknown> = {}) => ({
    workOrderId: 'wo-1',
    number: 123,
    status: 'DIAGNOSIS',
    mechanicId: 'mech-1',
    items: [service1, part1],
    quotes: [],
    ...overrides,
  });
  const knownError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(code, {
      code,
      clientVersion: 'test',
    });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SENT_AT);
    workOrders.findOne.mockResolvedValue(order());
    tx.workOrderItem.findMany.mockResolvedValue([service1, part1]);
    tx.quote.findFirst.mockResolvedValue({ version: 2 });
    tx.quote.updateMany.mockResolvedValue({ count: 1 });
    tx.quote.create.mockResolvedValue({});
    tx.workOrder.update.mockResolvedValue(order());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('send', () => {
    it('la versión sigue a la última y la pendiente anterior queda reemplazada', async () => {
      await service.send('wo-1', {}, ADMIN);
      expect(tx.quote.findFirst).toHaveBeenCalledWith({
        where: { workOrderId: 'wo-1' },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      expect(tx.quote.updateMany).toHaveBeenCalledWith({
        where: { workOrderId: 'wo-1', status: 'PENDING' },
        data: { status: 'SUPERSEDED' },
      });
      expect(tx.quote.create.mock.calls[0][0].data).toMatchObject({
        workOrderId: 'wo-1',
        version: 3,
        sentById: 'admin-1',
        sentAt: SENT_AT,
      });
      // El reemplazo va antes de crear la nueva: nunca hay dos PENDING.
      expect(tx.quote.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        tx.quote.create.mock.invocationCallOrder[0],
      );
    });

    it('la primera es la v1', async () => {
      tx.quote.findFirst.mockResolvedValue(null);
      await service.send('wo-1', {}, ADMIN);
      expect(tx.quote.create.mock.calls[0][0].data.version).toBe(1);
    });

    it('la foto copia tipo, descripción, cantidad y precio, sin costo ni ítem vivo, en su orden', async () => {
      await service.send('wo-1', {}, ADMIN);
      expect(tx.quote.create.mock.calls[0][0].data.items).toEqual({
        create: [
          {
            type: 'SERVICE',
            description: 'Cambio de aceite y filtro',
            quantity: D('1'),
            unitPrice: D('60'),
            createdAt: SENT_AT,
          },
          {
            type: 'PRODUCT',
            description: 'ACE-1030-LT · Aceite de motor 10W-30 (litro)',
            quantity: D('1.25'),
            unitPrice: D('38.90'),
            // Un milisegundo después: la foto conserva el orden de la orden.
            createdAt: new Date(SENT_AT.getTime() + 1),
          },
        ],
      });
    });

    it('la foto sale de los ítems leídos dentro de la transacción, después de tomar la orden', async () => {
      // Entre la lectura y la transacción, otro agregó un ítem: entra en la
      // foto, porque se leen después de bloquear la orden.
      const late = {
        ...service1,
        workOrderItemId: 'item-3',
        description: 'Afinamiento',
        unitPrice: D('180'),
      };
      tx.workOrderItem.findMany.mockResolvedValue([service1, part1, late]);
      await service.send('wo-1', {}, ADMIN);
      expect(tx.workOrderItem.findMany).toHaveBeenCalledWith({
        where: { workOrderId: 'wo-1' },
        orderBy: [{ createdAt: 'asc' }, { workOrderItemId: 'asc' }],
      });
      expect(tx.workOrder.update.mock.invocationCallOrder[0]).toBeLessThan(
        tx.workOrderItem.findMany.mock.invocationCallOrder[0],
      );
      expect(tx.quote.create.mock.calls[0][0].data.items.create).toHaveLength(
        3,
      );
      // 60.00 + 48.63 + 180.00
      expect(tx.quote.create.mock.calls[0][0].data.total.toFixed(2)).toBe(
        '288.63',
      );
    });

    it('el total es el de la orden, con Decimal y redondeo por línea', async () => {
      // 1.25 × 38.90 = 48.625 → 48.63; 0.1 + 0.2 no pasa por coma flotante.
      tx.workOrderItem.findMany.mockResolvedValue([
        part1,
        { ...service1, unitPrice: D('0.10') },
        { ...service1, unitPrice: D('0.20') },
      ]);
      await service.send('wo-1', {}, ADMIN);
      const { total } = tx.quote.create.mock.calls[0][0].data;
      expect(total).toBeInstanceOf(Prisma.Decimal);
      expect(total.toFixed(2)).toBe('48.93');
    });

    it('lleva la orden a «Esperando aprobación» con el estado leído en el where y un evento público', async () => {
      await service.send(
        'wo-1',
        { note: 'Incluye el cambio de la bomba de agua' },
        ADMIN,
      );
      expect(tx.workOrder.update).toHaveBeenNthCalledWith(1, {
        where: { workOrderId: 'wo-1', status: 'DIAGNOSIS' },
        data: { status: 'WAITING_APPROVAL' },
        select: { workOrderId: true },
      });
      expect(tx.workOrder.update).toHaveBeenNthCalledWith(2, {
        where: { workOrderId: 'wo-1' },
        data: {
          events: {
            create: {
              status: 'WAITING_APPROVAL',
              // 60.00 + 48.63
              note: 'Presupuesto v3 enviado: S/ 108.63\nIncluye el cambio de la bomba de agua',
              isPublic: true,
              createdById: 'admin-1',
              createdAt: SENT_AT,
            },
          },
        },
        include: WITH_TIMELINE,
      });
    });

    it('sin nota, el evento dice solo la versión y el total', async () => {
      await service.send('wo-1', { note: null }, ADMIN);
      expect(tx.workOrder.update.mock.calls[1][0].data.events.create.note).toBe(
        'Presupuesto v3 enviado: S/ 108.63',
      );
    });

    it.each(['IN_PROGRESS', 'WAITING_PARTS'])(
      'también se envía a mitad de la reparación (%s)',
      async (status) => {
        workOrders.findOne.mockResolvedValue(order({ status }));
        await service.send('wo-1', {}, ADMIN);
        expect(tx.workOrder.update.mock.calls[0][0].where).toEqual({
          workOrderId: 'wo-1',
          status,
        });
      },
    );

    it.each([
      ['RECEIVED', 'Recibido'],
      ['WAITING_APPROVAL', 'Esperando aprobación'],
      ['READY', 'Listo para recoger'],
      ['DELIVERED', 'Entregado'],
      ['CANCELLED', 'Cancelado'],
    ])('con la orden en %s: 409 y nada se escribe', async (status, label) => {
      workOrders.findOne.mockResolvedValue(order({ status }));
      await expect(service.send('wo-1', {}, ADMIN)).rejects.toThrow(
        new ConflictException(
          `No se puede enviar un presupuesto con la orden en «${label}»: se envía en diagnóstico, en reparación o esperando repuestos`,
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sin ítems: 400 y nada se escribe', async () => {
      workOrders.findOne.mockResolvedValue(order({ items: [] }));
      await expect(service.send('wo-1', {}, ADMIN)).rejects.toThrow(
        new BadRequestException(
          'Agrega al menos un servicio o repuesto antes de enviar el presupuesto',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si quitaron el último ítem entre medio: 400 dentro de la transacción, sin presupuesto', async () => {
      tx.workOrderItem.findMany.mockResolvedValue([]);
      await expect(service.send('wo-1', {}, ADMIN)).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.quote.create).not.toHaveBeenCalled();
    });

    it('si la orden cambió de estado entre medio: 409 y no se crea nada', async () => {
      tx.workOrder.update.mockRejectedValueOnce(knownError('P2025'));
      await expect(service.send('wo-1', {}, ADMIN)).rejects.toThrow(
        new ConflictException(
          'La orden cambió de estado mientras tanto: vuelve a cargarla',
        ),
      );
      expect(tx.quote.updateMany).not.toHaveBeenCalled();
      expect(tx.quote.create).not.toHaveBeenCalled();
    });

    it('una orden que el actor no ve no existe (404 de findOne)', async () => {
      workOrders.findOne.mockRejectedValue(
        new NotFoundException('No se encontró la orden de trabajo'),
      );
      await expect(service.send('wo-1', {}, ADMIN)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('decide', () => {
    const waiting = (quotes: unknown[] = [quote()]) =>
      order({ status: 'WAITING_APPROVAL', quotes });

    beforeEach(() => {
      workOrders.findOne.mockResolvedValue(waiting());
    });

    it('aprobado: guarda la decisión y lleva la orden a reparación con un evento público', async () => {
      await service.decide(
        'wo-1',
        'q-2',
        { decision: 'APPROVED', channel: 'WHATSAPP', note: 'Pide factura' },
        ADMIN,
      );
      expect(tx.quote.updateMany).toHaveBeenCalledWith({
        where: { quoteId: 'q-2', status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: 'admin-1',
          decidedAt: SENT_AT,
          decisionChannel: 'WHATSAPP',
          decisionNote: 'Pide factura',
        },
      });
      expect(tx.workOrder.update).toHaveBeenCalledWith({
        where: { workOrderId: 'wo-1', status: 'WAITING_APPROVAL' },
        data: {
          status: 'IN_PROGRESS',
          events: {
            create: {
              status: 'IN_PROGRESS',
              note: 'Presupuesto v2 aprobado',
              isPublic: true,
              createdById: 'admin-1',
              createdAt: SENT_AT,
            },
          },
        },
        include: WITH_TIMELINE,
      });
    });

    it('rechazado: la orden vuelve a diagnóstico; sin nota, null', async () => {
      await service.decide(
        'wo-1',
        'q-2',
        { decision: 'REJECTED', channel: 'PHONE' },
        ADMIN,
      );
      expect(tx.quote.updateMany.mock.calls[0][0].data).toMatchObject({
        status: 'REJECTED',
        decisionChannel: 'PHONE',
        decisionNote: null,
      });
      expect(tx.workOrder.update.mock.calls[0][0].data).toMatchObject({
        status: 'DIAGNOSIS',
        events: {
          create: { status: 'DIAGNOSIS', note: 'Presupuesto v2 rechazado' },
        },
      });
    });

    it.each([
      ['APPROVED', 'El presupuesto v1 ya se registró como aprobado'],
      ['REJECTED', 'El presupuesto v1 ya se registró como rechazado'],
      [
        'SUPERSEDED',
        'El presupuesto v1 fue reemplazado por una versión más nueva',
      ],
    ])(
      'solo sobre la versión pendiente: una %s da 409',
      async (status, message) => {
        workOrders.findOne.mockResolvedValue(
          waiting([quote(), quote({ quoteId: 'q-1', version: 1, status })]),
        );
        await expect(
          service.decide(
            'wo-1',
            'q-1',
            { decision: 'APPROVED', channel: 'PHONE' },
            ADMIN,
          ),
        ).rejects.toThrow(new ConflictException(message));
        expect(prisma.$transaction).not.toHaveBeenCalled();
      },
    );

    it('un presupuesto de otra orden, para esta, no existe (404)', async () => {
      await expect(
        service.decide(
          'wo-1',
          'q-otra',
          { decision: 'APPROVED', channel: 'PHONE' },
          ADMIN,
        ),
      ).rejects.toThrow(
        new NotFoundException('No se encontró el presupuesto en esta orden'),
      );
    });

    it('una pendiente en una orden que ya no espera (cancelada): 409', async () => {
      workOrders.findOne.mockResolvedValue(
        order({ status: 'CANCELLED', quotes: [quote()] }),
      );
      await expect(
        service.decide(
          'wo-1',
          'q-2',
          { decision: 'APPROVED', channel: 'IN_PERSON' },
          ADMIN,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'La orden está en «Cancelado»: la respuesta del cliente se registra mientras espera aprobación',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si otro registró la respuesta entre medio: 409 y la orden no se mueve', async () => {
      tx.quote.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.decide(
          'wo-1',
          'q-2',
          { decision: 'REJECTED', channel: 'PHONE' },
          ADMIN,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'El presupuesto cambió mientras tanto: vuelve a cargar la orden',
        ),
      );
      expect(tx.workOrder.update).not.toHaveBeenCalled();
    });

    it('si la orden cambió de estado entre medio: 409 (y la decisión se deshace con la transacción)', async () => {
      tx.workOrder.update.mockRejectedValue(knownError('P2025'));
      await expect(
        service.decide(
          'wo-1',
          'q-2',
          { decision: 'APPROVED', channel: 'PHONE' },
          ADMIN,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'La orden cambió de estado mientras tanto: vuelve a cargarla',
        ),
      );
    });

    it('otro error de la base no se disfraza de 409', async () => {
      tx.workOrder.update.mockRejectedValue(knownError('P2003'));
      await expect(
        service.decide(
          'wo-1',
          'q-2',
          { decision: 'APPROVED', channel: 'PHONE' },
          ADMIN,
        ),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });
});
