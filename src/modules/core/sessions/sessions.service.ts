import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';

/** Desde dónde se abrió la sesión. Solo informativo. */
export interface SessionOrigin {
  ip?: string;
  userAgent?: string;
}

/**
 * De quién es una sesión: un usuario del personal o la cuenta de un cliente.
 * Es exactamente uno de los dos (lo asegura el CHECK de `core_session`).
 */
export type SessionOwner = { userId: string } | { customerAccountId: string };

const SESSION_EXPIRED = 'Tu sesión expiró. Vuelve a iniciar sesión';

/**
 * El ciclo de vida del token de refresco: crearlo, rotarlo y revocarlo, para
 * el personal y para los clientes por igual.
 *
 * El token es opaco (32 bytes aleatorios) y en la base solo se guarda su
 * SHA-256. Cada refresco revoca el token usado y crea otro de la misma familia;
 * si llega uno ya revocado, alguien lo copió y se revoca la familia entera.
 *
 * Es un módulo aparte de auth porque lo usan auth (login), users y
 * customer-accounts (cerrar sesiones), y auth a su vez usa customer-accounts:
 * dentro de auth sería un ciclo.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Abre una sesión nueva y devuelve el token, que solo existe en la cookie. */
  async create(
    owner: SessionOwner,
    origin: SessionOrigin,
    familyId: string = randomUUID(),
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        ...ownerColumns(owner),
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
   * Cambia un token de refresco por uno nuevo. Devuelve el dueño y el token
   * nuevo, o lanza 401 si el token no sirve.
   */
  async rotate(
    token: string,
    origin: SessionOrigin,
  ): Promise<{ owner: SessionOwner; familyId: string; token: string }> {
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
    const owner = sessionOwner(session);

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
          ...ownerColumns(owner),
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

    return { owner, familyId: session.familyId, token: newToken };
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
   * Cierra todas las sesiones de un dueño: al desactivarlo, al cambiarle la
   * contraseña o el rol, o al restablecérsela. Solo corta el refresco: el JWT
   * de acceso que ya tiene sigue valiendo hasta que vence
   * (ACCESS_TOKEN_MINUTES).
   */
  async revokeAll(owner: SessionOwner): Promise<void> {
    await this.prisma.session.updateMany({
      where: { ...ownerColumns(owner), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Cierra las sesiones del portal de un cliente, si tiene acceso: al
   * desactivarlo. Customers conoce al cliente, no su cuenta.
   */
  async revokeAllForCustomer(customerId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { customerAccount: { customerId }, revokedAt: null },
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

/** Las columnas de la fila para un dueño: una llena y la otra vacía. */
function ownerColumns(owner: SessionOwner): {
  userId: string | null;
  customerAccountId: string | null;
} {
  return 'userId' in owner
    ? { userId: owner.userId, customerAccountId: null }
    : { userId: null, customerAccountId: owner.customerAccountId };
}

function sessionOwner(session: {
  userId: string | null;
  customerAccountId: string | null;
}): SessionOwner {
  if (session.userId) return { userId: session.userId };
  if (session.customerAccountId) {
    return { customerAccountId: session.customerAccountId };
  }
  // El CHECK de la tabla lo impide; si pasara, la sesión no sirve.
  throw new UnauthorizedException(SESSION_EXPIRED);
}
