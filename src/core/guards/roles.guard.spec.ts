import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { testContext } from './test-context.js';

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const withRole = (role: string) => testContext({ user: { id: 'u1', role } });

  afterEach(() => vi.restoreAllMocks());

  it('deja pasar un endpoint que no restringe roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(withRole('MECHANIC'))).toBe(true);
  });

  it('deja pasar cuando el rol del usuario está entre los permitidos', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      'ADMIN',
      'MECHANIC',
    ]);
    expect(guard.canActivate(withRole('MECHANIC'))).toBe(true);
  });

  it('rechaza cuando el rol del usuario no está entre los permitidos', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    expect(() => guard.canActivate(withRole('MECHANIC'))).toThrow(
      new ForbiddenException('No tienes permiso para esta acción'),
    );
  });
});
