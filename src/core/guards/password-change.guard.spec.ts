import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../decorators/allow-pending-password-change.decorator.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { PasswordChangeGuard } from './password-change.guard.js';
import { testContext } from './test-context.js';

// Con la temporal sin cambiar solo se ve la sesión y se cambia la contraseña:
// la que viajó por WhatsApp no sirve para usar el sistema.

describe('PasswordChangeGuard', () => {
  const reflector = new Reflector();
  const guard = new PasswordChangeGuard(reflector);
  const endpoint = (metadata: Record<string, unknown>) =>
    vi
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: unknown) => metadata[key as string]);
  const pending = () =>
    testContext({ customer: { customerId: 'c1' }, mustChangePassword: true });

  afterEach(() => vi.restoreAllMocks());

  it('deja pasar a quien ya cambió su contraseña', () => {
    endpoint({});
    expect(
      guard.canActivate(testContext({ user: { userId: 'u1' } })),
    ).toBe(true);
  });

  it('con la temporal, rechaza cualquier endpoint que no la permita', () => {
    endpoint({});
    expect(() => guard.canActivate(pending())).toThrow(
      new ForbiddenException('Cambia tu contraseña temporal para continuar'),
    );
  });

  it('con la temporal, deja ver la sesión y cambiarla', () => {
    endpoint({ [ALLOW_PENDING_PASSWORD_CHANGE_KEY]: true });
    expect(guard.canActivate(pending())).toBe(true);
  });

  it('no se mete con los endpoints públicos', () => {
    endpoint({ [IS_PUBLIC_KEY]: true });
    expect(guard.canActivate(pending())).toBe(true);
  });
});
