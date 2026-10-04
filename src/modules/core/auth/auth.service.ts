import {
  Injectable,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import type { AccessPayload } from '../../../core/auth/session-user.js';
import type { User } from '../../../generated/prisma/client.js';
import { SessionsService, type SessionOrigin } from './sessions.service.js';

/** Lo que el controlador necesita para responder y poner las cookies. */
export interface SessionResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos';

@Injectable()
export class AuthService implements OnModuleInit {
  // Hash de una contraseña que no existe. Cuando el correo no está registrado,
  // igual se verifica contra este hash, para que la respuesta tarde lo mismo y
  // no delate qué correos tienen cuenta.
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sessions: SessionsService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await argon2.hash('dummy-password', {
      type: argon2.argon2id,
    });
  }

  async login(
    email: string,
    password: string,
    origin: SessionOrigin,
  ): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    const hash = user?.passwordHash ?? this.dummyHash;
    const isValid = await argon2.verify(hash, password);
    if (!user?.passwordHash || !isValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // Se dice recién después de validar la contraseña: a quien no la conoce no
    // se le confirma que la cuenta existe.
    if (!user.isActive) {
      throw new UnauthorizedException('Tu usuario está dado de baja');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      user,
      accessToken: await this.signAccessToken(user),
      refreshToken: await this.sessions.create(user.id, origin),
    };
  }

  async refresh(token: string, origin: SessionOrigin): Promise<SessionResult> {
    const rotated = await this.sessions.rotate(token, origin);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
    });

    // Aquí es donde un usuario dado de baja pierde el acceso: su JWT vigente
    // dura como máximo ACCESS_TOKEN_MINUTES, pero ya no puede renovarlo.
    if (!user?.isActive) {
      await this.sessions.revokeFamily(rotated.familyId);
      throw new UnauthorizedException('Tu usuario está dado de baja');
    }

    return {
      user,
      accessToken: await this.signAccessToken(user),
      refreshToken: rotated.token,
    };
  }

  logout(token: string): Promise<void> {
    return this.sessions.revoke(token);
  }

  /** El usuario de la sesión, leído de la base para que salga actualizado. */
  async getSession(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException('Tu usuario está dado de baja');
    }
    return user;
  }

  private signAccessToken(user: User): Promise<string> {
    const payload: AccessPayload = {
      sub: user.id,
      role: user.role,
    };
    const minutes = this.config.getOrThrow<number>('ACCESS_TOKEN_MINUTES');
    return this.jwt.signAsync(payload, { expiresIn: minutes * 60 });
  }
}
