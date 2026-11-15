import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { CustomersService } from '../../customer/customers/customers.service.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import { CustomerAccountsService } from './customer-accounts.service.js';

describe('CustomerAccountsService', () => {
  const prisma = {
    cuentaCliente: {
      upsert: vi.fn().mockResolvedValue({ cuentaClienteId: 'ca1' }),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const customers = { findOne: vi.fn(), findLoginCandidates: vi.fn() };
  const sessions = { revokeAll: vi.fn() };
  const config = { getOrThrow: vi.fn().mockReturnValue(7) };
  const service = new CustomerAccountsService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    customers as unknown as CustomersService,
    sessions as unknown as SessionsService,
  );

  afterEach(() => vi.clearAllMocks());

  describe('issueTemporaryPassword', () => {
    it('habilita o restablece con una temporal y cierra las sesiones anteriores', async () => {
      customers.findOne.mockResolvedValue({
        clienteId: 'c1',
        numeroDocumento: '45678912',
        activo: true,
      });

      const credentials = await service.issueTemporaryPassword('c1');

      expect(credentials.identificadorAcceso).toBe('45678912');
      expect(credentials.contrasenaTemporal).toHaveLength(12);
      const { create, update } = prisma.cuentaCliente.upsert.mock
        .calls[0][0] as {
        create: { hashContrasena: string; debeCambiarContrasena: boolean };
        update: { hashContrasena: string };
      };
      expect(create.debeCambiarContrasena).toBe(true);
      expect(update.hashContrasena).toBe(create.hashContrasena);
      expect(
        await argon2.verify(
          create.hashContrasena,
          credentials.contrasenaTemporal,
        ),
      ).toBe(true);
      expect(sessions.revokeAll).toHaveBeenCalledWith({
        cuentaClienteId: 'ca1',
      });
    });

    it('a un cliente inactivo no le da acceso', async () => {
      customers.findOne.mockResolvedValue({ clienteId: 'c1', activo: false });
      await expect(service.issueTemporaryPassword('c1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.cuentaCliente.upsert).not.toHaveBeenCalled();
    });
  });

  it('quitar el acceso de quien no lo tiene responde 404', async () => {
    prisma.cuentaCliente.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('no existe', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    await expect(service.remove('c1')).rejects.toThrow(
      new NotFoundException('El cliente no tiene acceso al portal'),
    );
  });

  it('une las cuentas candidatas del login con su cliente', async () => {
    customers.findLoginCandidates.mockResolvedValue([
      { clienteId: 'c1', nombre: 'Juan', activo: true },
      { clienteId: 'c2', nombre: 'Ana', activo: false },
    ]);
    prisma.cuentaCliente.findMany.mockResolvedValue([
      { cuentaClienteId: 'ca2', clienteId: 'c2' },
    ]);

    const candidates = await service.findLoginCandidates({
      tipo: 'correo',
      valor: 'familia@correo.pe',
    });

    expect(prisma.cuentaCliente.findMany).toHaveBeenCalledWith({
      where: { clienteId: { in: ['c1', 'c2'] } },
    });
    expect(candidates).toEqual([
      {
        cuentaClienteId: 'ca2',
        clienteId: 'c2',
        cliente: { clienteId: 'c2', nombre: 'Ana', activo: false },
      },
    ]);
  });

  it('sin clientes que coincidan no consulta las cuentas', async () => {
    customers.findLoginCandidates.mockResolvedValue([]);
    expect(
      await service.findLoginCandidates({ tipo: 'documento', valor: '1' }),
    ).toEqual([]);
    expect(prisma.cuentaCliente.findMany).not.toHaveBeenCalled();
  });
});
