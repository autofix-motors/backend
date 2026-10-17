import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import type { CustomersService } from '../../customer/customers/customers.service.js';
import type { CustomerAccountsService } from '../customer-accounts/customer-accounts.service.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import { AuthService } from './auth.service.js';

// Lo que se prueba es lo que decide: qué credenciales entran, por qué dato,
// qué mensaje sale en cada caso, que un dato inexistente no se distinga de uno
// existente y que la marca de contraseña temporal viaje en el token.

const PASSWORD = 'contrasena-correcta';
const INVALID = new UnauthorizedException('Usuario o contraseña incorrectos');
let passwordHash = '';

function user(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    email: 'ana@taller.local',
    documentNumber: '45678912',
    name: 'Ana',
    isActive: true,
    passwordHash,
    role: 'MECHANIC',
    mustChangePassword: false,
    passwordExpiresAt: null,
    ...overrides,
  };
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    customerAccountId: 'ca1',
    customerId: 'c1',
    passwordHash,
    mustChangePassword: true,
    passwordExpiresAt: new Date(Date.now() + 86_400_000),
    customer: { customerId: 'c1', name: 'Juan', isActive: true },
    ...overrides,
  };
}

const CUSTOMER = {
  customerId: 'c1',
  name: 'Juan Pérez',
  email: 'juan@correo.pe',
  documentNumber: '45678912',
  isActive: true,
};

