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
// detalles (sin costo, sin apuntar al detalle vivo, en su orden), el total con
// Decimal, lo que queda en la línea de tiempo, que la decisión solo valga
// sobre la versión pendiente, y que un cambio simultáneo no se pise.

const ADMINISTRADOR: SessionUser = {
  usuarioId: 'admin-1',
  rol: 'ADMINISTRADOR',
};

const D = (value: string) => new Prisma.Decimal(value);
const SENT_AT = new Date('2026-10-04T15:00:00.000Z');

const service1 = {
  detalleOrdenId: 'item-1',
  ordenTrabajoId: 'wo-1',
  tipo: 'SERVICIO' as const,
  servicioId: 'svc-1',
  productoId: null,
  descripcion: 'Cambio de aceite y filtro',
  cantidad: D('1'),
  precioUnitario: D('60'),
  costoUnitario: null,
};
const part1 = {
  detalleOrdenId: 'item-2',
  ordenTrabajoId: 'wo-1',
  tipo: 'PRODUCTO' as const,
  servicioId: null,
  productoId: 'prod-1',
  descripcion: 'ACE-1030-LT · Aceite de motor 10W-30 (litro)',
  cantidad: D('1.25'),
  precioUnitario: D('38.90'),
  costoUnitario: D('22.00'),
};

const presupuesto = (overrides: Record<string, unknown> = {}) => ({
  presupuestoId: 'q-2',
  ordenTrabajoId: 'wo-1',
  version: 2,
  estado: 'PENDIENTE',
  ...overrides,
});

