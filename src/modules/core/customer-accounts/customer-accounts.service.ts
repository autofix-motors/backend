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
import type { CustomerAccount } from '../../../generated/prisma/client.js';
import {
  CustomersService,
  type CustomerLoginCandidate,
} from '../../customer/customers/customers.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import type { PortalCredentials } from './entities/portal-credentials.entity.js';

const NO_ACCESS = 'El cliente no tiene acceso al portal';

/** Una cuenta que coincide con lo que se escribió al iniciar sesión. */
export type LoginCandidateAccount = CustomerAccount & {
  customer: CustomerLoginCandidate;
};

/**
 * El acceso de los clientes a su portal: la cuenta con su contraseña. Es lo
 * único que lee `core_customer_account`; al cliente lo busca por
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
  async issueTemporaryPassword(customerId: string): Promise<PortalCredentials> {
    const customer = await this.customers.findOne(customerId);
    if (!customer.isActive) {
      throw new BadRequestException(
        'El cliente está inactivo: actívalo antes de darle acceso al portal',
      );
    }

    const temporaryPassword = generateTemporaryPassword();
    const expiresAt = temporaryPasswordExpiry(
      this.config.getOrThrow<number>('TEMPORARY_PASSWORD_DAYS'),
    );
    const access = {
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      passwordExpiresAt: expiresAt,
    };
    const account = await this.prisma.customerAccount.upsert({
      where: { customerId },
      create: { customerId, ...access },
      update: access,
    });
    await this.sessions.revokeAll({
      customerAccountId: account.customerAccountId,
    });

    return {
      loginIdentifier: customer.documentNumber,
      temporaryPassword,
      expiresAt,
    };
  }

  /**
   * Quita el acceso: borra la cuenta, y sus sesiones caen en cascada. El
   * historial del cliente (sus órdenes) no depende de ella.
   */
  async remove(customerId: string): Promise<void> {
    try {
      await this.prisma.customerAccount.delete({ where: { customerId } });
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
    const accounts = await this.prisma.customerAccount.findMany({
      where: { customerId: { in: customers.map((c) => c.customerId) } },
    });
    return accounts.flatMap((account) => {
      const customer = customers.find(
        (c) => c.customerId === account.customerId,
      );
      return customer ? [{ ...account, customer }] : [];
    });
  }

  findById(customerAccountId: string): Promise<CustomerAccount | null> {
    return this.prisma.customerAccount.findUnique({
      where: { customerAccountId },
    });
  }

  findByCustomerId(customerId: string): Promise<CustomerAccount | null> {
    return this.prisma.customerAccount.findUnique({ where: { customerId } });
  }

  async recordLogin(customerAccountId: string): Promise<void> {
    await this.prisma.customerAccount.update({
      where: { customerAccountId },
      data: { lastLoginAt: new Date() },
    });
  }

  /** La contraseña que eligió el propio cliente: deja de ser temporal. */
  setOwnPassword(
    customerAccountId: string,
    passwordHash: string,
  ): Promise<CustomerAccount> {
    return this.prisma.customerAccount.update({
      where: { customerAccountId },
      data: { passwordHash, mustChangePassword: false, passwordExpiresAt: null },
    });
  }
}
