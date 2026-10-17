import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { normalizeLoginIdentifier } from '../../../core/auth/login-identifier.js';
import {
  hashPassword,
  verifyPassword,
} from '../../../core/auth/passwords.js';
import {
  CUSTOMER_ROLE,
  type AccessPayload,
  type SessionPrincipal,
} from '../../../core/auth/session-user.js';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import type {
  CustomerAccount,
  User,
} from '../../../generated/prisma/client.js';
import { CustomersService } from '../../customer/customers/customers.service.js';
import { CustomerAccountsService } from '../customer-accounts/customer-accounts.service.js';
import {
  SessionsService,
  type SessionOrigin,
  type SessionOwner,
} from '../sessions/sessions.service.js';
import type { CurrentSessionModel } from './entities/current-session.entity.js';

/** Lo que el controlador necesita para responder y poner las cookies. */
export interface SessionResult {
  session: CurrentSessionModel;
  accessToken: string;
  refreshToken: string;
}

const INVALID_CREDENTIALS = 'Usuario o contraseña incorrectos';
const AMBIGUOUS =
  'Ese dato lo comparten varias cuentas: ingresa con tu número de documento';
const EXPIRED_TEMPORARY =
  'Tu contraseña temporal venció: pide una nueva al taller';
const USER_INACTIVE = 'Tu usuario está dado de baja';
const CUSTOMER_INACTIVE =
  'Tu acceso al portal está suspendido: comunícate con el taller';
const NO_PORTAL_ACCESS = 'Ya no tienes acceso al portal';

/** Quien inició sesión, ya leído de la base. */
type Account =
  | { kind: 'staff'; user: User }
  | {
      kind: 'customer';
      account: CustomerAccount;
      customer: { name: string; email: string | null; documentNumber: string };
    };

