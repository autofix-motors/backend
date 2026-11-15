import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import type { CustomersService } from '../../customer/customers/customers.service.js';
import type { CustomerAccountsService } from '../customer-accounts/customer-accounts.service.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import type { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { Profile } from './entities/profile.entity.js';

// Lo que se prueba es lo que decide: qué credenciales entran, por qué dato,
// qué mensaje sale en cada caso, que un dato inexistente no se distinga de uno
// existente y que la marca de contraseña temporal viaje en el token.

const PASSWORD = 'contrasena-correcta';
const INVALID = new UnauthorizedException('Usuario o contraseña incorrectos');
let hashContrasena = '';

function user(overrides: Record<string, unknown> = {}) {
  return {
    usuarioId: 'u1',
    correo: 'ana@taller.local',
    numeroDocumento: '45678912',
    nombre: 'Ana',
    activo: true,
    hashContrasena,
    rol: 'MECANICO',
    debeCambiarContrasena: false,
    contrasenaExpiraEn: null,
    ...overrides,
  };
}

function account(overrides: Record<string, unknown> = {}) {
  return {
    cuentaClienteId: 'ca1',
    clienteId: 'c1',
    hashContrasena,
    debeCambiarContrasena: true,
    contrasenaExpiraEn: new Date(Date.now() + 86_400_000),
    cliente: { clienteId: 'c1', nombre: 'Juan', activo: true },
    ...overrides,
  };
}

const CUSTOMER = {
  clienteId: 'c1',
  nombre: 'Juan Pérez',
  correo: 'juan@correo.pe',
  numeroDocumento: '45678912',
  activo: true,
};

