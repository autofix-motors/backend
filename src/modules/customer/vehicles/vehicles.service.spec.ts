import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { CustomersService } from '../customers/customers.service.js';
import {
  VehiclesService,
  mergeBrands,
  vehiclesWhere,
} from './vehicles.service.js';

// Lo que se prueba es lo que decide: cómo se arman la búsqueda y los filtros,
// qué pasa con una placa o un VIN repetidos, a qué cliente se le puede asignar
// un vehículo y que un vehículo con historial no se borre.

const valid = {
  customerId: 'c1',
  plate: 'ABC123',
  brand: 'Toyota',
  model: 'Yaris',
};

describe('vehiclesWhere', () => {
  it('sin búsqueda ni filtros no restringe nada', () => {
    expect(vehiclesWhere({})).toEqual({
      customerId: undefined,
      brand: undefined,
    });
  });

  it('filtra por cliente y por marca exacta sin distinguir mayúsculas', () => {
    expect(vehiclesWhere({ customerId: 'c1', brand: 'toyota' })).toEqual({
      customerId: 'c1',
      brand: { equals: 'toyota', mode: 'insensitive' },
    });
  });

  it('busca en la placa normalizada, la marca, el modelo y el cliente', () => {
    const text = { contains: 'abc-1', mode: 'insensitive' };
    expect(vehiclesWhere({ search: 'abc-1' }).OR).toEqual([
      { plate: { contains: 'ABC1' } },
      { brand: text },
      { model: text },
      { customer: { name: text } },
    ]);
  });

  it('una búsqueda sin letras ni dígitos no busca en la placa', () => {
    const conditions = vehiclesWhere({ search: '-' }).OR ?? [];
    expect(conditions).toHaveLength(3);
    expect(conditions).not.toContainEqual(
      expect.objectContaining({ plate: expect.anything() }),
    );
  });
});

describe('mergeBrands', () => {
  it('junta la misma marca con distintas mayúsculas y ordena', () => {
    expect(
      mergeBrands([
        { brand: 'TOYOTA', vehiclesCount: 1 },
        { brand: 'Kia', vehiclesCount: 2 },
        { brand: 'Toyota', vehiclesCount: 4 },
      ]),
    ).toEqual([
      { brand: 'Kia', vehiclesCount: 2 },
      { brand: 'Toyota', vehiclesCount: 5 },
    ]);
  });
});

describe('VehiclesService', () => {
  const prisma = {
    $transaction: vi.fn((queries: unknown[]) => Promise.all(queries)),
    vehicle: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  const customers = { findOne: vi.fn() };
  const service = new VehiclesService(
    prisma as unknown as PrismaService,
    customers as unknown as CustomersService,
  );

  beforeEach(() => {
    customers.findOne.mockResolvedValue({ customerId: 'c1', isActive: true });
    prisma.vehicle.findFirst.mockResolvedValue(null);
  });
  afterEach(() => vi.clearAllMocks());

  it('pagina y desempata el orden por el id', async () => {
    prisma.vehicle.findMany.mockResolvedValue([]);
    prisma.vehicle.count.mockResolvedValue(31);

    const page = await service.findAll({
      page: 2,
      pageSize: 10,
      sortBy: 'brand',
      sortOrder: 'desc',
    });

    expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ brand: 'desc' }, { vehicleId: 'asc' }],
        skip: 10,
        take: 10,
      }),
    );
    expect(page.meta.totalPages).toBe(4);
  });

  it('no registra un vehículo a un cliente inactivo', async () => {
    customers.findOne.mockResolvedValue({ customerId: 'c1', isActive: false });
    await expect(service.create(valid)).rejects.toThrow(
      new BadRequestException(
        'El cliente está inactivo: actívalo antes de asignarle un vehículo',
      ),
    );
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
  });

  it('responde 404 si el cliente no existe', async () => {
    customers.findOne.mockRejectedValue(
      new NotFoundException('No se encontró el cliente'),
    );
    await expect(service.create(valid)).rejects.toThrow(NotFoundException);
    expect(prisma.vehicle.create).not.toHaveBeenCalled();
  });

  it('dice si lo repetido es la placa', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ plate: 'ABC123' });
    await expect(
      service.create({ ...valid, vin: 'JTDBT923771234567' }),
    ).rejects.toThrow(
      new ConflictException('Ya existe un vehículo con esa placa'),
    );
  });

  it('dice si lo repetido es el VIN', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ plate: 'XYZ789' });
    await expect(
      service.create({ ...valid, vin: 'JTDBT923771234567' }),
    ).rejects.toThrow(
      new ConflictException('Ya existe un vehículo con ese VIN'),
    );
  });

  it('al editar, la placa propia no cuenta como repetida', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ customerId: 'c1' });
    await service.update('v1', { plate: 'ABC123' });
    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ plate: 'ABC123' }], NOT: { vehicleId: 'v1' } },
      select: { plate: true },
    });
    expect(prisma.vehicle.update).toHaveBeenCalled();
  });

  it('traduce una placa repetida a la vez por otra alta a un 409', async () => {
    prisma.vehicle.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.create(valid)).rejects.toThrow(
      new ConflictException('Ya existe un vehículo con esa placa o VIN'),
    );
  });

  it('al editar sin cambiar de dueño no verifica al cliente', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ customerId: 'c1' });
    await service.update('v1', { customerId: 'c1', color: 'Rojo' });
    expect(customers.findOne).not.toHaveBeenCalled();
  });

  it('no traspasa un vehículo a un cliente inactivo', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ customerId: 'c1' });
    customers.findOne.mockResolvedValue({ customerId: 'c2', isActive: false });
    await expect(service.update('v1', { customerId: 'c2' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('no borra un vehículo con órdenes de trabajo, y dice por qué', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ _count: { workOrders: 3 } });
    await expect(service.remove('v1')).rejects.toThrow(
      new ConflictException(
        'No se puede eliminar: el vehículo tiene 3 órdenes de trabajo en su historial',
      ),
    );
    expect(prisma.vehicle.delete).not.toHaveBeenCalled();
  });

  it('borra de verdad un vehículo sin historial', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ _count: { workOrders: 0 } });
    await service.remove('v1');
    expect(prisma.vehicle.delete).toHaveBeenCalledWith({
      where: { vehicleId: 'v1' },
    });
  });

  it('responde 404 al borrar un vehículo que no existe', async () => {
    prisma.vehicle.findUnique.mockResolvedValue(null);
    await expect(service.remove('v1')).rejects.toThrow(NotFoundException);
  });

  describe('portal del cliente', () => {
    it('pagina solo los vehículos del cliente, con la búsqueda del personal', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.vehicle.count.mockResolvedValue(10);

      const page = await service.findForCustomer('c1', {
        search: 'abc-1',
        page: 2,
        pageSize: 9,
      });

      const where = vehiclesWhere({ customerId: 'c1', search: 'abc-1' });
      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where,
          orderBy: [{ plate: 'asc' }, { vehicleId: 'asc' }],
          skip: 9,
          take: 9,
        }),
      );
      expect(prisma.vehicle.count).toHaveBeenCalledWith({ where });
      expect(page.meta.totalPages).toBe(2);
    });

    it('sin búsqueda, igual filtra por el cliente', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);
      prisma.vehicle.count.mockResolvedValue(0);
      await service.findForCustomer('c1', { page: 1, pageSize: 9 });
      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ customerId: 'c1' }),
        }),
      );
    });

    it('un vehículo de otro cliente responde 404', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);
      await expect(service.findOneForCustomer('v1', 'c1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.vehicle.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vehicleId: 'v1', customerId: 'c1' },
        }),
      );
    });
  });
});
