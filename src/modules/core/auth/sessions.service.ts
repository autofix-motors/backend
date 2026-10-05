import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';

/** Desde dónde se abrió la sesión. Solo informativo. */
export interface SessionOrigin {
  ip?: string;
  userAgent?: string;
}

const SESSION_EXPIRED = 'Tu sesión expiró. Vuelve a iniciar sesión';

/**
 * El ciclo de vida del token de refresco: crearlo, rotarlo y revocarlo.
 *
 * El token es opaco (32 bytes aleatorios) y en la base solo se guarda su
 * SHA-256. Cada refresco revoca el token usado y crea otro de la misma familia;
 * si llega uno ya revocado, alguien lo copió y se revoca la familia entera.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Abre una sesión nueva y devuelve el token, que solo existe en la cookie. */
  async create(
    userId: string,
    origin: SessionOrigin,
    familyId: string = randomUUID(),
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: hashToken(token),
        expiresAt: this.expiration(),
        ip: origin.ip,
        userAgent: origin.userAgent,
      },
    });
    return token;
  }

  /**
   * Cambia un token de refresco por uno nuevo. Devuelve el usuario y el token
   * nuevo, o lanza 401 si el token no sirve.
   */
  async rotate(
    token: string,
    origin: SessionOrigin,
  ): Promise<{ userId: string; familyId: string; token: string }> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!session) throw new UnauthorizedException(SESSION_EXPIRED);

    if (session.revokedAt) {
      // Un token ya usado vuelve a aparecer: lo tiene alguien más. Se corta la
      // familia completa, también la sesión del dueño legítimo, que tendrá que
      // volver a entrar.
      await this.revokeFamily(session.familyId);
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }

    const newToken = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      // Se revoca con la condición `revokedAt: null` para que dos refrescos
      // simultáneos con el mismo token no pasen los dos: el segundo no
      // actualiza nada y se trata como reuso.
      const revoked = await tx.session.updateMany({
        where: { sessionId: session.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 0) {
        throw new UnauthorizedException(SESSION_EXPIRED);
      }
      const created = await tx.session.create({
        data: {
          userId: session.userId,
          familyId: session.familyId,
          tokenHash: hashToken(newToken),
          expiresAt: this.expiration(),
          ip: origin.ip,
          userAgent: origin.userAgent,
        },
      });
      await tx.session.update({
        where: { sessionId: session.sessionId },
        data: { replacedById: created.sessionId },
      });
    });

    return {
      userId: session.userId,
      familyId: session.familyId,
      token: newToken,
    };
  }

  /** Cierra una sesión. Un token desconocido o ya revocado no es un error. */
  async revoke(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Cierra todas las sesiones de un usuario: lo usa users al desactivarlo o al
   * cambiarle la contraseña o el rol. Solo corta el refresco: el JWT de acceso
   * que ya tiene sigue valiendo hasta que vence (ACCESS_TOKEN_MINUTES).
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private expiration(): Date {
    const days = this.config.getOrThrow<number>('REFRESH_TOKEN_DAYS');
    return new Date(Date.now() + days * 86_400_000);
  }
}

/** SHA-256 en hexadecimal: lo único que se guarda del token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