describe('AuthService', () => {
  const prisma = {
    usuario: { findUnique: vi.fn(), update: vi.fn() },
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
  const users = { findOne: vi.fn() };
  const config = { getOrThrow: vi.fn().mockReturnValue(15) };
  const jwt = new JwtService({
    secret: 'secreto-de-prueba-con-mas-de-32-caracteres',
  });
  let service: AuthService;

  beforeAll(async () => {
    hashContrasena = await argon2.hash(PASSWORD);
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config as unknown as ConfigService,
      sessions as unknown as SessionsService,
      customerAccounts as unknown as CustomerAccountsService,
      customers as unknown as CustomersService,
      users as unknown as UsersService,
    );
    await service.onModuleInit();
  });

  beforeEach(() => customers.findOne.mockResolvedValue(CUSTOMER));
  afterEach(() => vi.clearAllMocks());

  const tokenOf = (tokenAcceso: string) =>
    jwt.verifyAsync<Record<string, unknown>>(tokenAcceso);

  describe('loginStaff', () => {
    it('busca por correo cuando hay @, y por DNI cuando no', async () => {
      prisma.usuario.findUnique.mockResolvedValue(user());

      await service.loginStaff(' Ana@Taller.LOCAL ', PASSWORD, {});
      expect(prisma.usuario.findUnique).toHaveBeenLastCalledWith({
        where: { correo: 'ana@taller.local' },
      });

      await service.loginStaff('45.678.912', PASSWORD, {});
      expect(prisma.usuario.findUnique).toHaveBeenLastCalledWith({
        where: { numeroDocumento: '45678912' },
      });
    });

    it('rechaza un dato que no existe con el mismo mensaje, verificando igual', async () => {
      prisma.usuario.findUnique.mockResolvedValue(null);
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
      prisma.usuario.findUnique.mockResolvedValue(user());
      await expect(
        service.loginStaff('ana@taller.local', 'otra', {}),
      ).rejects.toThrow(INVALID);

      prisma.usuario.findUnique.mockResolvedValue(
        user({ hashContrasena: null }),
      );
      await expect(
        service.loginStaff('ana@taller.local', PASSWORD, {}),
      ).rejects.toThrow(INVALID);
    });

    it('rechaza a un usuario dado de baja aunque la contraseña sea correcta', async () => {
      prisma.usuario.findUnique.mockResolvedValue(user({ activo: false }));
      await expect(
        service.loginStaff('ana@taller.local', PASSWORD, {}),
      ).rejects.toThrow(
        new UnauthorizedException('Tu usuario está dado de baja'),
      );
      expect(sessions.create).not.toHaveBeenCalled();
    });

    it('rechaza una temporal vencida', async () => {
      prisma.usuario.findUnique.mockResolvedValue(
        user({
          debeCambiarContrasena: true,
          contrasenaExpiraEn: new Date(Date.now() - 1000),
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
      prisma.usuario.findUnique.mockResolvedValue(
        user({ debeCambiarContrasena: true }),
      );

      const result = await service.loginStaff('ana@taller.local', PASSWORD, {});

      expect(await tokenOf(result.tokenAcceso)).toMatchObject({
        sub: 'u1',
        rol: 'MECANICO',
        debeCambiarContrasena: true,
      });
      expect(result.tokenRefresco).toBe('refresh-token');
      expect(sessions.create).toHaveBeenCalledWith({ usuarioId: 'u1' }, {});
      expect(result.sesion).toMatchObject({
        rol: 'MECANICO',
        usuarioId: 'u1',
        clienteId: null,
        debeCambiarContrasena: true,
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

    it('con una cuenta que coincide, entra como CLIENTE con el clienteId', async () => {
      customerAccounts.findLoginCandidates.mockResolvedValue([account()]);

      const result = await service.loginCustomer('45678912', PASSWORD, {});

      expect(customerAccounts.findLoginCandidates).toHaveBeenCalledWith({
        tipo: 'documento',
        valor: '45678912',
      });
      expect(await tokenOf(result.tokenAcceso)).toMatchObject({
        sub: 'c1',
        rol: 'CLIENTE',
        debeCambiarContrasena: true,
      });
      expect(sessions.create).toHaveBeenCalledWith(
        { cuentaClienteId: 'ca1' },
        {},
      );
      expect(customerAccounts.recordLogin).toHaveBeenCalledWith('ca1');
      expect(result.sesion).toMatchObject({
        rol: 'CLIENTE',
        nombre: 'Juan Pérez',
        usuarioId: null,
        clienteId: 'c1',
      });
    });

    it('entre varias cuentas con el mismo dato, entra la de la contraseña', async () => {
      const otherHash = await argon2.hash('otra-contrasena');
      customerAccounts.findLoginCandidates.mockResolvedValue([
        account({ cuentaClienteId: 'ca0', hashContrasena: otherHash }),
        account(),
      ]);

      await service.loginCustomer('juan@correo.pe', PASSWORD, {});

      expect(sessions.create).toHaveBeenCalledWith(
        { cuentaClienteId: 'ca1' },
        {},
      );
    });

    it('si la contraseña coincide con más de una cuenta, pide el documento', async () => {
      customerAccounts.findLoginCandidates.mockResolvedValue([
        account({ cuentaClienteId: 'ca0' }),
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
        account({ cliente: { clienteId: 'c1', nombre: 'J', activo: false } }),
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
        account({ contrasenaExpiraEn: new Date(Date.now() - 1000) }),
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
        dueno: { cuentaClienteId: 'ca1' },
        familiaId: 'f1',
        token: 'nuevo',
      });
      customerAccounts.findById.mockResolvedValue(
        account({ debeCambiarContrasena: false }),
      );

      const result = await service.refresh('viejo', {});

      expect(await tokenOf(result.tokenAcceso)).toMatchObject({
        sub: 'c1',
        rol: 'CLIENTE',
        debeCambiarContrasena: false,
      });
      expect(result.tokenRefresco).toBe('nuevo');
    });

    it('si le quitaron el acceso, revoca la familia y rechaza', async () => {
      sessions.rotate.mockResolvedValue({
        dueno: { cuentaClienteId: 'ca1' },
        familiaId: 'f1',
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
        dueno: { usuarioId: 'u1' },
        familiaId: 'f1',
        token: 'nuevo',
      });
      prisma.usuario.findUnique.mockResolvedValue(user({ activo: false }));

      await expect(service.refresh('viejo', {})).rejects.toThrow(
        new UnauthorizedException('Tu usuario está dado de baja'),
      );
      expect(sessions.revokeFamily).toHaveBeenCalledWith('f1');
    });
  });

  describe('changeOwnPassword', () => {
    const principal = { tipo: 'cliente' as const, clienteId: 'c1' };

    it('cambia la del cliente, quita la marca, cierra sus sesiones y abre una nueva', async () => {
      customerAccounts.findByCustomerId.mockResolvedValue(account());
      customerAccounts.setOwnPassword.mockResolvedValue(
        account({ debeCambiarContrasena: false, contrasenaExpiraEn: null }),
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
        cuentaClienteId: 'ca1',
      });
      expect(sessions.create).toHaveBeenCalledWith(
        { cuentaClienteId: 'ca1' },
        {},
      );
      expect(await tokenOf(result.tokenAcceso)).toMatchObject({
        debeCambiarContrasena: false,
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
      prisma.usuario.findUnique.mockResolvedValue(
        user({ debeCambiarContrasena: true }),
      );
      prisma.usuario.update.mockResolvedValue(user());

      await service.changeOwnPassword(
        { tipo: 'personal', usuarioId: 'u1', rol: 'MECANICO' },
        PASSWORD,
        'Mi-clave-nueva',
        {},
      );

      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { usuarioId: 'u1' },
        data: expect.objectContaining({
          debeCambiarContrasena: false,
          contrasenaExpiraEn: null,
        }),
      });
      expect(sessions.revokeAll).toHaveBeenCalledWith({ usuarioId: 'u1' });
    });
  });

  describe('getProfile', () => {
    const MEMBER_SINCE = new Date('2026-01-10T15:00:00Z');
    const LAST_LOGIN = new Date('2026-11-14T13:30:00Z');

    it('arma el del personal por UsersService, con DNI si tiene documento', async () => {
      users.findOne.mockResolvedValue(
        user({
          rol: 'ADMINISTRADOR',
          telefono: '987654321',
          ultimoIngresoEn: LAST_LOGIN,
          creadoEn: MEMBER_SINCE,
        }),
      );

      const profile = await service.getProfile({
        tipo: 'personal',
        usuarioId: 'u1',
        rol: 'ADMINISTRADOR',
      });

      expect(users.findOne).toHaveBeenCalledWith('u1');
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
      expect(profile).toEqual({
        tipo: 'PERSONAL',
        nombre: 'Ana',
        correo: 'ana@taller.local',
        telefono: '987654321',
        tipoDocumento: 'DNI',
        numeroDocumento: '45678912',
        rol: 'ADMINISTRADOR',
        direccion: null,
        ultimoIngresoEn: LAST_LOGIN,
        miembroDesde: MEMBER_SINCE,
      });
    });

    it('deja el tipo de documento vacío si el personal no tiene DNI', async () => {
      users.findOne.mockResolvedValue(
        user({ numeroDocumento: null, telefono: null, creadoEn: MEMBER_SINCE }),
      );
      const profile = await service.getProfile({
        tipo: 'personal',
        usuarioId: 'u1',
        rol: 'MECANICO',
      });
      expect(profile).toMatchObject({
        tipoDocumento: null,
        numeroDocumento: null,
      });
    });

    it('no muestra el perfil de un usuario dado de baja', async () => {
      users.findOne.mockResolvedValue(user({ activo: false }));
      await expect(
        service.getProfile({
          tipo: 'personal',
          usuarioId: 'u1',
          rol: 'MECANICO',
        }),
      ).rejects.toThrow(
        new UnauthorizedException('Tu usuario está dado de baja'),
      );
    });

    it('arma el del cliente con su documento, dirección y el último ingreso al portal', async () => {
      customerAccounts.findByCustomerId.mockResolvedValue(
        account({ ultimoIngresoEn: LAST_LOGIN }),
      );
      customers.findOne.mockResolvedValue({
        ...CUSTOMER,
        tipoDocumento: 'DNI',
        telefono: '912345678',
        direccion: 'Av. Los Olivos 123',
        creadoEn: MEMBER_SINCE,
      });

      const profile = await service.getProfile({
        tipo: 'cliente',
        clienteId: 'c1',
      });

      expect(customerAccounts.findByCustomerId).toHaveBeenCalledWith('c1');
      expect(customers.findOne).toHaveBeenCalledWith('c1');
      expect(profile).toEqual({
        tipo: 'CLIENTE',
        nombre: 'Juan Pérez',
        correo: 'juan@correo.pe',
        telefono: '912345678',
        tipoDocumento: 'DNI',
        numeroDocumento: '45678912',
        rol: 'CLIENTE',
        direccion: 'Av. Los Olivos 123',
        ultimoIngresoEn: LAST_LOGIN,
        miembroDesde: MEMBER_SINCE,
      });
    });

    it('rechaza a un cliente sin acceso al portal o inactivo', async () => {
      customerAccounts.findByCustomerId.mockResolvedValue(null);
      await expect(
        service.getProfile({ tipo: 'cliente', clienteId: 'c1' }),
      ).rejects.toThrow(
        new UnauthorizedException('Ya no tienes acceso al portal'),
      );

      customerAccounts.findByCustomerId.mockResolvedValue(account());
      customers.findOne.mockResolvedValue({ ...CUSTOMER, activo: false });
      await expect(
        service.getProfile({ tipo: 'cliente', clienteId: 'c1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('la respuesta no saca hashes ni ids, aunque el modelo los traiga', () => {
      const leaky = {
        tipo: 'PERSONAL' as const,
        nombre: 'Ana',
        correo: null,
        telefono: null,
        tipoDocumento: null,
        numeroDocumento: null,
        rol: 'MECANICO' as const,
        direccion: null,
        ultimoIngresoEn: null,
        miembroDesde: MEMBER_SINCE,
        hashContrasena: 'hash',
        usuarioId: 'u1',
      };
      expect(Object.keys(new Profile(leaky)).sort()).toEqual([
        'correo',
        'direccion',
        'miembroDesde',
        'nombre',
        'numeroDocumento',
        'rol',
        'telefono',
        'tipo',
        'tipoDocumento',
        'ultimoIngresoEn',
      ]);
    });
  });
});
