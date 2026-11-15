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

const ADMINISTRADOR: SessionUser = {
  usuarioId: 'admin-1',
  rol: 'ADMINISTRADOR',
};
const MECANICO: SessionUser = { usuarioId: 'mech-1', rol: 'MECANICO' };
const OTHER_MECHANIC: SessionUser = { usuarioId: 'mech-2', rol: 'MECANICO' };

// Hoy en Lima: 4 de octubre (las 10:00 de Lima son las 15:00 UTC).
const NOW = new Date('2026-10-04T15:00:00.000Z');
const TODAY_COLUMN = new Date('2026-10-04T00:00:00.000Z');

describe('workOrdersWhere', () => {
  const today = '2026-10-04';

  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(workOrdersWhere({}, today)).toEqual({
      estado: undefined,
      mecanicoId: undefined,
      vehiculoId: undefined,
      clienteId: undefined,
      recibidaEn: undefined,
    });
  });

  it('un texto numérico busca también por número de orden', () => {
    const text = { contains: 'OT-000123', mode: 'insensitive' };
    expect(workOrdersWhere({ search: 'OT-000123' }, today).OR).toEqual([
      { numero: 123 },
      { vehiculo: { placa: { contains: 'OT000123' } } },
      { cliente: { nombre: text } },
      { codigoSeguimiento: text },
    ]);
  });

  it('un texto que no es número busca placa, cliente y código', () => {
    const text = { contains: 'abk-5', mode: 'insensitive' };
    // La placa se busca normalizada, como se guarda.
    expect(workOrdersWhere({ search: 'abk-5' }, today).OR).toEqual([
      { vehiculo: { placa: { contains: 'ABK5' } } },
      { cliente: { nombre: text } },
      { codigoSeguimiento: text },
    ]);
  });

  it('una búsqueda de solo guiones no busca placas', () => {
    expect(workOrdersWhere({ search: '--' }, today).OR).toHaveLength(2);
  });

  it('filtra por uno o varios estados, mecánico, vehículo y cliente', () => {
    expect(
      workOrdersWhere(
        {
          estado: ['RECIBIDO', 'EN_DIAGNOSTICO'],
          mecanicoId: 'm1',
          vehiculoId: 'v1',
          clienteId: 'c1',
        },
        today,
      ),
    ).toMatchObject({
      estado: { in: ['RECIBIDO', 'EN_DIAGNOSTICO'] },
      mecanicoId: 'm1',
      vehiculoId: 'v1',
      clienteId: 'c1',
    });
  });

  it('vencidas: prometidas antes de hoy en Lima y todavía en el taller', () => {
    const vencidas = {
      fechaPrometida: { lt: TODAY_COLUMN },
      estado: { notIn: ['ENTREGADO', 'CANCELADO'] },
    };
    expect(workOrdersWhere({ vencidas: true }, today).AND).toEqual([vencidas]);
    expect(workOrdersWhere({ vencidas: false }, today).AND).toEqual([
      { NOT: vencidas },
    ]);
  });

  it('el filtro de vencidas no pisa el de estado: se combinan', () => {
    const where = workOrdersWhere(
      { estado: ['EN_REPARACION'], vencidas: true },
      today,
    );
    expect(where.estado).toEqual({ in: ['EN_REPARACION'] });
    expect(where.AND).toHaveLength(1);
  });

  it('el rango de ingreso son días de Lima, con el «hasta» inclusivo', () => {
    expect(
      workOrdersWhere({ desde: '2026-10-01', hasta: '2026-10-04' }, today)
        .recibidaEn,
    ).toEqual({
      gte: new Date('2026-10-01T05:00:00.000Z'),
      lt: new Date('2026-10-05T05:00:00.000Z'),
    });
  });
});

describe('workOrdersOrderBy', () => {
  it('sin fecha prometida va al final en los dos sentidos', () => {
    expect(
      workOrdersOrderBy({ ordenarPor: 'fechaPrometida', sentido: 'desc' }),
    ).toEqual({ fechaPrometida: { sort: 'desc', nulls: 'last' } });
  });

  it('los demás campos, tal cual', () => {
    expect(workOrdersOrderBy({ ordenarPor: 'numero', sentido: 'asc' })).toEqual(
      {
        numero: 'asc',
      },
    );
  });
});