@Injectable()
export class AuthService implements OnModuleInit {
  // Hash de una contraseña que no existe. Cuando nadie coincide con lo que se
  // escribió, igual se verifica contra este hash, para que la respuesta tarde
  // lo mismo y no delate qué documentos o correos tienen cuenta.
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sessions: SessionsService,
    private readonly customerAccounts: CustomerAccountsService,
    private readonly customers: CustomersService,
  ) {}

  async onModuleInit() {
    this.dummyHash = await hashPassword('dummy-password');
  }

  /** El login del personal («Soy interno»): por DNI o por correo. */
  async loginStaff(
    rawIdentifier: string,
    password: string,
    origin: SessionOrigin,
  ): Promise<SessionResult> {
    const identifier = normalizeLoginIdentifier(rawIdentifier);
    const user = await this.prisma.user.findUnique({
      where:
        identifier.kind === 'email'
          ? { email: identifier.value }
          : { documentNumber: identifier.value },
    });

    const isValid = await verifyPassword(
      user?.passwordHash ?? this.dummyHash,
      password,
    );
    if (!user?.passwordHash || !isValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // Se dice recién después de validar la contraseña: a quien no la conoce no
    // se le confirma que la cuenta existe.
    if (!user.isActive) throw new UnauthorizedException(USER_INACTIVE);
    assertTemporaryNotExpired(user);

    await this.prisma.user.update({
      where: { userId: user.userId },
      data: { lastLoginAt: new Date() },
    });
    return this.open({ kind: 'staff', user }, origin);
  }

  /**
   * El login del portal: por número de documento o correo. Puede haber varias
   * cuentas con el mismo dato (el documento solo es único junto con su tipo y
   * el correo no es único): la contraseña decide cuál. Si coincide con más de
   * una, se pide el documento.
   */
  async loginCustomer(
    rawIdentifier: string,
    password: string,
    origin: SessionOrigin,
  ): Promise<SessionResult> {
    const candidates = await this.customerAccounts.findLoginCandidates(
      normalizeLoginIdentifier(rawIdentifier),
    );
    if (!candidates.length) {
      await verifyPassword(this.dummyHash, password);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const matches = [];
    for (const candidate of candidates) {
      if (await verifyPassword(candidate.passwordHash, password)) {
        matches.push(candidate);
      }
    }
    if (matches.length === 0) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (matches.length > 1) throw new UnauthorizedException(AMBIGUOUS);

    const [account] = matches;
    if (!account.customer.isActive) {
      throw new UnauthorizedException(CUSTOMER_INACTIVE);
    }
    assertTemporaryNotExpired(account);

    await this.customerAccounts.recordLogin(account.customerAccountId);
    const customer = await this.customers.findOne(account.customerId);
    return this.open({ kind: 'customer', account, customer }, origin);
  }

  async refresh(token: string, origin: SessionOrigin): Promise<SessionResult> {
    const rotated = await this.sessions.rotate(token, origin);
    let account: Account;
    try {
      account = await this.loadOwner(rotated.owner);
    } catch (error) {
      // Aquí es donde un usuario dado de baja o un cliente sin acceso pierde la
      // sesión: su JWT vigente dura como máximo ACCESS_TOKEN_MINUTES, pero ya
      // no puede renovarlo.
      await this.sessions.revokeFamily(rotated.familyId);
      throw error;
    }
    return {
      session: sessionModel(account),
      accessToken: await this.signAccessToken(account),
      refreshToken: rotated.token,
    };
  }

  logout(token: string): Promise<void> {
    return this.sessions.revoke(token);
  }

  /** La sesión de quien llama, leída de la base para que salga actualizada. */
  async getSession(principal: SessionPrincipal): Promise<CurrentSessionModel> {
    return sessionModel(await this.loadPrincipal(principal));
  }

  /**
   * Cambia la propia contraseña. Deja de ser temporal, se cierran todas las
   * sesiones (la contraseña anterior pudo filtrarse) y se abre una nueva para
   * quien la cambió, con un JWT sin la marca de cambio pendiente.
   */
  async changeOwnPassword(
    principal: SessionPrincipal,
    currentPassword: string,
    newPassword: string,
    origin: SessionOrigin,
  ): Promise<SessionResult> {
    const account = await this.loadPrincipal(principal);
    const hash =
      account.kind === 'staff'
        ? account.user.passwordHash
        : account.account.passwordHash;
    if (!hash || !(await verifyPassword(hash, currentPassword))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'La contraseña nueva tiene que ser distinta de la actual',
      );
    }
    if (loginIdentifiers(account).includes(newPassword.trim().toLowerCase())) {
      throw new BadRequestException(
        'La contraseña no puede ser tu documento ni tu correo',
      );
    }

    const newHash = await hashPassword(newPassword);
    let updated: Account;
    if (account.kind === 'staff') {
      const user = await this.prisma.user.update({
        where: { userId: account.user.userId },
        data: {
          passwordHash: newHash,
          mustChangePassword: false,
          passwordExpiresAt: null,
        },
      });
      updated = { kind: 'staff', user };
    } else {
      const customerAccount = await this.customerAccounts.setOwnPassword(
        account.account.customerAccountId,
        newHash,
      );
      updated = { ...account, account: customerAccount };
    }

    await this.sessions.revokeAll(owner(updated));
    return this.open(updated, origin);
  }

  private async open(
    account: Account,
    origin: SessionOrigin,
  ): Promise<SessionResult> {
    return {
      session: sessionModel(account),
      accessToken: await this.signAccessToken(account),
      refreshToken: await this.sessions.create(owner(account), origin),
    };
  }

  /** El dueño de una sesión que se renueva, si todavía puede entrar. */
  private async loadOwner(sessionOwner: SessionOwner): Promise<Account> {
    if ('userId' in sessionOwner) {
      const user = await this.prisma.user.findUnique({
        where: { userId: sessionOwner.userId },
      });
      if (!user?.isActive) throw new UnauthorizedException(USER_INACTIVE);
      return { kind: 'staff', user };
    }
    const account = await this.customerAccounts.findById(
      sessionOwner.customerAccountId,
    );
    if (!account) throw new UnauthorizedException(NO_PORTAL_ACCESS);
    return this.customerAccount(account);
  }

  /** Quien llama con un JWT vigente, si todavía puede entrar. */
  private async loadPrincipal(principal: SessionPrincipal): Promise<Account> {
    if (principal.kind === 'staff') {
      return this.loadOwner({ userId: principal.userId });
    }
    const account = await this.customerAccounts.findByCustomerId(
      principal.customerId,
    );
    if (!account) throw new UnauthorizedException(NO_PORTAL_ACCESS);
    return this.customerAccount(account);
  }

  private async customerAccount(account: CustomerAccount): Promise<Account> {
    const customer = await this.customers.findOne(account.customerId);
    if (!customer.isActive) {
      throw new UnauthorizedException(CUSTOMER_INACTIVE);
    }
    return { kind: 'customer', account, customer };
  }

  private signAccessToken(account: Account): Promise<string> {
    const payload: AccessPayload =
      account.kind === 'staff'
        ? {
            sub: account.user.userId,
            role: account.user.role,
            mustChangePassword: account.user.mustChangePassword,
          }
        : {
            sub: account.account.customerId,
            role: CUSTOMER_ROLE,
            mustChangePassword: account.account.mustChangePassword,
          };
    const minutes = this.config.getOrThrow<number>('ACCESS_TOKEN_MINUTES');
    return this.jwt.signAsync(payload, { expiresIn: minutes * 60 });
  }
}

/**
 * Una temporal vencida no sirve para entrar. Se comprueba después de validar
 * la contraseña, como el estado de la cuenta.
 */
function assertTemporaryNotExpired(account: {
  mustChangePassword: boolean;
  passwordExpiresAt: Date | null;
}): void {
  if (
    account.mustChangePassword &&
    account.passwordExpiresAt &&
    account.passwordExpiresAt <= new Date()
  ) {
    throw new UnauthorizedException(EXPIRED_TEMPORARY);
  }
}

function owner(account: Account): SessionOwner {
  return account.kind === 'staff'
    ? { userId: account.user.userId }
    : { customerAccountId: account.account.customerAccountId };
}

/** Con qué entra: la contraseña no puede ser ninguno de estos. */
function loginIdentifiers(account: Account): string[] {
  const values =
    account.kind === 'staff'
      ? [account.user.email, account.user.documentNumber]
      : [account.customer.email, account.customer.documentNumber];
  return values.filter((v): v is string => !!v).map((v) => v.toLowerCase());
}

function sessionModel(account: Account): CurrentSessionModel {
  if (account.kind === 'staff') {
    return {
      role: account.user.role,
      name: account.user.name,
      email: account.user.email,
      mustChangePassword: account.user.mustChangePassword,
      userId: account.user.userId,
      customerId: null,
    };
  }
  return {
    role: CUSTOMER_ROLE,
    name: account.customer.name,
    email: account.customer.email,
    mustChangePassword: account.account.mustChangePassword,
    userId: null,
    customerId: account.account.customerId,
  };
}