describe('AuthService', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
  };
  const sessions = {
    create: vi.fn().mockResolvedValue('refresh-token'),
    rotate: vi.fn(),
    revokeFamily: vi.fn(),
    revokeAll: vi.fn(),
  };
  const customerAccounts = {
    findLoginCandidates: vi.fn(),
    findById: vi.fn(),
    findByCustomerId: vi.fn(),
    recordLogin: vi.fn(),
    setOwnPassword: vi.fn(),
  };
  const customers = { findOne: vi.fn() };
  const config = { getOrThrow: vi.fn().mockReturnValue(15) };
  const jwt = new JwtService({
    secret: 'secreto-de-prueba-con-mas-de-32-caracteres',
  });
  let service: AuthService;

  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD);
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config as unknown as ConfigService,
      sessions as unknown as SessionsService,
      customerAccounts as unknown as CustomerAccountsService,
      customers as unknown as CustomersService,
    );
    await service.onModuleInit();
  });

  beforeEach(() => customers.findOne.mockResolvedValue(CUSTOMER));
  afterEach(() => vi.clearAllMocks());

  const tokenOf = (accessToken: string) =>
    jwt.verifyAsync<Record<string, unknown>>(accessToken);

  describe('loginStaff', () => {
    it('busca por correo cuando hay @, y por DNI cuando no', async () => {
      prisma.user.findUnique.mockResolvedValue(user());

      await service.loginStaff(' Ana@Taller.LOCAL ', PASSWORD, {});
      expect(prisma.user.findUnique).toHaveBeenLastCalledWith({
        where: { email: 'ana@taller.local' },
      });

      await service.loginStaff('45.678.912', PASSWORD, {});
      expect(prisma.user.findUnique).toHaveBeenLastCalledWith({
        where: { documentNumber: '45678912' },
      });
    });

    it('rechaza un dato que no existe con el mismo mensaje, verificando igual', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const verify = vi.spyOn(argon2, 'verify');

      await expect(
        service.loginStaff('nadie@taller.local', PASSWORD, {}),
      ).rejects.toThrow(INVALID);
      // Si no se verificara, el dato inexistente respondería más rápido y
      // delataría qué cuentas existen.
      expect(verify).toHaveBeenCalledOnce();
      verify.mockRestore();
    });

    it('rechaza una contraseña incorrecta y un usuario sin contraseña', async () => {
      prisma.user.findUnique.mockResolvedValue(user());
      await expect(
        service.loginStaff('ana@taller.local', 'otra', {}),
      ).rejects.toThrow(INVALID);

      prisma.user.findUnique.mockResolvedValue(user({ passwordHash: null }));
      await expect(
        service.loginStaff('ana@taller.local', PASSWORD, {}),
      ).rejects.toThrow(INVALID);
    });

    it('rechaza a un usuario dado de baja aunque la contraseña sea correcta', async () => {
      prisma.user.findUnique.mockResolvedValue(user({ isActive: false }));
      await expect(
        service.loginStaff('ana@taller.local', PASSWORD, {}),
      ).rejects.toThrow(new UnauthorizedException('Tu usuario está dado de baja'));
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('rechaza una temporal vencida', async () => {
      prisma.user.findUnique.mockResolvedValue(
        user({
          mustChangePassword: true,
          passwordExpiresAt: new Date(Date.now() - 1000),
        }),
      );
      await expect(
        service.loginStaff('ana@taller.local', PASSWORD, {}),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Tu contraseña temporal venció: pide una nueva al taller',
        ),
      );
    });

    it('firma el acceso con el rol y la marca de temporal, y abre la sesión', async () => {
      prisma.user.findUnique.mockResolvedValue(
        user({ mustChangePassword: true }),
      );

      const result = await service.loginStaff('ana@taller.local', PASSWORD, {});

      expect(await tokenOf(result.accessToken)).toMatchObject({
        sub: 'u1',
        role: 'MECHANIC',
        mustChangePassword: true,
      });
      expect(result.refreshToken).toBe('refresh-token');
      expect(sessions.create).toHaveBeenCalledWith({ userId: 'u1' }, {});
      expect(result.session).toMatchObject({
        role: 'MECHANIC',
        userId: 'u1',
        customerId: null,
        mustChangePassword: true,
      });
    });
  });

  describe('loginCustomer', () => {
    it('sin cuentas que coincidan, verifica contra el señuelo y rechaza igual', async () => {
      customerAccounts.findLoginCandidates.mockResolvedValue([]);
      const verify = vi.spyOn(argon2, 'verify');

      await expect(
        service.loginCustomer('45678912', PASSWORD, {}),
      ).rejects.toThrow(INVALID);
      expect(verify).toHaveBeenCalledOnce();
      verify.mockRestore();
    });

    it('con una cuenta que coincide, entra como CUSTOMER con el customerId', async () => {
      customerAccounts.findLoginCandidates.mockResolvedValue([account()]);

      const result = await service.loginCustomer('45678912', PASSWORD, {});

      expect(customerAccounts.findLoginCandidates).toHaveBeenCalledWith({
        kind: 'document',
        value: '45678912',
      });
      expect(await tokenOf(result.accessToken)).toMatchObject({
        sub: 'c1',
        role: 'CUSTOMER',
        mustChangePassword: true,
      });
      expect(sessions.create).toHaveBeenCalledWith(
        { customerAccountId: 'ca1' },
        {},
      );
      expect(customerAccounts.recordLogin).toHaveBeenCalledWith('ca1');
      expect(result.session).toMatchObject({
        role: 'CUSTOMER',
        name: 'Juan Pérez',
        userId: null,
        customerId: 'c1',
      });
    });

    it('entre varias cuentas con el mismo dato, entra la de la contraseña', async () => {
      const otherHash = await argon2.hash('otra-contrasena');
      customerAccounts.findLoginCandidates.mockResolvedValue([
        account({ customerAccountId: 'ca0', passwordHash: otherHash }),
        account(),
      ]);

      await service.loginCustomer('juan@correo.pe', PASSWORD, {});

      expect(sessions.create).toHaveBeenCalledWith(
        { customerAccountId: 'ca1' },
        {},
      );
    });

    it('si la contraseña coincide con más de una cuenta, pide el documento', async () => {
      customerAccounts.findLoginCandidates.mockResolvedValue([
        account({ customerAccountId: 'ca0' }),
        account(),
      ]);
      await expect(
        service.loginCustomer('juan@correo.pe', PASSWORD, {}),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Ese dato lo comparten varias cuentas: ingresa con tu número de documento',
        ),
      );
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('rechaza una contraseña incorrecta', async () => {
      customerAccounts.findLoginCandidates.mockResolvedValue([account()]);
      await expect(
        service.loginCustomer('45678912', 'otra', {}),
      ).rejects.toThrow(INVALID);
    });

    it('un cliente inactivo no entra', async () => {
      customerAccounts.findLoginCandidates.mockResolvedValue([
        account({ customer: { customerId: 'c1', name: 'J', isActive: false } }),
      ]);
      await expect(
        service.loginCustomer('45678912', PASSWORD, {}),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Tu acceso al portal está suspendido: comunícate con el taller',
        ),
      );
    });

    it('rechaza una temporal vencida', async () => {
      customerAccounts.findLoginCandidates.mockResolvedValue([
        account({ passwordExpiresAt: new Date(Date.now() - 1000) }),
      ]);
      await expect(
        service.loginCustomer('45678912', PASSWORD, {}),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Tu contraseña temporal venció: pide una nueva al taller',
        ),
      );
    });
  });

  describe('refresh', () => {
    it('renueva la sesión de un cliente que todavía tiene acceso', async () => {
      sessions.rotate.mockResolvedValue({
        owner: { customerAccountId: 'ca1' },
        familyId: 'f1',
        token: 'nuevo',
      });
      customerAccounts.findById.mockResolvedValue(
        account({ mustChangePassword: false }),
      );

      const result = await service.refresh('viejo', {});

      expect(await tokenOf(result.accessToken)).toMatchObject({
        sub: 'c1',
        role: 'CUSTOMER',
        mustChangePassword: false,
      });
      expect(result.refreshToken).toBe('nuevo');
    });

    it('si le quitaron el acceso, revoca la familia y rechaza', async () => {
      sessions.rotate.mockResolvedValue({
        owner: { customerAccountId: 'ca1' },
        familyId: 'f1',
        token: 'nuevo',
      });
      customerAccounts.findById.mockResolvedValue(null);

      await expect(service.refresh('viejo', {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(sessions.revokeFamily).toHaveBeenCalledWith('f1');
    });

    it('un usuario dado de baja no renueva', async () => {
      sessions.rotate.mockResolvedValue({
        owner: { userId: 'u1' },
        familyId: 'f1',
        token: 'nuevo',
      });
      prisma.user.findUnique.mockResolvedValue(user({ isActive: false }));

      await expect(service.refresh('viejo', {})).rejects.toThrow(
        new UnauthorizedException('Tu usuario está dado de baja'),
      );
      expect(sessions.revokeFamily).toHaveBeenCalledWith('f1');
    });
  });

  describe('changeOwnPassword', () => {
    const principal = { kind: 'customer' as const, customerId: 'c1' };

    it('cambia la del cliente, quita la marca, cierra sus sesiones y abre una nueva', async () => {
      customerAccounts.findByCustomerId.mockResolvedValue(account());
      customerAccounts.setOwnPassword.mockResolvedValue(
        account({ mustChangePassword: false, passwordExpiresAt: null }),
      );

      const result = await service.changeOwnPassword(
        principal,
        PASSWORD,
        'Mi-clave-nueva',
        {},
      );

      const [accountId, newHash] = customerAccounts.setOwnPassword.mock
        .calls[0] as [string, string];
      expect(accountId).toBe('ca1');
      expect(await argon2.verify(newHash, 'Mi-clave-nueva')).toBe(true);
      expect(sessions.revokeAll).toHaveBeenCalledWith({
        customerAccountId: 'ca1',
      });
      expect(sessions.create).toHaveBeenCalledWith(
        { customerAccountId: 'ca1' },
        {},
      );
      expect(await tokenOf(result.accessToken)).toMatchObject({
        mustChangePassword: false,
      });
    });

    it('rechaza si la actual no es correcta, sin cambiar nada', async () => {
      customerAccounts.findByCustomerId.mockResolvedValue(account());
      await expect(
        service.changeOwnPassword(principal, 'otra', 'Mi-clave-nueva', {}),
      ).rejects.toThrow(
        new BadRequestException('La contraseña actual no es correcta'),
      );
      expect(customerAccounts.setOwnPassword).not.toHaveBeenCalled();
    });

    it('no acepta la misma, ni el documento ni el correo como contraseña', async () => {
      customerAccounts.findByCustomerId.mockResolvedValue(account());
      await expect(
        service.changeOwnPassword(principal, PASSWORD, PASSWORD, {}),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.changeOwnPassword(principal, PASSWORD, '45678912', {}),
      ).rejects.toThrow(
        new BadRequestException(
          'La contraseña no puede ser tu documento ni tu correo',
        ),
      );
      await expect(
        service.changeOwnPassword(principal, PASSWORD, 'JUAN@correo.pe', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('cambia la del personal en su tabla', async () => {
      prisma.user.findUnique.mockResolvedValue(
        user({ mustChangePassword: true }),
      );
      prisma.user.update.mockResolvedValue(user());

      await service.changeOwnPassword(
        { kind: 'staff', userId: 'u1', role: 'MECHANIC' },
        PASSWORD,
        'Mi-clave-nueva',
        {},
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: expect.objectContaining({
          mustChangePassword: false,
          passwordExpiresAt: null,
        }),
      });
      expect(sessions.revokeAll).toHaveBeenCalledWith({ userId: 'u1' });
    });
  });
});