describe('WorkOrdersService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    ordenTrabajo: {
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
    ordenTrabajoId: 'wo-1',
    numero: 123,
    estado: 'RECIBIDO',
    mecanicoId: 'mech-1',
    fechaPrometida: null,
    ...overrides,
  });
  const knownError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError(code, {
      code,
      clientVersion: 'test',
    });
  const validCreate = {
    vehiculoId: 'veh-1',
    kilometrajeIngreso: 84500,
    motivo: 'Ruido al frenar',
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vehicles.findOne.mockResolvedValue({
      vehiculoId: 'veh-1',
      clienteId: 'owner-1',
    });
    customers.findOne.mockResolvedValue({
      clienteId: 'owner-1',
      activo: true,
    });
    users.findOne.mockResolvedValue({
      usuarioId: 'mech-1',
      nombre: 'Carlos Huamán Quispe',
      activo: true,
    });
    prisma.ordenTrabajo.findFirst.mockResolvedValue(null);
    prisma.ordenTrabajo.create.mockImplementation(
      ({ data }: { data: object }) => ({ ...data }),
    );
    prisma.ordenTrabajo.update.mockImplementation(
      ({ data }: { data: object }) => ({ ...order(), ...data }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.ordenTrabajo.findMany.mockResolvedValue([]);
      prisma.ordenTrabajo.count.mockResolvedValue(15);
    });

    const query = {
      page: 2,
      pageSize: 10,
      ordenarPor: 'recibidaEn' as const,
      sentido: 'desc' as const,
    };

    it('pagina y desempata el orden por el id', async () => {
      const page = await service.findAll(
        { ...query, mecanicoId: 'mech-9' },
        ADMINISTRADOR,
      );
      expect(prisma.ordenTrabajo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ mecanicoId: 'mech-9' }),
          orderBy: [{ recibidaEn: 'desc' }, { ordenTrabajoId: 'asc' }],
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

    it('de los detalles trae solo lo que suma el total, en la misma consulta', async () => {
      await service.findAll(query, ADMINISTRADOR);
      expect(
        prisma.ordenTrabajo.findMany.mock.calls[0][0].include.detalles,
      ).toEqual({
        select: { tipo: true, cantidad: true, precioUnitario: true },
      });
    });

    it('el mecánico solo ve las suyas, pida lo que pida', async () => {
      await service.findAll({ ...query, mecanicoId: 'mech-9' }, MECANICO);
      await service.findAll(query, MECANICO);
      for (const [args] of prisma.ordenTrabajo.findMany.mock.calls) {
        expect(args.where.mecanicoId).toBe('mech-1');
      }
      expect(prisma.ordenTrabajo.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ mecanicoId: 'mech-1' }),
      });
    });

    it('las vencidas se cuentan desde el día de Lima', async () => {
      // Las 23:30 del 4 en Lima ya son el 5 en UTC.
      vi.setSystemTime(new Date('2026-10-05T04:30:00.000Z'));
      await service.findAll({ ...query, vencidas: true }, ADMINISTRADOR);
      const [args] = prisma.ordenTrabajo.findMany.mock.calls[0];
      expect(args.where.AND[0].fechaPrometida).toEqual({ lt: TODAY_COLUMN });
    });
  });

  describe('findOne', () => {
    it('el administrador y el mecánico asignado la ven', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await expect(
        service.findOne('wo-1', ADMINISTRADOR),
      ).resolves.toBeTruthy();
      await expect(service.findOne('wo-1', MECANICO)).resolves.toBeTruthy();
    });

    it('para otro mecánico no existe (404, no 403)', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await expect(service.findOne('wo-1', OTHER_MECHANIC)).rejects.toThrow(
        new NotFoundException('No se encontró la orden de trabajo'),
      );
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ mecanicoId: null }),
      );
      await expect(service.findOne('wo-1', MECANICO)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404 si no existe', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(null);
      await expect(service.findOne('wo-1', ADMINISTRADOR)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('congela al dueño actual del vehículo y nace con su evento RECIBIDO', async () => {
      await service.create(
        { ...validCreate, fechaPrometida: '2026-10-04', mecanicoId: 'mech-1' },
        ADMINISTRADOR,
      );
      const { data } = prisma.ordenTrabajo.create.mock.calls[0][0];
      expect(data).toMatchObject({
        vehiculoId: 'veh-1',
        clienteId: 'owner-1',
        mecanicoId: 'mech-1',
        creadoPorId: 'admin-1',
        kilometrajeIngreso: 84500,
        motivo: 'Ruido al frenar',
        fechaPrometida: TODAY_COLUMN,
        eventos: {
          create: {
            estado: 'RECIBIDO',
            nota: 'Vehículo recibido en el taller',
            esPublico: true,
            creadoPorId: 'admin-1',
          },
        },
      });
      expect(data.codigoSeguimiento).toMatch(/^AFM-[2-9A-HJKMNP-Z]{6}$/);
      expect(customers.findOne).toHaveBeenCalledWith('owner-1');
    });

    it('sin mecánico ni fecha prometida quedan vacíos', async () => {
      await service.create(validCreate, ADMINISTRADOR);
      const { data } = prisma.ordenTrabajo.create.mock.calls[0][0];
      expect(data).toMatchObject({ mecanicoId: null, fechaPrometida: null });
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('400 si el dueño del vehículo está inactivo', async () => {
      customers.findOne.mockResolvedValue({ activo: false });
      await expect(service.create(validCreate, ADMINISTRADOR)).rejects.toThrow(
        new BadRequestException(
          'El dueño del vehículo está inactivo: actívalo antes de registrarle una orden',
        ),
      );
      expect(prisma.ordenTrabajo.create).not.toHaveBeenCalled();
    });

    it('400 si el mecánico está inactivo', async () => {
      users.findOne.mockResolvedValue({ activo: false });
      await expect(
        service.create({ ...validCreate, mecanicoId: 'mech-1' }, ADMINISTRADOR),
      ).rejects.toThrow(
        new BadRequestException(
          'El usuario está inactivo: no se le pueden asignar órdenes',
        ),
      );
    });

    it('400 si la fecha prometida es anterior a hoy en Lima', async () => {
      await expect(
        service.create(
          { ...validCreate, fechaPrometida: '2026-10-03' },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'La fecha prometida no puede ser anterior a hoy',
        ),
      );
    });

    it('409 con el número de la orden si el vehículo ya tiene una abierta', async () => {
      prisma.ordenTrabajo.findFirst.mockResolvedValue({ numero: 42 });
      await expect(service.create(validCreate, ADMINISTRADOR)).rejects.toThrow(
        new ConflictException(
          'El vehículo ya tiene abierta la orden OT-000042: ciérrala o cancélala antes de registrar otra',
        ),
      );
      expect(prisma.ordenTrabajo.findFirst).toHaveBeenCalledWith({
        where: {
          vehiculoId: 'veh-1',
          estado: { notIn: ['ENTREGADO', 'CANCELADO'] },
        },
        select: { numero: true },
      });
    });

    it('si el código de seguimiento ya existe, sortea otro', async () => {
      prisma.ordenTrabajo.create
        .mockRejectedValueOnce(knownError('P2002'))
        .mockRejectedValueOnce(knownError('P2002'));
      await service.create(validCreate, ADMINISTRADOR);
      expect(prisma.ordenTrabajo.create).toHaveBeenCalledTimes(3);
    });

    it('se rinde después de cinco choques, y no reintenta otros errores', async () => {
      prisma.ordenTrabajo.create.mockRejectedValue(knownError('P2002'));
      await expect(service.create(validCreate, ADMINISTRADOR)).rejects.toThrow(
        Prisma.PrismaClientKnownRequestError,
      );
      expect(prisma.ordenTrabajo.create).toHaveBeenCalledTimes(5);

      prisma.ordenTrabajo.create.mockReset();
      prisma.ordenTrabajo.create.mockRejectedValue(knownError('P2003'));
      await expect(
        service.create(validCreate, ADMINISTRADOR),
      ).rejects.toThrow();
      expect(prisma.ordenTrabajo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('update', () => {
    it('409 si la orden ya se entregó o se canceló', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ estado: 'ENTREGADO' }),
      );
      await expect(
        service.update('wo-1', { motivo: 'x' }, ADMINISTRADOR),
      ).rejects.toThrow(
        new ConflictException('La orden ya se entregó: no se puede editar'),
      );
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ estado: 'CANCELADO' }),
      );
      await expect(
        service.update('wo-1', { motivo: 'x' }, ADMINISTRADOR),
      ).rejects.toThrow('La orden está cancelada: no se puede editar');
    });

    it('cambiar el mecánico deja un evento interno con su nombre', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ mecanicoId: null }),
      );
      await service.update('wo-1', { mecanicoId: 'mech-1' }, ADMINISTRADOR);
      expect(prisma.ordenTrabajo.update.mock.calls[0][0].data).toMatchObject({
        mecanicoId: 'mech-1',
        eventos: {
          create: {
            nota: 'Asignada a Carlos Huamán Quispe',
            esPublico: false,
            creadoPorId: 'admin-1',
          },
        },
      });
    });

    it('desasignar deja «Sin mecánico asignado»', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await service.update('wo-1', { mecanicoId: null }, ADMINISTRADOR);
      const { data } = prisma.ordenTrabajo.update.mock.calls[0][0];
      expect(data.mecanicoId).toBeNull();
      expect(data.eventos.create.nota).toBe('Sin mecánico asignado');
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('sin cambio de mecánico no hay evento ni se vuelve a verificar', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await service.update(
        'wo-1',
        { mecanicoId: 'mech-1', kilometrajeIngreso: 90000 },
        ADMINISTRADOR,
      );
      const { data } = prisma.ordenTrabajo.update.mock.calls[0][0];
      expect(data.eventos).toBeUndefined();
      expect(data.kilometrajeIngreso).toBe(90000);
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('una orden vencida se edita sin moverle la fecha', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ fechaPrometida: new Date('2026-10-01T00:00:00.000Z') }),
      );
      await service.update(
        'wo-1',
        { fechaPrometida: '2026-10-01', motivo: 'Otro motivo' },
        ADMINISTRADOR,
      );
      expect(prisma.ordenTrabajo.update).toHaveBeenCalled();

      await expect(
        service.update('wo-1', { fechaPrometida: '2026-10-02' }, ADMINISTRADOR),
      ).rejects.toThrow('La fecha prometida no puede ser anterior a hoy');
    });

    it('null quita la fecha prometida; sin la clave no se toca', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await service.update('wo-1', { fechaPrometida: null }, ADMINISTRADOR);
      await service.update(
        'wo-1',
        { fechaPrometida: '2026-10-10' },
        ADMINISTRADOR,
      );
      await service.update('wo-1', { motivo: 'x' }, ADMINISTRADOR);
      const dates = prisma.ordenTrabajo.update.mock.calls.map(
        ([args]) => args.data.fechaPrometida,
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
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ estado: 'ESPERANDO_REPUESTOS' }),
      );
      await service.updateDiagnosis(
        'wo-1',
        { diagnostico: 'Frenos' },
        MECANICO,
      );
      expect(prisma.ordenTrabajo.update.mock.calls[0][0].data).toEqual({
        diagnostico: 'Frenos',
      });
    });

    it('409 esperando aprobación, lista o cerrada', async () => {
      for (const estado of [
        'ESPERANDO_APROBACION',
        'LISTO',
        'ENTREGADO',
        'CANCELADO',
      ]) {
        prisma.ordenTrabajo.findUnique.mockResolvedValue(order({ estado }));
        await expect(
          service.updateDiagnosis('wo-1', { diagnostico: 'x' }, ADMINISTRADOR),
        ).rejects.toThrow(ConflictException);
      }
    });

    it('otro mecánico: 404', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await expect(
        service.updateDiagnosis('wo-1', { diagnostico: 'x' }, OTHER_MECHANIC),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('changeStatus', () => {
    it('cambia el estado y lo deja en la línea de tiempo, público por defecto', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await service.changeStatus(
        'wo-1',
        { estado: 'EN_DIAGNOSTICO' },
        MECANICO,
      );
      const [args] = prisma.ordenTrabajo.update.mock.calls[0];
      // Con el estado leído en el where: no pisa un cambio simultáneo.
      expect(args.where).toEqual({
        ordenTrabajoId: 'wo-1',
        estado: 'RECIBIDO',
      });
      expect(args.data).toEqual({
        estado: 'EN_DIAGNOSTICO',
        eventos: {
          create: {
            estado: 'EN_DIAGNOSTICO',
            nota: null,
            esPublico: true,
            creadoPorId: 'mech-1',
            creadoEn: NOW,
          },
        },
      });
    });

    it('la nota puede ser interna', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ estado: 'EN_REPARACION' }),
      );
      await service.changeStatus(
        'wo-1',
        {
          estado: 'ESPERANDO_REPUESTOS',
          nota: 'Falta la bomba',
          esPublico: false,
        },
        ADMINISTRADOR,
      );
      expect(
        prisma.ordenTrabajo.update.mock.calls[0][0].data.eventos.create,
      ).toMatchObject({ nota: 'Falta la bomba', esPublico: false });
    });

    it('409 si la tabla no lo permite desde el estado actual', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ estado: 'ESPERANDO_REPUESTOS' }),
      );
      await expect(
        service.changeStatus('wo-1', { estado: 'LISTO' }, ADMINISTRADOR),
      ).rejects.toThrow(
        new ConflictException(
          'Una orden en «Esperando repuestos» no puede pasar a «Listo para recoger»',
        ),
      );
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ estado: 'EN_DIAGNOSTICO' }),
      );
      await expect(
        service.changeStatus(
          'wo-1',
          { estado: 'ESPERANDO_APROBACION' },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('403 si el mecánico intenta entregar o cancelar', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ estado: 'LISTO' }),
      );
      await expect(
        service.changeStatus('wo-1', { estado: 'ENTREGADO' }, MECANICO),
      ).rejects.toThrow(
        new ForbiddenException(
          'Solo el administrador entrega o cancela una orden',
        ),
      );
    });

    it('404 si otro mecánico intenta moverla', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await expect(
        service.changeStatus(
          'wo-1',
          { estado: 'EN_DIAGNOSTICO' },
          OTHER_MECHANIC,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.ordenTrabajo.update).not.toHaveBeenCalled();
    });

    it('una orden lista para recoger todavía se puede cancelar', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ estado: 'LISTO' }),
      );
      await service.changeStatus(
        'wo-1',
        { estado: 'CANCELADO', nota: 'El cliente no recogerá el vehículo' },
        ADMINISTRADOR,
      );
      expect(prisma.ordenTrabajo.update.mock.calls[0][0]).toMatchObject({
        where: { ordenTrabajoId: 'wo-1', estado: 'LISTO' },
        data: { estado: 'CANCELADO', canceladaEn: NOW },
      });
    });

    it('cancelar exige el motivo y lo guarda con la fecha', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await expect(
        service.changeStatus('wo-1', { estado: 'CANCELADO' }, ADMINISTRADOR),
      ).rejects.toThrow(
        new BadRequestException(
          'Indica el motivo de la cancelación en la nota',
        ),
      );
      await service.changeStatus(
        'wo-1',
        { estado: 'CANCELADO', nota: 'El cliente retiró el vehículo' },
        ADMINISTRADOR,
      );
      expect(prisma.ordenTrabajo.update.mock.calls[0][0].data).toMatchObject({
        estado: 'CANCELADO',
        canceladaEn: NOW,
        motivoCancelacion: 'El cliente retiró el vehículo',
        eventos: { create: { nota: 'El cliente retiró el vehículo' } },
      });
    });

    it('entregar llena entregadaEn', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(
        order({ estado: 'LISTO' }),
      );
      await service.changeStatus(
        'wo-1',
        { estado: 'ENTREGADO' },
        ADMINISTRADOR,
      );
      const { data } = prisma.ordenTrabajo.update.mock.calls[0][0];
      expect(data.entregadaEn).toEqual(NOW);
      expect(data.canceladaEn).toBeUndefined();
    });

    it('409 si otro la cambió entre la lectura y la escritura', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      prisma.ordenTrabajo.update.mockRejectedValue(knownError('P2025'));
      await expect(
        service.changeStatus(
          'wo-1',
          { estado: 'EN_DIAGNOSTICO' },
          ADMINISTRADOR,
        ),
      ).rejects.toThrow(
        new ConflictException(
          'La orden cambió de estado mientras tanto: vuelve a cargarla',
        ),
      );
    });
  });

  describe('addNote', () => {
    it('agrega un evento sin estado, con la visibilidad elegida', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await service.addNote(
        'wo-1',
        { nota: 'El cliente pidió presupuesto por WhatsApp', esPublico: false },
        MECANICO,
      );
      expect(prisma.ordenTrabajo.update.mock.calls[0][0].data).toEqual({
        eventos: {
          create: {
            nota: 'El cliente pidió presupuesto por WhatsApp',
            esPublico: false,
            creadoPorId: 'mech-1',
          },
        },
      });
    });

    it('otro mecánico: 404', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(order());
      await expect(
        service.addNote('wo-1', { nota: 'x', esPublico: true }, OTHER_MECHANIC),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    const counts = (detalles: number, presupuestos: number) => ({
      _count: { detalles, presupuestos },
    });

    it('borra la orden registrada por error', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(counts(0, 0));
      await service.remove('wo-1');
      expect(prisma.ordenTrabajo.delete).toHaveBeenCalledWith({
        where: { ordenTrabajoId: 'wo-1' },
      });
    });

    it('409 que dice qué tiene y sugiere cancelarla', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(counts(2, 1));
      await expect(service.remove('wo-1')).rejects.toThrow(
        new ConflictException(
          'No se puede eliminar: la orden tiene 2 detalles y 1 presupuesto. Puedes cancelarla',
        ),
      );
      prisma.ordenTrabajo.findUnique.mockResolvedValue(counts(0, 3));
      await expect(service.remove('wo-1')).rejects.toThrow(
        'No se puede eliminar: la orden tiene 3 presupuestos. Puedes cancelarla',
      );
      expect(prisma.ordenTrabajo.delete).not.toHaveBeenCalled();
    });

    it('404 si no existe', async () => {
      prisma.ordenTrabajo.findUnique.mockResolvedValue(null);
      await expect(service.remove('wo-1')).rejects.toThrow(NotFoundException);
    });
  });
  describe('portal del cliente', () => {
    it('lista solo las órdenes del cliente: en curso o anteriores, las más nuevas primero', async () => {
      prisma.ordenTrabajo.findMany.mockResolvedValue([]);
      prisma.ordenTrabajo.count.mockResolvedValue(0);

      await service.findAllForCustomer('cust-1', {
        enCurso: true,
        vehiculoId: 'veh-1',
        page: 1,
        pageSize: 10,
      });
      const open = prisma.ordenTrabajo.findMany.mock.calls[0][0] as {
        where: Record<string, unknown>;
        orderBy: unknown;
      };
      expect(open.where).toEqual({
        clienteId: 'cust-1',
        vehiculoId: 'veh-1',
        estado: { notIn: ['ENTREGADO', 'CANCELADO'] },
      });
      expect(open.orderBy).toEqual([
        { recibidaEn: 'desc' },
        { ordenTrabajoId: 'asc' },
      ]);

      await service.findAllForCustomer('cust-1', {
        enCurso: false,
        page: 1,
        pageSize: 10,
      });
      const closed = prisma.ordenTrabajo.findMany.mock.calls[1][0] as {
        where: Record<string, unknown>;
      };
      expect(closed.where).toMatchObject({
        clienteId: 'cust-1',
        estado: { in: ['ENTREGADO', 'CANCELADO'] },
      });
    });

    it('el detalle busca la orden con el cliente: una ajena es 404', async () => {
      prisma.ordenTrabajo.findFirst.mockResolvedValue(null);
      await expect(
        service.findOneForCustomer('wo-1', 'cust-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.ordenTrabajo.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ordenTrabajoId: 'wo-1', clienteId: 'cust-1' },
        }),
      );
    });
  });
});

