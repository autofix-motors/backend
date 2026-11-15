import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { normalizeLoginIdentifier } from '../../../core/auth/login-identifier.js';
import { hashPassword, verifyPassword } from '../../../core/auth/passwords.js';
import {
  CUSTOMER_ROLE,
  type AccessPayload,
  type SessionPrincipal,
} from '../../../core/auth/session-user.js';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import type {
  CuentaCliente,
  Usuario,
} from '../../../generated/prisma/client.js';
import { TipoDocumento } from '../../../generated/prisma/enums.js';
import { CustomersService } from '../../customer/customers/customers.service.js';
import { CustomerAccountsService } from '../customer-accounts/customer-accounts.service.js';
import {
  SessionsService,
  type SessionOrigin,
  type SessionOwner,
} from '../sessions/sessions.service.js';
import { UsersService } from '../users/users.service.js';
import type { CurrentSessionModel } from './entities/current-session.entity.js';
import type { ProfileModel } from './entities/profile.entity.js';

/** Lo que el controlador necesita para responder y poner las cookies. */
export interface SessionResult {
  sesion: CurrentSessionModel;
  tokenAcceso: string;
  tokenRefresco: string;
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
  | { tipo: 'personal'; usuario: Usuario }
  | {
      tipo: 'cliente';
      cuenta: CuentaCliente;
      cliente: {
        nombre: string;
        correo: string | null;
        numeroDocumento: string;
      };
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
    private readonly users: UsersService,
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
    const user = await this.prisma.usuario.findUnique({
      where:
        identifier.tipo === 'correo'
          ? { correo: identifier.valor }
          : { numeroDocumento: identifier.valor },
    });

    const isValid = await verifyPassword(
      user?.hashContrasena ?? this.dummyHash,
      password,
    );
    if (!user?.hashContrasena || !isValid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    // Se dice recién después de validar la contraseña: a quien no la conoce no
    // se le confirma que la cuenta existe.
    if (!user.activo) throw new UnauthorizedException(USER_INACTIVE);
    assertTemporaryNotExpired(user);

    await this.prisma.usuario.update({
      where: { usuarioId: user.usuarioId },
      data: { ultimoIngresoEn: new Date() },
    });
    return this.open({ tipo: 'personal', usuario: user }, origin);
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
      if (await verifyPassword(candidate.hashContrasena, password)) {
        matches.push(candidate);
      }
    }
    if (matches.length === 0) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (matches.length > 1) throw new UnauthorizedException(AMBIGUOUS);

    const [account] = matches;
    if (!account.cliente.activo) {
      throw new UnauthorizedException(CUSTOMER_INACTIVE);
    }
    assertTemporaryNotExpired(account);

    await this.customerAccounts.recordLogin(account.cuentaClienteId);
    const customer = await this.customers.findOne(account.clienteId);
    return this.open(
      { tipo: 'cliente', cuenta: account, cliente: customer },
      origin,
    );
  }

