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
    customerAccount: {
      upsert: vi.fn().mockResolvedValue({ customerAccountId: 'ca1' }),
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
        customerId: 'c1',
        documentNumber: '45678912',
        isActive: true,
      });

      const credentials = await service.issueTemporaryPassword('c1');

      expect(credentials.loginIdentifier).toBe('45678912');
      expect(credentials.temporaryPassword).toHaveLength(12);
      const { create, update } = prisma.customerAccount.upsert.mock
        .calls[0][0] as {
        create: { passwordHash: string; mustChangePassword: boolean };
        update: { passwordHash: string };
      };
      expect(create.mustChangePassword).toBe(true);
      expect(update.passwordHash).toBe(create.passwordHash);
      expect(
        await argon2.verify(create.passwordHash, credentials.temporaryPassword),
      ).toBe(true);
      expect(sessions.revokeAll).toHaveBeenCalledWith({
        customerAccountId: 'ca1',
      });
    });

    it('a un cliente inactivo no le da acceso', async () => {
      customers.findOne.mockResolvedValue({ customerId: 'c1', isActive: false });
      await expect(service.issueTemporaryPassword('c1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.customerAccount.upsert).not.toHaveBeenCalled();
    });
  });

  it('quitar el acceso de quien no lo tiene responde 404', async () => {
    prisma.customerAccount.delete.mockRejectedValue(
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
      { customerId: 'c1', name: 'Juan', isActive: true },
      { customerId: 'c2', name: 'Ana', isActive: false },
    ]);
    prisma.customerAccount.findMany.mockResolvedValue([
      { customerAccountId: 'ca2', customerId: 'c2' },
    ]);

    const candidates = await service.findLoginCandidates({
      kind: 'email',
      value: 'familia@correo.pe',
    });

    expect(prisma.customerAccount.findMany).toHaveBeenCalledWith({
      where: { customerId: { in: ['c1', 'c2'] } },
    });
    expect(candidates).toEqual([
      {
        customerAccountId: 'ca2',
        customerId: 'c2',
        customer: { customerId: 'c2', name: 'Ana', isActive: false },
      },
    ]);
  });

  it('sin clientes que coincidan no consulta las cuentas', async () => {
    customers.findLoginCandidates.mockResolvedValue([]);
    expect(
      await service.findLoginCandidates({ kind: 'document', value: '1' }),
    ).toEqual([]);
    expect(prisma.customerAccount.findMany).not.toHaveBeenCalled();
  });
});
