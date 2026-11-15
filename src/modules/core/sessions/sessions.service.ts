import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';

/** Desde dónde se abrió la sesión. Solo informativo. */
export interface SessionOrigin {
  ip?: string;
  agenteUsuario?: string;
}

/**
 * De quién es una sesión: un usuario del personal o la cuenta de un cliente.
 * Es exactamente uno de los dos (lo asegura el CHECK de `sesion`).
 */
export type SessionOwner = { usuarioId: string } | { cuentaClienteId: string };

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
    familiaId: string = randomUUID(),
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.sesion.create({
      data: {
        ...ownerColumns(owner),
        familiaId,
        hashToken: hashToken(token),
        expiraEn: this.expiration(),
        ip: origin.ip,
        agenteUsuario: origin.agenteUsuario,
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
  ): Promise<{ dueno: SessionOwner; familiaId: string; token: string }> {
    const session = await this.prisma.sesion.findUnique({
      where: { hashToken: hashToken(token) },
    });
    if (!session) throw new UnauthorizedException(SESSION_EXPIRED);

    if (session.revocadaEn) {
      // Un token ya usado vuelve a aparecer: lo tiene alguien más. Se corta la
      // familia completa, también la sesión del dueño legítimo, que tendrá que
      // volver a entrar.
      await this.revokeFamily(session.familiaId);
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    if (session.expiraEn <= new Date()) {
      throw new UnauthorizedException(SESSION_EXPIRED);
    }
    const owner = sessionOwner(session);

    const newToken = randomBytes(32).toString('base64url');
    await this.prisma.$transaction(async (tx) => {
      // Se revoca con la condición `revocadaEn: null` para que dos refrescos
      // simultáneos con el mismo token no pasen los dos: el segundo no
      // actualiza nada y se trata como reuso.
      const revoked = await tx.sesion.updateMany({
        where: { sesionId: session.sesionId, revocadaEn: null },
        data: { revocadaEn: new Date() },
      });
      if (revoked.count === 0) {
        throw new UnauthorizedException(SESSION_EXPIRED);
      }
      const created = await tx.sesion.create({
        data: {
          ...ownerColumns(owner),
          familiaId: session.familiaId,
          hashToken: hashToken(newToken),
          expiraEn: this.expiration(),
          ip: origin.ip,
          agenteUsuario: origin.agenteUsuario,
        },
      });
      await tx.sesion.update({
        where: { sesionId: session.sesionId },
        data: { reemplazadaPorId: created.sesionId },
      });
    });

    return { dueno: owner, familiaId: session.familiaId, token: newToken };
  }

  /** Cierra una sesión. Un token desconocido o ya revocado no es un error. */
  async revoke(token: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { hashToken: hashToken(token), revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  async revokeFamily(familiaId: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { familiaId, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  /**
   * Cierra todas las sesiones de un dueño: al desactivarlo, al cambiarle la
   * contraseña o el rol, o al restablecérsela. Solo corta el refresco: el JWT
   * de acceso que ya tiene sigue valiendo hasta que vence
   * (ACCESS_TOKEN_MINUTES).
   */
  async revokeAll(owner: SessionOwner): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { ...ownerColumns(owner), revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
  }

  /**
   * Cierra las sesiones del portal de un cliente, si tiene acceso: al
   * desactivarlo. Customers conoce al cliente, no su cuenta.
   */
  async revokeAllForCustomer(clienteId: string): Promise<void> {
    await this.prisma.sesion.updateMany({
      where: { cuentaCliente: { clienteId }, revocadaEn: null },
      data: { revocadaEn: new Date() },
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
  usuarioId: string | null;
  cuentaClienteId: string | null;
} {
  return 'usuarioId' in owner
    ? { usuarioId: owner.usuarioId, cuentaClienteId: null }
    : { usuarioId: null, cuentaClienteId: owner.cuentaClienteId };
}

function sessionOwner(session: {
  usuarioId: string | null;
  cuentaClienteId: string | null;
}): SessionOwner {
  if (session.usuarioId) return { usuarioId: session.usuarioId };
  if (session.cuentaClienteId) {
    return { cuentaClienteId: session.cuentaClienteId };
  }
  // El CHECK de la tabla lo impide; si pasara, la sesión no sirve.
  throw new UnauthorizedException(SESSION_EXPIRED);
}