describe('WorkOrdersService.dashboardStats', () => {
  const prisma = {
    ordenTrabajo: { findMany: vi.fn() },
    detalleOrden: { findMany: vi.fn() },
  };
  const service = new WorkOrdersService(
    prisma as unknown as PrismaService,
    {} as VehiclesService,
    {} as CustomersService,
    {} as UsersService,
  );
  // 15 de noviembre a las 10:00 de Lima.
  const now = new Date('2026-11-15T15:00:00.000Z');
  const NOVEMBER = {
    gte: new Date('2026-11-01T05:00:00.000Z'),
    lt: new Date('2026-12-01T05:00:00.000Z'),
  };
  // La tendencia arranca en junio: seis meses contando noviembre.
  const TREND_START = new Date('2026-06-01T05:00:00.000Z');
  const decimal = (value: string) => new Prisma.Decimal(value);

  beforeEach(() => {
    // Las tres lecturas de órdenes, en el orden en que se piden: las abiertas,
    // las recibidas y las entregadas de la tendencia.
    prisma.ordenTrabajo.findMany
      .mockResolvedValueOnce([
        {
          ordenTrabajoId: 'ot-1',
          numero: 1,
          estado: 'LISTO',
          fechaPrometida: new Date('2026-11-10T00:00:00.000Z'),
          vehiculo: { placa: 'ABC123' },
          mecanico: { usuarioId: 'mech-1', nombre: 'Luis' },
        },
      ])
      .mockResolvedValueOnce([
        { recibidaEn: new Date('2026-11-02T15:00:00.000Z') },
        { recibidaEn: new Date('2026-10-02T15:00:00.000Z') },
      ])
      .mockResolvedValueOnce([
        // 1 de noviembre a las 00:30 de Lima: es de noviembre.
        { entregadaEn: new Date('2026-11-01T05:30:00.000Z') },
        { entregadaEn: new Date('2026-11-12T15:00:00.000Z') },
      ]);
  });

  afterEach(() => vi.resetAllMocks());

  it('para el mecánico filtra todo por él y no calcula lo del administrador', async () => {
    const stats = await service.dashboardStats(
      { mecanicoId: 'mech-1', incluirAdministracion: false },
      now,
    );

    const [open, received, delivered] = prisma.ordenTrabajo.findMany.mock.calls;
    expect(open[0].where).toEqual({
      mecanicoId: 'mech-1',
      estado: { notIn: ['ENTREGADO', 'CANCELADO'] },
    });
    expect(received[0].where).toEqual({
      mecanicoId: 'mech-1',
      recibidaEn: { gte: TREND_START },
    });
    expect(delivered[0].where).toEqual({
      mecanicoId: 'mech-1',
      estado: 'ENTREGADO',
      entregadaEn: { gte: TREND_START },
    });
    expect(prisma.detalleOrden.findMany).not.toHaveBeenCalled();

    expect(stats.administracion).toBeNull();
    expect(stats.indicadores).toEqual({
      abiertas: 1,
      esperandoAprobacion: 0,
      listas: 1,
      vencidas: 1,
      entregadasMes: 2,
    });
    expect(stats.tendencia.map((t) => t.mes)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(stats.tendencia.slice(-2)).toEqual([
      { mes: '2026-10', recibidas: 1, entregadas: 0 },
      { mes: '2026-11', recibidas: 1, entregadas: 2 },
    ]);
    expect(stats.atencion).toEqual([
      {
        ordenTrabajoId: 'ot-1',
        numero: 1,
        placa: 'ABC123',
        estado: 'LISTO',
        fechaPrometida: '2026-11-10',
        vencida: true,
      },
    ]);
  });

  it('para el administrador suma lo cobrado del mes, la carga y los servicios', async () => {
    prisma.detalleOrden.findMany
      .mockResolvedValueOnce([
        // 1.25 x 38.90 = 48.625, redondeado por línea a 48.63, como el total
        // de la orden.
        {
          tipo: 'PRODUCTO',
          cantidad: decimal('1.25'),
          precioUnitario: decimal('38.90'),
        },
        {
          tipo: 'SERVICIO',
          cantidad: decimal('1'),
          precioUnitario: decimal('120.00'),
        },
      ])
      .mockResolvedValueOnce([
        {
          servicioId: 's-1',
          descripcion: 'Cambio de aceite 5W-30',
          servicio: { nombre: 'Cambio de aceite' },
        },
      ]);

    const stats = await service.dashboardStats(
      { incluirAdministracion: true },
      now,
    );

    // Sin mecánico: el administrador ve todo el taller.
    expect(prisma.ordenTrabajo.findMany.mock.calls[0][0].where).toEqual({
      mecanicoId: undefined,
      estado: { notIn: ['ENTREGADO', 'CANCELADO'] },
    });
    const [deliveredLines, serviceLines] =
      prisma.detalleOrden.findMany.mock.calls;
    expect(deliveredLines[0].where).toEqual({
      ordenTrabajo: {
        mecanicoId: undefined,
        estado: 'ENTREGADO',
        entregadaEn: NOVEMBER,
      },
    });
    expect(serviceLines[0].where).toEqual({
      tipo: 'SERVICIO',
      ordenTrabajo: {
        mecanicoId: undefined,
        recibidaEn: NOVEMBER,
        estado: { not: 'CANCELADO' },
      },
    });

    expect(stats.administracion?.valorEntregadoMes.toFixed(2)).toBe('168.63');
    expect(stats.administracion?.cargaMecanicos).toEqual([
      { usuarioId: 'mech-1', nombre: 'Luis', abiertas: 1 },
    ]);
    expect(stats.administracion?.serviciosTop).toEqual([
      { nombre: 'Cambio de aceite', cantidad: 1 },
    ]);
  });
});
