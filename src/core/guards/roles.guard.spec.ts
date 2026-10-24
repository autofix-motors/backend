import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANY_SESSION_KEY } from '../decorators/any-session.decorator.js';
import { CUSTOMER_ONLY_KEY } from '../decorators/customer-only.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import { testContext } from './test-context.js';

// La tabla entera, celda por celda. La que importa más es la del cliente en un
// endpoint sin decorador: tiene que ser 403, para que olvidarse un @Roles en
// un endpoint del taller no se lo abra a los clientes.

const FORBIDDEN = new ForbiddenException('No tienes permiso para esta acción');

type Metadata = Partial<
  Record<
    | typeof IS_PUBLIC_KEY
    | typeof ROLES_KEY
    | typeof CUSTOMER_ONLY_KEY
    | typeof ANY_SESSION_KEY,
    unknown
  >
>;

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const staff = (role: string) => testContext({ user: { userId: 'u1', role } });
  const customer = () => testContext({ customer: { customerId: 'c1' } });
  const endpoint = (metadata: Metadata) =>
    vi
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => metadata[key as keyof Metadata]);

  afterEach(() => vi.restoreAllMocks());

  describe('endpoint público', () => {
    beforeEach(() => endpoint({ [IS_PUBLIC_KEY]: true }));
    it('pasa sin sesión', () => {
      expect(guard.canActivate(testContext({}))).toBe(true);
    });
  });

  describe('endpoint sin decorador', () => {
    beforeEach(() => endpoint({}));
    it('el personal pasa (solo exige sesión)', () => {
      expect(guard.canActivate(staff('MECHANIC'))).toBe(true);
    });
    it('el cliente recibe 403', () => {
      expect(() => guard.canActivate(customer())).toThrow(FORBIDDEN);
    });
  });

  describe('@Roles(ADMIN)', () => {
    beforeEach(() => endpoint({ [ROLES_KEY]: ['ADMIN'] }));
    it('pasa el rol permitido', () => {
      expect(guard.canActivate(staff('ADMIN'))).toBe(true);
    });
    it('rechaza otro rol del personal', () => {
      expect(() => guard.canActivate(staff('MECHANIC'))).toThrow(FORBIDDEN);
    });
    it('rechaza al cliente', () => {
      expect(() => guard.canActivate(customer())).toThrow(FORBIDDEN);
    });
  });

  describe('@CustomerOnly()', () => {
    beforeEach(() => endpoint({ [CUSTOMER_ONLY_KEY]: true }));
    it('pasa el cliente', () => {
      expect(guard.canActivate(customer())).toBe(true);
    });
    it('rechaza al personal, aunque sea administrador', () => {
      expect(() => guard.canActivate(staff('ADMIN'))).toThrow(FORBIDDEN);
    });
  });

  describe('@AnySession()', () => {
    beforeEach(() => endpoint({ [ANY_SESSION_KEY]: true }));
    it('pasa el personal', () => {
      expect(guard.canActivate(staff('MECHANIC'))).toBe(true);
    });
    it('pasa el cliente', () => {
      expect(guard.canActivate(customer())).toBe(true);
    });
  });

  it('sin usuario ni cliente en un endpoint protegido, rechaza', () => {
    endpoint({ [ROLES_KEY]: ['ADMIN'] });
    expect(() => guard.canActivate(testContext({}))).toThrow(FORBIDDEN);
  });
});
