import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../../../core/auth/session-user.js';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { UsersService } from '../../core/users/users.service.js';
import type { CustomersService } from '../../customer/customers/customers.service.js';
import type { VehiclesService } from '../../customer/vehicles/vehicles.service.js';
import {
  WorkOrdersService,
  workOrdersOrderBy,
  workOrdersWhere,
} from './work-orders.service.js';

// Lo que se prueba es lo que decide: la búsqueda, los filtros y las vencidas;
// quién ve y quién mueve cada orden; el cliente congelado del dueño y la orden
// abierta repetida; el código de seguimiento que se vuelve a sortear; y lo que
// cada cambio deja en la línea de tiempo.

const ADMIN: SessionUser = { userId: 'admin-1', role: 'ADMIN' };
const MECHANIC: SessionUser = { userId: 'mech-1', role: 'MECHANIC' };
const OTHER_MECHANIC: SessionUser = { userId: 'mech-2', role: 'MECHANIC' };

// Hoy en Lima: 4 de octubre (las 10:00 de Lima son las 15:00 UTC).
const NOW = new Date('2026-10-04T15:00:00.000Z');
const TODAY_COLUMN = new Date('2026-10-04T00:00:00.000Z');

describe('workOrdersWhere', () => {
  const today = '2026-10-04';

  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(workOrdersWhere({}, today)).toEqual({
      status: undefined,
      mechanicId: undefined,
      vehicleId: undefined,
      customerId: undefined,
      receivedAt: undefined,
    });
  });

  it('un texto numérico busca también por número de orden', () => {
    const text = { contains: 'OT-000123', mode: 'insensitive' };
    expect(workOrdersWhere({ search: 'OT-000123' }, today).OR).toEqual([
      { number: 123 },
      { vehicle: { plate: { contains: 'OT000123' } } },
      { customer: { name: text } },
      { trackingCode: text },
    ]);
  });

  it('un texto que no es número busca placa, cliente y código', () => {
    const text = { contains: 'abk-5', mode: 'insensitive' };
    // La placa se busca normalizada, como se guarda.
    expect(workOrdersWhere({ search: 'abk-5' }, today).OR).toEqual([
      { vehicle: { plate: { contains: 'ABK5' } } },
      { customer: { name: text } },
      { trackingCode: text },
    ]);
  });

  it('una búsqueda de solo guiones no busca placas', () => {
    expect(workOrdersWhere({ search: '--' }, today).OR).toHaveLength(2);
  });

  it('filtra por uno o varios estados, mecánico, vehículo y cliente', () => {
    expect(
      workOrdersWhere(
        {
          status: ['RECEIVED', 'DIAGNOSIS'],
          mechanicId: 'm1',
          vehicleId: 'v1',
          customerId: 'c1',
        },
        today,
      ),
    ).toMatchObject({
      status: { in: ['RECEIVED', 'DIAGNOSIS'] },
      mechanicId: 'm1',
      vehicleId: 'v1',
      customerId: 'c1',
    });
  });

  it('vencidas: prometidas antes de hoy en Lima y todavía en el taller', () => {
    const overdue = {
      promisedDate: { lt: TODAY_COLUMN },
      status: { notIn: ['DELIVERED', 'CANCELLED'] },
    };
    expect(workOrdersWhere({ overdue: true }, today).AND).toEqual([overdue]);
    expect(workOrdersWhere({ overdue: false }, today).AND).toEqual([
      { NOT: overdue },
    ]);
  });

  it('el filtro de vencidas no pisa el de estado: se combinan', () => {
    const where = workOrdersWhere(
      { status: ['IN_PROGRESS'], overdue: true },
      today,
    );
    expect(where.status).toEqual({ in: ['IN_PROGRESS'] });
    expect(where.AND).toHaveLength(1);
  });

  it('el rango de ingreso son días de Lima, con el «hasta» inclusivo', () => {
    expect(
      workOrdersWhere({ from: '2026-10-01', to: '2026-10-04' }, today)
        .receivedAt,
    ).toEqual({
      gte: new Date('2026-10-01T05:00:00.000Z'),
      lt: new Date('2026-10-05T05:00:00.000Z'),
    });
  });
});

describe('workOrdersOrderBy', () => {
  it('sin fecha prometida va al final en los dos sentidos', () => {
    expect(
      workOrdersOrderBy({ sortBy: 'promisedDate', sortOrder: 'desc' }),
    ).toEqual({ promisedDate: { sort: 'desc', nulls: 'last' } });
  });

  it('los demás campos, tal cual', () => {
    expect(workOrdersOrderBy({ sortBy: 'number', sortOrder: 'asc' })).toEqual({
      number: 'asc',
    });
  });
});