  async refresh(token: string, origin: SessionOrigin): Promise<SessionResult> {
    const rotated = await this.sessions.rotate(token, origin);
    let account: Account;
    try {
      account = await this.loadOwner(rotated.dueno);
    } catch (error) {
      // Aquí es donde un usuario dado de baja o un cliente sin acceso pierde la
      // sesión: su JWT vigente dura como máximo ACCESS_TOKEN_MINUTES, pero ya
      // no puede renovarlo.
      await this.sessions.revokeFamily(rotated.familiaId);
      throw error;
    }
    return {
      sesion: sessionModel(account),
      tokenAcceso: await this.signAccessToken(account),
      tokenRefresco: rotated.token,
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
   * Los datos de quien llama, para «Mi perfil». Se leen por el service dueño
   * de cada tabla (invariante 3) y con las mismas reglas que la sesión: un
   * usuario dado de baja o un cliente sin acceso no ve su perfil aunque su
   * JWT siga vigente.
   */
  async getProfile(principal: SessionPrincipal): Promise<ProfileModel> {
    if (principal.tipo === 'personal') {
      const user = await this.users.findOne(principal.usuarioId);
      if (!user.activo) throw new UnauthorizedException(USER_INACTIVE);
      return {
        tipo: 'PERSONAL',
        nombre: user.nombre,
        correo: user.correo,
        telefono: user.telefono,
        // El documento del personal es siempre un DNI (8 dígitos).
        tipoDocumento: user.numeroDocumento ? TipoDocumento.DNI : null,
        numeroDocumento: user.numeroDocumento,
        rol: user.rol,
        direccion: null,
        ultimoIngresoEn: user.ultimoIngresoEn,
        miembroDesde: user.creadoEn,
      };
    }

    const account = await this.customerAccounts.findByCustomerId(
      principal.clienteId,
    );
    if (!account) throw new UnauthorizedException(NO_PORTAL_ACCESS);
    const customer = await this.customers.findOne(principal.clienteId);
    if (!customer.activo) throw new UnauthorizedException(CUSTOMER_INACTIVE);
    return {
      tipo: 'CLIENTE',
      nombre: customer.nombre,
      correo: customer.correo,
      telefono: customer.telefono,
      tipoDocumento: customer.tipoDocumento,
      numeroDocumento: customer.numeroDocumento,
      rol: CUSTOMER_ROLE,
      direccion: customer.direccion,
      // El último ingreso es al portal, que es lo que la cuenta registra.
      ultimoIngresoEn: account.ultimoIngresoEn,
      // Cliente del taller desde que se registró, no desde que tiene acceso.
      miembroDesde: customer.creadoEn,
    };
  }

  /**
   * Cambia la propia contraseña. Deja de ser temporal, se cierran todas las
   * sesiones (la contraseña anterior pudo filtrarse) y se abre una nueva para
   * quien la cambió, con un JWT sin la marca de cambio pendiente.
   */
  async changeOwnPassword(
    principal: SessionPrincipal,
    contrasenaActual: string,
    contrasenaNueva: string,
    origin: SessionOrigin,
  ): Promise<SessionResult> {
    const account = await this.loadPrincipal(principal);
    const hash =
      account.tipo === 'personal'
        ? account.usuario.hashContrasena
        : account.cuenta.hashContrasena;
    if (!hash || !(await verifyPassword(hash, contrasenaActual))) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }
    if (contrasenaNueva === contrasenaActual) {
      throw new BadRequestException(
        'La contraseña nueva tiene que ser distinta de la actual',
      );
    }
    if (
      loginIdentifiers(account).includes(contrasenaNueva.trim().toLowerCase())
    ) {
      throw new BadRequestException(
        'La contraseña no puede ser tu documento ni tu correo',
      );
    }

    const newHash = await hashPassword(contrasenaNueva);
    let updated: Account;
    if (account.tipo === 'personal') {
      const user = await this.prisma.usuario.update({
        where: { usuarioId: account.usuario.usuarioId },
        data: {
          hashContrasena: newHash,
          debeCambiarContrasena: false,
          contrasenaExpiraEn: null,
        },
      });
      updated = { tipo: 'personal', usuario: user };
    } else {
      const customerAccount = await this.customerAccounts.setOwnPassword(
        account.cuenta.cuentaClienteId,
        newHash,
      );
      updated = { ...account, cuenta: customerAccount };
    }

    await this.sessions.revokeAll(owner(updated));
    return this.open(updated, origin);
  }

  private async open(
    account: Account,
    origin: SessionOrigin,
  ): Promise<SessionResult> {
    return {
      sesion: sessionModel(account),
      tokenAcceso: await this.signAccessToken(account),
      tokenRefresco: await this.sessions.create(owner(account), origin),
    };
  }

  /** El dueño de una sesión que se renueva, si todavía puede entrar. */
  private async loadOwner(sessionOwner: SessionOwner): Promise<Account> {
    if ('usuarioId' in sessionOwner) {
      const user = await this.prisma.usuario.findUnique({
        where: { usuarioId: sessionOwner.usuarioId },
      });
      if (!user?.activo) throw new UnauthorizedException(USER_INACTIVE);
      return { tipo: 'personal', usuario: user };
    }
    const account = await this.customerAccounts.findById(
      sessionOwner.cuentaClienteId,
    );
    if (!account) throw new UnauthorizedException(NO_PORTAL_ACCESS);
    return this.customerAccount(account);
  }

  /** Quien llama con un JWT vigente, si todavía puede entrar. */
  private async loadPrincipal(principal: SessionPrincipal): Promise<Account> {
    if (principal.tipo === 'personal') {
      return this.loadOwner({ usuarioId: principal.usuarioId });
    }
    const account = await this.customerAccounts.findByCustomerId(
      principal.clienteId,
    );
    if (!account) throw new UnauthorizedException(NO_PORTAL_ACCESS);
    return this.customerAccount(account);
  }

  private async customerAccount(account: CuentaCliente): Promise<Account> {
    const customer = await this.customers.findOne(account.clienteId);
    if (!customer.activo) {
      throw new UnauthorizedException(CUSTOMER_INACTIVE);
    }
    return { tipo: 'cliente', cuenta: account, cliente: customer };
  }

  private signAccessToken(account: Account): Promise<string> {
    const payload: AccessPayload =
      account.tipo === 'personal'
        ? {
            sub: account.usuario.usuarioId,
            rol: account.usuario.rol,
            debeCambiarContrasena: account.usuario.debeCambiarContrasena,
          }
        : {
            sub: account.cuenta.clienteId,
            rol: CUSTOMER_ROLE,
            debeCambiarContrasena: account.cuenta.debeCambiarContrasena,
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
  debeCambiarContrasena: boolean;
  contrasenaExpiraEn: Date | null;
}): void {
  if (
    account.debeCambiarContrasena &&
    account.contrasenaExpiraEn &&
    account.contrasenaExpiraEn <= new Date()
  ) {
    throw new UnauthorizedException(EXPIRED_TEMPORARY);
  }
}

function owner(account: Account): SessionOwner {
  return account.tipo === 'personal'
    ? { usuarioId: account.usuario.usuarioId }
    : { cuentaClienteId: account.cuenta.cuentaClienteId };
}

/** Con qué entra: la contraseña no puede ser ninguno de estos. */
function loginIdentifiers(account: Account): string[] {
  const values =
    account.tipo === 'personal'
      ? [account.usuario.correo, account.usuario.numeroDocumento]
      : [account.cliente.correo, account.cliente.numeroDocumento];
  return values.filter((v): v is string => !!v).map((v) => v.toLowerCase());
}

function sessionModel(account: Account): CurrentSessionModel {
  if (account.tipo === 'personal') {
    return {
      rol: account.usuario.rol,
      nombre: account.usuario.nombre,
      correo: account.usuario.correo,
      debeCambiarContrasena: account.usuario.debeCambiarContrasena,
      usuarioId: account.usuario.usuarioId,
      clienteId: null,
    };
  }
  return {
    rol: CUSTOMER_ROLE,
    nombre: account.cliente.nombre,
    correo: account.cliente.correo,
    debeCambiarContrasena: account.cuenta.debeCambiarContrasena,
    usuarioId: null,
    clienteId: account.cuenta.clienteId,
  };
}
