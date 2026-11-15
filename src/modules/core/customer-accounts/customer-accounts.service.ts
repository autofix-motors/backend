import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LoginIdentifier } from '../../../core/auth/login-identifier.js';
import {
  generateTemporaryPassword,
  hashPassword,
  temporaryPasswordExpiry,
} from '../../../core/auth/passwords.js';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { CuentaCliente } from '../../../generated/prisma/client.js';
import {
  CustomersService,
  type CustomerLoginCandidate,
} from '../../customer/customers/customers.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import type { PortalCredentials } from './entities/portal-credentials.entity.js';

const NO_ACCESS = 'El cliente no tiene acceso al portal';

/** Una cuenta que coincide con lo que se escribió al iniciar sesión. */
export type LoginCandidateAccount = CuentaCliente & {
  cliente: CustomerLoginCandidate;
};

/**
 * El acceso de los clientes a su portal: la cuenta con su contraseña. Es lo
 * único que lee `cuenta_cliente`; al cliente lo busca por
 * CustomersService (invariante 3).
 */
@Injectable()
export class CustomerAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly customers: CustomersService,
    private readonly sessions: SessionsService,
  ) {}

  /**
   * Habilita el acceso o lo restablece: genera una contraseña temporal, que
   * el cliente tiene que cambiar al entrar. Si ya tenía acceso, la anterior
   * deja de servir y se cierran sus sesiones.
   */
  async issueTemporaryPassword(clienteId: string): Promise<PortalCredentials> {
    const customer = await this.customers.findOne(clienteId);
    if (!customer.activo) {
      throw new BadRequestException(
        'El cliente está inactivo: actívalo antes de darle acceso al portal',
      );
    }

    const contrasenaTemporal = generateTemporaryPassword();
    const expiraEn = temporaryPasswordExpiry(
      this.config.getOrThrow<number>('TEMPORARY_PASSWORD_DAYS'),
    );
    const access = {
      hashContrasena: await hashPassword(contrasenaTemporal),
      debeCambiarContrasena: true,
      contrasenaExpiraEn: expiraEn,
    };
    const account = await this.prisma.cuentaCliente.upsert({
      where: { clienteId },
      create: { clienteId, ...access },
      update: access,
    });
    await this.sessions.revokeAll({
      cuentaClienteId: account.cuentaClienteId,
    });

    return {
      identificadorAcceso: customer.numeroDocumento,
      contrasenaTemporal,
      expiraEn,
    };
  }

  /**
   * Quita el acceso: borra la cuenta, y sus sesiones caen en cascada. El
   * historial del cliente (sus órdenes) no depende de ella.
   */
  async remove(clienteId: string): Promise<void> {
    try {
      await this.prisma.cuentaCliente.delete({ where: { clienteId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(NO_ACCESS);
      }
      throw error;
    }
  }

  /** Las cuentas que coinciden con el identificador del login, con su cliente. */
  async findLoginCandidates(
    identifier: LoginIdentifier,
  ): Promise<LoginCandidateAccount[]> {
    const customers = await this.customers.findLoginCandidates(identifier);
    if (!customers.length) return [];
    const accounts = await this.prisma.cuentaCliente.findMany({
      where: { clienteId: { in: customers.map((c) => c.clienteId) } },
    });
    return accounts.flatMap((account) => {
      const customer = customers.find((c) => c.clienteId === account.clienteId);
      return customer ? [{ ...account, cliente: customer }] : [];
    });
  }

  findById(cuentaClienteId: string): Promise<CuentaCliente | null> {
    return this.prisma.cuentaCliente.findUnique({
      where: { cuentaClienteId },
    });
  }

  findByCustomerId(clienteId: string): Promise<CuentaCliente | null> {
    return this.prisma.cuentaCliente.findUnique({ where: { clienteId } });
  }

  async recordLogin(cuentaClienteId: string): Promise<void> {
    await this.prisma.cuentaCliente.update({
      where: { cuentaClienteId },
      data: { ultimoIngresoEn: new Date() },
    });
  }

  /** La contraseña que eligió el propio cliente: deja de ser temporal. */
  setOwnPassword(
    cuentaClienteId: string,
    hashContrasena: string,
  ): Promise<CuentaCliente> {
    return this.prisma.cuentaCliente.update({
      where: { cuentaClienteId },
      data: {
        hashContrasena,
        debeCambiarContrasena: false,
        contrasenaExpiraEn: null,
      },
    });
  }
}