describe('WorkOrdersService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    workOrder: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const vehicles = { findOne: vi.fn() };
  const customers = { findOne: vi.fn() };
  const users = { findOne: vi.fn() };
  const service = new WorkOrdersService(
    prisma as unknown as PrismaService,
    vehicles as unknown as VehiclesService,
    customers as unknown as CustomersService,
    users as unknown as UsersService,
  );

  const order = (overrides: Record<string, unknown> = {}) => ({
    workOrderId: 'wo-1',
    number: 123,
    status: 'RECEIVED',
    mechanicId: 'mech-1',
    promisedDate: null,
    ...overrides,
  });
  const knownError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(code, {
      code,
      clientVersion: 'test',
    });
  const validCreate = {
    vehicleId: 'veh-1',
    mileageIn: 84500,
    reason: 'Ruido al frenar',
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vehicles.findOne.mockResolvedValue({
      vehicleId: 'veh-1',
      customerId: 'owner-1',
    });
    customers.findOne.mockResolvedValue({
      customerId: 'owner-1',
      isActive: true,
    });
    users.findOne.mockResolvedValue({
      userId: 'mech-1',
      name: 'Carlos Huamán Quispe',
      isActive: true,
    });
    prisma.workOrder.findFirst.mockResolvedValue(null);
    prisma.workOrder.create.mockImplementation(
      ({ data }: { data: object }) => ({ ...data }),
    );
    prisma.workOrder.update.mockImplementation(
      ({ data }: { data: object }) => ({ ...order(), ...data }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.workOrder.findMany.mockResolvedValue([]);
      prisma.workOrder.count.mockResolvedValue(15);
    });

    const query = {
      page: 2,
      pageSize: 10,
      sortBy: 'receivedAt' as const,
      sortOrder: 'desc' as const,
    };

    it('pagina y desempata el orden por el id', async () => {
      const page = await service.findAll(
        { ...query, mechanicId: 'mech-9' },
        ADMIN,
      );
      expect(prisma.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ mechanicId: 'mech-9' }),
          orderBy: [{ receivedAt: 'desc' }, { workOrderId: 'asc' }],
          skip: 10,
          take: 10,
        }),
      );
      expect(page.meta).toEqual({
        page: 2,
        pageSize: 10,
        total: 15,
        totalPages: 2,
      });
    });

    it('de los ítems trae solo lo que suma el total, en la misma consulta', async () => {
      await service.findAll(query, ADMIN);
      expect(prisma.workOrder.findMany.mock.calls[0][0].include.items).toEqual({
        select: { type: true, quantity: true, unitPrice: true },
      });
    });

    it('el mecánico solo ve las suyas, pida lo que pida', async () => {
      await service.findAll({ ...query, mechanicId: 'mech-9' }, MECHANIC);
      await service.findAll(query, MECHANIC);
      for (const [args] of prisma.workOrder.findMany.mock.calls) {
        expect(args.where.mechanicId).toBe('mech-1');
      }
      expect(prisma.workOrder.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ mechanicId: 'mech-1' }),
      });
    });

    it('las vencidas se cuentan desde el día de Lima', async () => {
      // Las 23:30 del 4 en Lima ya son el 5 en UTC.
      vi.setSystemTime(new Date('2026-10-05T04:30:00.000Z'));
      await service.findAll({ ...query, overdue: true }, ADMIN);
      const [args] = prisma.workOrder.findMany.mock.calls[0];
      expect(args.where.AND[0].promisedDate).toEqual({ lt: TODAY_COLUMN });
    });
  });

  describe('findOne', () => {
    it('el administrador y el mecánico asignado la ven', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await expect(service.findOne('wo-1', ADMIN)).resolves.toBeTruthy();
      await expect(service.findOne('wo-1', MECHANIC)).resolves.toBeTruthy();
    });

    it('para otro mecánico no existe (404, no 403)', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await expect(service.findOne('wo-1', OTHER_MECHANIC)).rejects.toThrow(
        new NotFoundException('No se encontró la orden de trabajo'),
      );
      prisma.workOrder.findUnique.mockResolvedValue(
        order({ mechanicId: null }),
      );
      await expect(service.findOne('wo-1', MECHANIC)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404 si no existe', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(null);
      await expect(service.findOne('wo-1', ADMIN)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('congela al dueño actual del vehículo y nace con su evento RECEIVED', async () => {
      await service.create(
        { ...validCreate, promisedDate: '2026-10-04', mechanicId: 'mech-1' },
        ADMIN,
      );
      const { data } = prisma.workOrder.create.mock.calls[0][0];
      expect(data).toMatchObject({
        vehicleId: 'veh-1',
        customerId: 'owner-1',
        mechanicId: 'mech-1',
        createdById: 'admin-1',
        mileageIn: 84500,
        reason: 'Ruido al frenar',
        promisedDate: TODAY_COLUMN,
        events: {
          create: {
            status: 'RECEIVED',
            note: 'Vehículo recibido en el taller',
            isPublic: true,
            createdById: 'admin-1',
          },
        },
      });
      expect(data.trackingCode).toMatch(/^AFM-[2-9A-HJKMNP-Z]{6}$/);
      expect(customers.findOne).toHaveBeenCalledWith('owner-1');
    });

    it('sin mecánico ni fecha prometida quedan vacíos', async () => {
      await service.create(validCreate, ADMIN);
      const { data } = prisma.workOrder.create.mock.calls[0][0];
      expect(data).toMatchObject({ mechanicId: null, promisedDate: null });
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('400 si el dueño del vehículo está inactivo', async () => {
      customers.findOne.mockResolvedValue({ isActive: false });
      await expect(service.create(validCreate, ADMIN)).rejects.toThrow(
        new BadRequestException(
          'El dueño del vehículo está inactivo: actívalo antes de registrarle una orden',
        ),
      );
      expect(prisma.workOrder.create).not.toHaveBeenCalled();
    });

    it('400 si el mecánico está inactivo', async () => {
      users.findOne.mockResolvedValue({ isActive: false });
      await expect(
        service.create({ ...validCreate, mechanicId: 'mech-1' }, ADMIN),
      ).rejects.toThrow(
        new BadRequestException(
          'El usuario está inactivo: no se le pueden asignar órdenes',
        ),
      );
    });

    it('400 si la fecha prometida es anterior a hoy en Lima', async () => {
      await expect(
        service.create({ ...validCreate, promisedDate: '2026-10-03' }, ADMIN),
      ).rejects.toThrow(
        new BadRequestException(
          'La fecha prometida no puede ser anterior a hoy',
        ),
      );
    });

    it('409 con el número de la orden si el vehículo ya tiene una abierta', async () => {
      prisma.workOrder.findFirst.mockResolvedValue({ number: 42 });
      await expect(service.create(validCreate, ADMIN)).rejects.toThrow(
        new ConflictException(
          'El vehículo ya tiene abierta la orden OT-000042: ciérrala o cancélala antes de registrar otra',
        ),
      );
      expect(prisma.workOrder.findFirst).toHaveBeenCalledWith({
        where: {
          vehicleId: 'veh-1',
          status: { notIn: ['DELIVERED', 'CANCELLED'] },
        },
        select: { number: true },
      });
    });

    it('si el código de seguimiento ya existe, sortea otro', async () => {
      prisma.workOrder.create
        .mockRejectedValueOnce(knownError('P2002'))
        .mockRejectedValueOnce(knownError('P2002'));
      await service.create(validCreate, ADMIN);
      expect(prisma.workOrder.create).toHaveBeenCalledTimes(3);
    });

    it('se rinde después de cinco choques, y no reintenta otros errores', async () => {
      prisma.workOrder.create.mockRejectedValue(knownError('P2002'));
      await expect(service.create(validCreate, ADMIN)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
      expect(prisma.workOrder.create).toHaveBeenCalledTimes(5);

      prisma.workOrder.create.mockReset();
      prisma.workOrder.create.mockRejectedValue(knownError('P2003'));
      await expect(service.create(validCreate, ADMIN)).rejects.toThrow();
      expect(prisma.workOrder.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('409 si la orden ya se entregó o se canceló', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(
        order({ status: 'DELIVERED' }),
      );
      await expect(
        service.update('wo-1', { reason: 'x' }, ADMIN),
      ).rejects.toThrow(
        new ConflictException('La orden ya se entregó: no se puede editar'),
      );
      prisma.workOrder.findUnique.mockResolvedValue(
        order({ status: 'CANCELLED' }),
      );
      await expect(
        service.update('wo-1', { reason: 'x' }, ADMIN),
      ).rejects.toThrow('La orden está cancelada: no se puede editar');
    });

    it('cambiar el mecánico deja un evento interno con su nombre', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(
        order({ mechanicId: null }),
      );
      await service.update('wo-1', { mechanicId: 'mech-1' }, ADMIN);
      expect(prisma.workOrder.update.mock.calls[0][0].data).toMatchObject({
        mechanicId: 'mech-1',
        events: {
          create: {
            note: 'Asignada a Carlos Huamán Quispe',
            isPublic: false,
            createdById: 'admin-1',
          },
        },
      });
    });

    it('desasignar deja «Sin mecánico asignado»', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await service.update('wo-1', { mechanicId: null }, ADMIN);
      const { data } = prisma.workOrder.update.mock.calls[0][0];
      expect(data.mechanicId).toBeNull();
      expect(data.events.create.note).toBe('Sin mecánico asignado');
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('sin cambio de mecánico no hay evento ni se vuelve a verificar', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await service.update(
        'wo-1',
        { mechanicId: 'mech-1', mileageIn: 90000 },
        ADMIN,
      );
      const { data } = prisma.workOrder.update.mock.calls[0][0];
      expect(data.events).toBeUndefined();
      expect(data.mileageIn).toBe(90000);
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('una orden vencida se edita sin moverle la fecha', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(
        order({ promisedDate: new Date('2026-10-01T00:00:00.000Z') }),
      );
      await service.update(
        'wo-1',
        { promisedDate: '2026-10-01', reason: 'Otro motivo' },
        ADMIN,
      );
      expect(prisma.workOrder.update).toHaveBeenCalled();

      await expect(
        service.update('wo-1', { promisedDate: '2026-10-02' }, ADMIN),
      ).rejects.toThrow('La fecha prometida no puede ser anterior a hoy');
    });

    it('null quita la fecha prometida; sin la clave no se toca', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await service.update('wo-1', { promisedDate: null }, ADMIN);
      await service.update('wo-1', { promisedDate: '2026-10-10' }, ADMIN);
      await service.update('wo-1', { reason: 'x' }, ADMIN);
      const dates = prisma.workOrder.update.mock.calls.map(
        ([args]) => args.data.promisedDate,
      );
      expect(dates).toEqual([
        null,
        new Date('2026-10-10T00:00:00.000Z'),
        undefined,
      ]);
    });
  });

  describe('updateDiagnosis', () => {
    it('se escribe mientras la orden se trabaja', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(
        order({ status: 'WAITING_PARTS' }),
      );
      await service.updateDiagnosis('wo-1', { diagnosis: 'Frenos' }, MECHANIC);
      expect(prisma.workOrder.update.mock.calls[0][0].data).toEqual({
        diagnosis: 'Frenos',
      });
    });

    it('409 esperando aprobación, lista o cerrada', async () => {
      for (const status of [
        'WAITING_APPROVAL',
        'READY',
        'DELIVERED',
        'CANCELLED',
      ]) {
        prisma.workOrder.findUnique.mockResolvedValue(order({ status }));
        await expect(
          service.updateDiagnosis('wo-1', { diagnosis: 'x' }, ADMIN),
        ).rejects.toThrow(ConflictException);
      }
    });

    it('otro mecánico: 404', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await expect(
        service.updateDiagnosis('wo-1', { diagnosis: 'x' }, OTHER_MECHANIC),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('changeStatus', () => {
    it('cambia el estado y lo deja en la línea de tiempo, público por defecto', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await service.changeStatus('wo-1', { status: 'DIAGNOSIS' }, MECHANIC);
      const [args] = prisma.workOrder.update.mock.calls[0];
      // Con el estado leído en el where: no pisa un cambio simultáneo.
      expect(args.where).toEqual({ workOrderId: 'wo-1', status: 'RECEIVED' });
      expect(args.data).toEqual({
        status: 'DIAGNOSIS',
        events: {
          create: {
            status: 'DIAGNOSIS',
            note: null,
            isPublic: true,
            createdById: 'mech-1',
            createdAt: NOW,
          },
        },
      });
    });

    it('la nota puede ser interna', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(
        order({ status: 'IN_PROGRESS' }),
      );
      await service.changeStatus(
        'wo-1',
        { status: 'WAITING_PARTS', note: 'Falta la bomba', isPublic: false },
        ADMIN,
      );
      expect(
        prisma.workOrder.update.mock.calls[0][0].data.events.create,
      ).toMatchObject({ note: 'Falta la bomba', isPublic: false });
    });

    it('409 si la tabla no lo permite desde el estado actual', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(
        order({ status: 'WAITING_PARTS' }),
      );
      await expect(
        service.changeStatus('wo-1', { status: 'READY' }, ADMIN),
      ).rejects.toThrow(
        new ConflictException(
          'Una orden en «Esperando repuestos» no puede pasar a «Listo para recoger»',
        ),
      );
      prisma.workOrder.findUnique.mockResolvedValue(
        order({ status: 'DIAGNOSIS' }),
      );
      await expect(
        service.changeStatus('wo-1', { status: 'WAITING_APPROVAL' }, ADMIN),
      ).rejects.toThrow(ConflictException);
    });

    it('403 si el mecánico intenta entregar o cancelar', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order({ status: 'READY' }));
      await expect(
        service.changeStatus('wo-1', { status: 'DELIVERED' }, MECHANIC),
      ).rejects.toThrow(
        new ForbiddenException(
          'Solo el administrador entrega o cancela una orden',
        ),
      );
    });

    it('404 si otro mecánico intenta moverla', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await expect(
        service.changeStatus('wo-1', { status: 'DIAGNOSIS' }, OTHER_MECHANIC),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.workOrder.update).not.toHaveBeenCalled();
    });

    it('una orden lista para recoger todavía se puede cancelar', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order({ status: 'READY' }));
      await service.changeStatus(
        'wo-1',
        { status: 'CANCELLED', note: 'El cliente no recogerá el vehículo' },
        ADMIN,
      );
      expect(prisma.workOrder.update.mock.calls[0][0]).toMatchObject({
        where: { workOrderId: 'wo-1', status: 'READY' },
        data: { status: 'CANCELLED', cancelledAt: NOW },
      });
    });

    it('cancelar exige el motivo y lo guarda con la fecha', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await expect(
        service.changeStatus('wo-1', { status: 'CANCELLED' }, ADMIN),
      ).rejects.toThrow(
        new BadRequestException(
          'Indica el motivo de la cancelación en la nota',
        ),
      );
      await service.changeStatus(
        'wo-1',
        { status: 'CANCELLED', note: 'El cliente retiró el vehículo' },
        ADMIN,
      );
      expect(prisma.workOrder.update.mock.calls[0][0].data).toMatchObject({
        status: 'CANCELLED',
        cancelledAt: NOW,
        cancelReason: 'El cliente retiró el vehículo',
        events: { create: { note: 'El cliente retiró el vehículo' } },
      });
    });

    it('entregar llena deliveredAt', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order({ status: 'READY' }));
      await service.changeStatus('wo-1', { status: 'DELIVERED' }, ADMIN);
      const { data } = prisma.workOrder.update.mock.calls[0][0];
      expect(data.deliveredAt).toEqual(NOW);
      expect(data.cancelledAt).toBeUndefined();
    });

    it('409 si otro la cambió entre la lectura y la escritura', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      prisma.workOrder.update.mockRejectedValue(knownError('P2025'));
      await expect(
        service.changeStatus('wo-1', { status: 'DIAGNOSIS' }, ADMIN),
      ).rejects.toThrow(
        new ConflictException(
          'La orden cambió de estado mientras tanto: vuelve a cargarla',
        ),
      );
    });
  });

  describe('addNote', () => {
    it('agrega un evento sin estado, con la visibilidad elegida', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await service.addNote(
        'wo-1',
        { note: 'El cliente pidió presupuesto por WhatsApp', isPublic: false },
        MECHANIC,
      );
      expect(prisma.workOrder.update.mock.calls[0][0].data).toEqual({
        events: {
          create: {
            note: 'El cliente pidió presupuesto por WhatsApp',
            isPublic: false,
            createdById: 'mech-1',
          },
        },
      });
    });

    it('otro mecánico: 404', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(order());
      await expect(
        service.addNote('wo-1', { note: 'x', isPublic: true }, OTHER_MECHANIC),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    const counts = (items: number, quotes: number, payments: number) => ({
      _count: { items, quotes, payments },
    });

    it('borra la orden registrada por error', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(counts(0, 0, 0));
      await service.remove('wo-1');
      expect(prisma.workOrder.delete).toHaveBeenCalledWith({
        where: { workOrderId: 'wo-1' },
      });
    });

    it('409 que dice qué tiene y sugiere cancelarla', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(counts(2, 1, 1));
      await expect(service.remove('wo-1')).rejects.toThrow(
        new ConflictException(
          'No se puede eliminar: la orden tiene 2 ítems, 1 presupuesto y 1 pago. Puedes cancelarla',
        ),
      );
      prisma.workOrder.findUnique.mockResolvedValue(counts(0, 0, 3));
      await expect(service.remove('wo-1')).rejects.toThrow(
        'No se puede eliminar: la orden tiene 3 pagos. Puedes cancelarla',
      );
      expect(prisma.workOrder.delete).not.toHaveBeenCalled();
    });

    it('404 si no existe', async () => {
      prisma.workOrder.findUnique.mockResolvedValue(null);
      await expect(service.remove('wo-1')).rejects.toThrow(NotFoundException);
    });
  });
});