describe('WorkOrderQuotesService', () => {
  const tx = {
    ordenTrabajo: { update: vi.fn() },
    detalleOrden: { findMany: vi.fn() },
    presupuesto: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn((work: (client: typeof tx) => unknown) => work(tx)),
  };
  const workOrders = { findOne: vi.fn(), findOneForCustomer: vi.fn() };
  const service = new WorkOrderQuotesService(
    prisma as unknown as PrismaService,
    workOrders as unknown as WorkOrdersService,
  );

  const order = (overrides: Record<string, unknown> = {}) => ({
    ordenTrabajoId: 'wo-1',
    numero: 123,
    estado: 'EN_DIAGNOSTICO',
    mecanicoId: 'mech-1',
    detalles: [service1, part1],
    presupuestos: [],
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
    tx.detalleOrden.findMany.mockResolvedValue([service1, part1]);
    tx.presupuesto.findFirst.mockResolvedValue({ version: 2 });
    tx.presupuesto.updateMany.mockResolvedValue({ count: 1 });
    tx.presupuesto.create.mockResolvedValue({});
    tx.ordenTrabajo.update.mockResolvedValue(order());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('send', () => {
    it('la versión sigue a la última y la pendiente anterior queda reemplazada', async () => {
      await service.send('wo-1', {}, ADMINISTRADOR);
      expect(tx.presupuesto.findFirst).toHaveBeenCalledWith({
        where: { ordenTrabajoId: 'wo-1' },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      expect(tx.presupuesto.updateMany).toHaveBeenCalledWith({
        where: { ordenTrabajoId: 'wo-1', estado: 'PENDIENTE' },
        data: { estado: 'REEMPLAZADO' },
      });
      expect(tx.presupuesto.create.mock.calls[0][0].data).toMatchObject({
        ordenTrabajoId: 'wo-1',
        version: 3,
        enviadoPorId: 'admin-1',
        enviadoEn: SENT_AT,
      });
      // El reemplazo va antes de crear la nueva: nunca hay dos PENDIENTE.
      expect(
        tx.presupuesto.updateMany.mock.invocationCallOrder[0],
      ).toBeLessThan(tx.presupuesto.create.mock.invocationCallOrder[0]);
    });

    it('la primera es la v1', async () => {
      tx.presupuesto.findFirst.mockResolvedValue(null);
      await service.send('wo-1', {}, ADMINISTRADOR);
      expect(tx.presupuesto.create.mock.calls[0][0].data.version).toBe(1);
    });

    it('la foto copia tipo, descripción, cantidad y precio, sin costo ni detalle vivo, en su orden', async () => {
      await service.send('wo-1', {}, ADMINISTRADOR);
      expect(tx.presupuesto.create.mock.calls[0][0].data.detalles).toEqual({
        create: [
          {
            tipo: 'SERVICIO',
            descripcion: 'Cambio de aceite y filtro',
            cantidad: D('1'),
            precioUnitario: D('60'),
            creadoEn: SENT_AT,
          },
          {
            tipo: 'PRODUCTO',
            descripcion: 'ACE-1030-LT · Aceite de motor 10W-30 (litro)',
            cantidad: D('1.25'),
            precioUnitario: D('38.90'),
            // Un milisegundo después: la foto conserva el orden de la orden.
            creadoEn: new Date(SENT_AT.getTime() + 1),
          },
        ],
      });
    });

    it('la foto sale de los detalles leídos dentro de la transacción, después de tomar la orden', async () => {
      // Entre la lectura y la transacción, otro agregó un detalle: entra en la
      // foto, porque se leen después de bloquear la orden.
      const late = {
        ...service1,
        detalleOrdenId: 'item-3',
        descripcion: 'Afinamiento',
        precioUnitario: D('180'),
      };
      tx.detalleOrden.findMany.mockResolvedValue([service1, part1, late]);
      await service.send('wo-1', {}, ADMINISTRADOR);
      expect(tx.detalleOrden.findMany).toHaveBeenCalledWith({
        where: { ordenTrabajoId: 'wo-1' },
        orderBy: [{ creadoEn: 'asc' }, { detalleOrdenId: 'asc' }],
      });
      expect(tx.ordenTrabajo.update.mock.invocationCallOrder[0]).toBeLessThan(
        tx.detalleOrden.findMany.mock.invocationCallOrder[0],
      );
      expect(
        tx.presupuesto.create.mock.calls[0][0].data.detalles.create,
      ).toHaveLength(3);
      // 60.00 + 48.63 + 180.00
      expect(tx.presupuesto.create.mock.calls[0][0].data.total.toFixed(2)).toBe(
        '288.63',
      );
    });

    it('el total es el de la orden, con Decimal y redondeo por línea', async () => {
      // 1.25 × 38.90 = 48.625 → 48.63; 0.1 + 0.2 no pasa por coma flotante.
      tx.detalleOrden.findMany.mockResolvedValue([
        part1,
        { ...service1, precioUnitario: D('0.10') },
        { ...service1, precioUnitario: D('0.20') },
      ]);
      await service.send('wo-1', {}, ADMINISTRADOR);
      const { total } = tx.presupuesto.create.mock.calls[0][0].data;
      expect(total).toBeInstanceOf(Prisma.Decimal);
      expect(total.toFixed(2)).toBe('48.93');
    });

    it('lleva la orden a «Esperando aprobación» con el estado leído en el where y un evento público', async () => {
      await service.send(
        'wo-1',
        { nota: 'Incluye el cambio de la bomba de agua' },
        ADMINISTRADOR,
      );
      expect(tx.ordenTrabajo.update).toHaveBeenNthCalledWith(1, {
        where: { ordenTrabajoId: 'wo-1', estado: 'EN_DIAGNOSTICO' },
        data: { estado: 'ESPERANDO_APROBACION' },
        select: { ordenTrabajoId: true },
      });
      expect(tx.ordenTrabajo.update).toHaveBeenNthCalledWith(2, {
        where: { ordenTrabajoId: 'wo-1' },
        data: {
          eventos: {
            create: {
              estado: 'ESPERANDO_APROBACION',
              // 60.00 + 48.63
              nota: 'Presupuesto v3 enviado: S/ 108.63\nIncluye el cambio de la bomba de agua',
              esPublico: true,
              creadoPorId: 'admin-1',
              creadoEn: SENT_AT,
            },
          },
        },
        include: WITH_TIMELINE,
      });
    });

    it('sin nota, el evento dice solo la versión y el total', async () => {
      await service.send('wo-1', { nota: null }, ADMINISTRADOR);
      expect(
        tx.ordenTrabajo.update.mock.calls[1][0].data.eventos.create.nota,
      ).toBe('Presupuesto v3 enviado: S/ 108.63');
    });

    it.each(['EN_REPARACION', 'ESPERANDO_REPUESTOS'])(
      'también se envía a mitad de la reparación (%s)',
      async (estado) => {
        workOrders.findOne.mockResolvedValue(order({ estado }));
        await service.send('wo-1', {}, ADMINISTRADOR);
        expect(tx.ordenTrabajo.update.mock.calls[0][0].where).toEqual({
          ordenTrabajoId: 'wo-1',
          estado,
        });
      },
    );

    it.each([
      ['RECIBIDO', 'Recibido'],
      ['ESPERANDO_APROBACION', 'Esperando aprobación'],
      ['LISTO', 'Listo para recoger'],
      ['ENTREGADO', 'Entregado'],
      ['CANCELADO', 'Cancelado'],
    ])('con la orden en %s: 409 y nada se escribe', async (estado, label) => {
      workOrders.findOne.mockResolvedValue(order({ estado }));
      await expect(service.send('wo-1', {}, ADMINISTRADOR)).rejects.toThrow(
        new ConflictException(
          `No se puede enviar un presupuesto con la orden en «${label}»: se envía en diagnóstico, en reparación o esperando repuestos`,
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sin detalles: 400 y nada se escribe', async () => {
      workOrders.findOne.mockResolvedValue(order({ detalles: [] }));
      await expect(service.send('wo-1', {}, ADMINISTRADOR)).rejects.toThrow(
        new BadRequestException(
          'Agrega al menos un servicio o repuesto antes de enviar el presupuesto',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si quitaron el último detalle entre medio: 400 dentro de la transacción, sin presupuesto', async () => {
      tx.detalleOrden.findMany.mockResolvedValue([]);
      await expect(service.send('wo-1', {}, ADMINISTRADOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.presupuesto.create).not.toHaveBeenCalled();
    });

    it('si la orden cambió de estado entre medio: 409 y no se crea nada', async () => {
      tx.ordenTrabajo.update.mockRejectedValueOnce(knownError('P2025'));
      await expect(service.send('wo-1', {}, ADMINISTRADOR)).rejects.toThrow(
        new ConflictException(
          'La orden cambió de estado mientras tanto: vuelve a cargarla',
        ),
      );
      expect(tx.presupuesto.updateMany).not.toHaveBeenCalled();
      expect(tx.presupuesto.create).not.toHaveBeenCalled();
    });

    it('una orden que el actor no ve no existe (404 de findOne)', async () => {
      workOrders.findOne.mockRejectedValue(
        new NotFoundException('No se encontró la orden de trabajo'),
      );
      await expect(service.send('wo-1', {}, ADMINISTRADOR)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('decide', () => {
    const waiting = (presupuestos: unknown[] = [presupuesto()]) =>
      order({ estado: 'ESPERANDO_APROBACION', presupuestos });

    beforeEach(() => {
      workOrders.findOne.mockResolvedValue(waiting());
    });

    it('aprobado: guarda la decisión y lleva la orden a reparación con un evento público', async () => {
      await service.decide(
        'wo-1',
        'q-2',
        { decision: 'APROBADO', canal: 'WHATSAPP', nota: 'Pide factura' },
        ADMINISTRADOR,
      );
      expect(tx.presupuesto.updateMany).toHaveBeenCalledWith({
        where: { presupuestoId: 'q-2', estado: 'PENDIENTE' },
        data: {
          estado: 'APROBADO',
          decididoPorId: 'admin-1',
          decididoEn: SENT_AT,
          canalDecision: 'WHATSAPP',
          notaDecision: 'Pide factura',
        },
      });
      expect(tx.ordenTrabajo.update).toHaveBeenCalledWith({
        where: { ordenTrabajoId: 'wo-1', estado: 'ESPERANDO_APROBACION' },
        data: {
          estado: 'EN_REPARACION',
          eventos: {
            create: {
              estado: 'EN_REPARACION',
              nota: 'Presupuesto v2 aprobado',
              esPublico: true,
              creadoPorId: 'admin-1',
              creadoEn: SENT_AT,
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
        { decision: 'RECHAZADO', canal: 'TELEFONO' },
        ADMINISTRADOR,
      );
      expect(tx.presupuesto.updateMany.mock.calls[0][0].data).toMatchObject({
        estado: 'RECHAZADO',
        canalDecision: 'TELEFONO',
        notaDecision: null,
      });
      expect(tx.ordenTrabajo.update.mock.calls[0][0].data).toMatchObject({
        estado: 'EN_DIAGNOSTICO',
        eventos: {
          create: {
            estado: 'EN_DIAGNOSTICO',
            nota: 'Presupuesto v2 rechazado',
          },
        },
      });
    });

    it.each([
      ['APROBADO', 'El presupuesto v1 ya se registró como aprobado'],
      ['RECHAZADO', 'El presupuesto v1 ya se registró como rechazado'],
      [
        'REEMPLAZADO',
        'El presupuesto v1 fue reemplazado por una versión más nueva',
      ],
    ])(
      'solo sobre la versión pendiente: una %s da 409',
      async (estado, message) => {
        workOrders.findOne.mockResolvedValue(
          waiting([
            presupuesto(),
            presupuesto({ presupuestoId: 'q-1', version: 1, estado }),
          ]),
        );
        await expect(
          service.decide(
            'wo-1',
            'q-1',
            { decision: 'APROBADO', canal: 'TELEFONO' },
            ADMINISTRADOR,
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
          { decision: 'APROBADO', canal: 'TELEFONO' },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(
        new NotFoundException('No se encontró el presupuesto en esta orden'),
      );
    });

    it('una pendiente en una orden que ya no espera (cancelada): 409', async () => {
      workOrders.findOne.mockResolvedValue(
        order({ estado: 'CANCELADO', presupuestos: [presupuesto()] }),
      );
      await expect(
        service.decide(
          'wo-1',
          'q-2',
          { decision: 'APROBADO', canal: 'EN_PERSONA' },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'La orden está en «Cancelado»: la respuesta del cliente se registra mientras espera aprobación',
        ),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si otro registró la respuesta entre medio: 409 y la orden no se mueve', async () => {
      tx.presupuesto.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.decide(
          'wo-1',
          'q-2',
          { decision: 'RECHAZADO', canal: 'TELEFONO' },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'El presupuesto cambió mientras tanto: vuelve a cargar la orden',
        ),
      );
      expect(tx.ordenTrabajo.update).not.toHaveBeenCalled();
    });

    it('si la orden cambió de estado entre medio: 409 (y la decisión se deshace con la transacción)', async () => {
      tx.ordenTrabajo.update.mockRejectedValue(knownError('P2025'));
      await expect(
        service.decide(
          'wo-1',
          'q-2',
          { decision: 'APROBADO', canal: 'TELEFONO' },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'La orden cambió de estado mientras tanto: vuelve a cargarla',
        ),
      );
    });

    it('otro error de la base no se disfraza de 409', async () => {
      tx.ordenTrabajo.update.mockRejectedValue(knownError('P2003'));
      await expect(
        service.decide(
          'wo-1',
          'q-2',
          { decision: 'APROBADO', canal: 'TELEFONO' },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });
  });
  describe('decideByCustomer', () => {
    const waiting = (presupuestos: unknown[] = [presupuesto()]) =>
      order({ estado: 'ESPERANDO_APROBACION', presupuestos });

    beforeEach(() => {
      workOrders.findOneForCustomer.mockResolvedValue(waiting());
    });

    it('busca la orden solo entre las del cliente', async () => {
      await service.decideByCustomer(
        'wo-1',
        'q-2',
        { decision: 'APROBADO' },
        'cust-1',
      );
      expect(workOrders.findOneForCustomer).toHaveBeenCalledWith(
        'wo-1',
        'cust-1',
      );
      expect(workOrders.findOne).not.toHaveBeenCalled();
    });

    it('guarda el canal PORTAL sin autor, y el evento público sin autor', async () => {
      await service.decideByCustomer(
        'wo-1',
        'q-2',
        { decision: 'APROBADO', nota: 'Adelante' },
        'cust-1',
      );
      expect(tx.presupuesto.updateMany).toHaveBeenCalledWith({
        where: { presupuestoId: 'q-2', estado: 'PENDIENTE' },
        data: {
          estado: 'APROBADO',
          decididoPorId: null,
          decididoEn: SENT_AT,
          canalDecision: 'PORTAL',
          notaDecision: 'Adelante',
        },
      });
      expect(tx.ordenTrabajo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            estado: 'EN_REPARACION',
            eventos: {
              create: {
                estado: 'EN_REPARACION',
                nota: 'Presupuesto v2 aprobado por el cliente desde el portal',
                esPublico: true,
                creadoPorId: null,
                creadoEn: SENT_AT,
              },
            },
          },
        }),
      );
    });

    it('rechazado: la orden vuelve a diagnóstico', async () => {
      await service.decideByCustomer(
        'wo-1',
        'q-2',
        { decision: 'RECHAZADO' },
        'cust-1',
      );
      expect(tx.ordenTrabajo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estado: 'EN_DIAGNOSTICO' }),
        }),
      );
    });

    it('una orden de otro cliente no existe (404 de findOneForCustomer)', async () => {
      workOrders.findOneForCustomer.mockRejectedValue(
        new NotFoundException('No se encontró la orden de trabajo'),
      );
      await expect(
        service.decideByCustomer('wo-1', 'q-2', { decision: 'APROBADO' }, 'x'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('con la respuesta ya registrada (por el taller), 409 y nada se escribe', async () => {
      workOrders.findOneForCustomer.mockResolvedValue(
        waiting([presupuesto({ estado: 'APROBADO' })]),
      );
      await expect(
        service.decideByCustomer(
          'wo-1',
          'q-2',
          { decision: 'RECHAZADO' },
          'cust-1',
        ),
      ).rejects.toThrow(
        new ConflictException('El presupuesto v2 ya se registró como aprobado'),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('si la orden ya no espera aprobación (la cancelaron), 409', async () => {
      workOrders.findOneForCustomer.mockResolvedValue(
        order({ estado: 'CANCELADO', presupuestos: [presupuesto()] }),
      );
      await expect(
        service.decideByCustomer(
          'wo-1',
          'q-2',
          { decision: 'APROBADO' },
          'cust-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('si el taller registró la respuesta entre medio, 409', async () => {
      tx.presupuesto.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.decideByCustomer(
          'wo-1',
          'q-2',
          { decision: 'APROBADO' },
          'cust-1',
        ),
      ).rejects.toThrow(
        new ConflictException(
          'El presupuesto cambió mientras tanto: vuelve a cargar la orden',
        ),
      );
      expect(tx.ordenTrabajo.update).not.toHaveBeenCalled();
    });
  });
});
