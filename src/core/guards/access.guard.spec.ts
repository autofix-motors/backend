import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AccessGuard } from './access.guard.js';
import { testContext } from './test-context.js';

const SECRET = 'secreto-de-prueba-con-mas-de-32-caracteres';

describe('AccessGuard', () => {
  const jwt = new JwtService({ secret: SECRET });
  const reflector = new Reflector();
  const guard = new AccessGuard(reflector, jwt);

  afterEach(() => vi.restoreAllMocks());

  it('deja pasar un endpoint público sin cookie', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(testContext({}))).resolves.toBe(true);
  });

  it('rechaza una petición sin cookie de acceso', async () => {
    await expect(
      guard.canActivate(testContext({ cookies: {} })),
    ).rejects.toThrow(
      new UnauthorizedException('Inicia sesión para continuar'),
    );
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const forged = await new JwtService({
      secret: 'otro-secreto-cualquiera-de-32-caracteres',
    }).signAsync({ sub: 'u1' });
    await expect(
      guard.canActivate(testContext({ cookies: { afm_access: forged } })),
    ).rejects.toThrow(new UnauthorizedException('Tu sesión expiró'));
  });

  it('rechaza un token vencido', async () => {
    const expired = await jwt.signAsync({ sub: 'u1' }, { expiresIn: -10 });
    await expect(
      guard.canActivate(testContext({ cookies: { afm_access: expired } })),
    ).rejects.toThrow(new UnauthorizedException('Tu sesión expiró'));
  });

  it('con un token válido deja el usuario en la petición', async () => {
    const token = await jwt.signAsync({ sub: 'u1', role: 'MECHANIC' });
    const request: Record<string, unknown> = { cookies: { afm_access: token } };

    await expect(guard.canActivate(testContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'u1', role: 'MECHANIC' });
    expect(request.customer).toBeUndefined();
    // Un token sin la marca no está pendiente de cambiar la contraseña.
    expect(request.mustChangePassword).toBe(false);
  });

  it('con el token de un cliente deja al cliente, nunca un usuario', async () => {
    const token = await jwt.signAsync({
      sub: 'c1',
      role: 'CUSTOMER',
      mustChangePassword: true,
    });
    const request: Record<string, unknown> = { cookies: { afm_access: token } };

    await expect(guard.canActivate(testContext(request))).resolves.toBe(true);
    expect(request.customer).toEqual({ customerId: 'c1' });
    expect(request.user).toBeUndefined();
    expect(request.mustChangePassword).toBe(true);
  });
});
