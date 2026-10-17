import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateTemporaryPassword,
  hashPassword,
  temporaryPasswordExpiry,
} from '../../../core/auth/passwords.js';
import type { SessionUser } from '../../../core/auth/session-user.js';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import {
  pageWindow,
  paginationMeta,
  type Page,
} from '../../../shared/pagination.js';
import { SessionsService } from '../sessions/sessions.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import type { UserWithCounts } from './entities/user.entity.js';

const WITH_COUNTS = {
  _count: { select: { assignedWorkOrders: true } },
} satisfies Prisma.UserInclude;

/**
 * Todo lo que el usuario dejó registrado en los demás dominios, con cómo se
 * nombra en el mensaje del 409. Son las relaciones de `User` con RESTRICT: si
 * alguna tiene filas, la base no deja borrarlo.
 */
const HISTORY_LABELS = {
  assignedWorkOrders: ['orden asignada', 'órdenes asignadas'],
  createdWorkOrders: ['orden registrada', 'órdenes registradas'],
  workOrderEvents: [
    'nota o cambio de estado en una orden',
    'notas o cambios de estado en órdenes',
  ],
  sentQuotes: ['presupuesto enviado', 'presupuestos enviados'],
  decidedQuotes: ['decisión de presupuesto', 'decisiones de presupuesto'],
  stockMovements: ['movimiento de stock', 'movimientos de stock'],
  assignedTools: ['herramienta a su cargo', 'herramientas a su cargo'],
  receivedPayments: ['pago recibido', 'pagos recibidos'],
  voidedPayments: ['pago anulado', 'pagos anulados'],
} as const satisfies Partial<
  Record<keyof Prisma.UserCountOutputType, readonly [string, string]>
>;

type HistoryCounts = Record<keyof typeof HISTORY_LABELS, number>;

const HISTORY_SELECT = Object.fromEntries(
  Object.keys(HISTORY_LABELS).map((relation) => [relation, true]),
) as Record<keyof typeof HISTORY_LABELS, true>;

const NOT_FOUND = 'No se encontró el usuario';
const DUPLICATE_EMAIL = 'Ya existe un usuario con ese correo';
const DUPLICATE_DOCUMENT = 'Ya existe un usuario con ese DNI';

/** La contraseña temporal recién generada: se muestra una sola vez. */
export interface TemporaryPasswordResult {
  temporaryPassword: string;
  expiresAt: Date;
}
const LAST_ADMIN =
  'Es el último administrador activo: el taller necesita al menos uno. Asigna antes el rol a otro usuario';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly config: ConfigService,
  ) {}

  async findAll(query: ListUsersQueryDto): Promise<Page<UserWithCounts>> {
    const where = usersWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include: WITH_COUNTS,
        // El desempate por id hace que la paginación sea estable: con dos
        // usuarios del mismo nombre, el orden no cambia entre páginas.
        orderBy: [usersOrderBy(query), { userId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(userId: string): Promise<UserWithCounts> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: WITH_COUNTS,
    });
    if (!user) throw new NotFoundException(NOT_FOUND);
    return user;
  }

  /**
   * Registra al usuario con una contraseña temporal que genera el sistema: el
   * administrador se la comparte y el usuario la cambia al entrar.
   */
  async create(
    data: CreateUserDto,
  ): Promise<{ user: UserWithCounts } & TemporaryPasswordResult> {
    const { temporaryPassword, expiresAt, ...access } =
      await this.temporaryAccess();
    try {
      const user = await this.prisma.user.create({
        data: { ...data, ...access },
        include: WITH_COUNTS,
      });
      return { user, temporaryPassword, expiresAt };
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  /**
   * Edita los datos, el rol o el estado. Quien edita no puede desactivarse ni
   * quitarse el rol, y nadie puede dejar al taller sin un administrador activo.
   * Si cambia el rol o se desactiva, se cierran sus sesiones.
   */
  async update(
    userId: string,
    data: UpdateUserDto,
    actor: SessionUser,
  ): Promise<UserWithCounts> {
    const current = await this.findOne(userId);
    const isRoleChange = data.role !== undefined && data.role !== current.role;
    const isDeactivation = current.isActive && data.isActive === false;

    if (userId === actor.userId) {
      if (data.isActive === false) {
        throw new BadRequestException('No puedes desactivar tu propio usuario');
      }
      if (isRoleChange) {
        throw new BadRequestException(
          'No puedes quitarte el rol de administrador',
        );
      }
    }
    if (
      current.role === UserRole.ADMIN &&
      current.isActive &&
      (isRoleChange || isDeactivation)
    ) {
      await this.assertAnotherActiveAdmin(userId);
    }

    let user: UserWithCounts;
    try {
      user = await this.prisma.user.update({
        where: { userId },
        data,
        include: WITH_COUNTS,
      });
    } catch (error) {
      throw translateDuplicate(error);
    }
    // El rol viaja en el JWT: sin esto, con el refresco seguiría renovando un
    // token con el rol viejo. El que ya tiene vence en ACCESS_TOKEN_MINUTES.
    if (isRoleChange || isDeactivation) {
      await this.sessions.revokeAll({ userId });
    }
    return user;
  }

  /**
   * Restablece la contraseña con una temporal nueva (no hay «olvidé mi
   * contraseña»: el taller no envía correos). Se cierran sus sesiones para que
   * quien tenga la anterior no siga dentro.
   */
  async issueTemporaryPassword(
    userId: string,
  ): Promise<TemporaryPasswordResult> {
    await this.findOne(userId);
    const { temporaryPassword, expiresAt, ...access } =
      await this.temporaryAccess();
    await this.prisma.user.update({ where: { userId }, data: access });
    await this.sessions.revokeAll({ userId });
    return { temporaryPassword, expiresAt };
  }

  /**
   * Borra el usuario de verdad, solo si no dejó nada registrado: lo que hizo
   * necesita su autor. Se comprueba antes para decir qué lo impide, en vez del
   * mensaje genérico de la clave foránea. Sus sesiones se borran en cascada.
   */
  async remove(userId: string, actor: SessionUser): Promise<void> {
    if (userId === actor.userId) {
      throw new BadRequestException('No puedes eliminar tu propio usuario');
    }
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        role: true,
        isActive: true,
        _count: { select: HISTORY_SELECT },
      },
    });
    if (!user) throw new NotFoundException(NOT_FOUND);

    if (user.role === UserRole.ADMIN && user.isActive) {
      await this.assertAnotherActiveAdmin(userId);
    }
    const history = describeHistory(user._count);
    if (history) {
      throw new ConflictException(
        `No se puede eliminar: el usuario tiene ${history}. Puedes desactivarlo`,
      );
    }
    await this.prisma.user.delete({ where: { userId } });
  }

  /** Una temporal nueva, con lo que hay que guardar de ella. */
  private async temporaryAccess() {
    const temporaryPassword = generateTemporaryPassword();
    const expiresAt = temporaryPasswordExpiry(
      this.config.getOrThrow<number>('TEMPORARY_PASSWORD_DAYS'),
    );
    return {
      temporaryPassword,
      expiresAt,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      passwordExpiresAt: expiresAt,
    };
  }

  /**
   * Antes de que un administrador activo deje de serlo (por rol, baja o
   * borrado), tiene que quedar otro. Se cuentan solo los activos: uno dado de
   * baja no puede entrar a devolverle el rol a nadie.
   */
  private async assertAnotherActiveAdmin(userId: string): Promise<void> {
    const others = await this.prisma.user.count({
      where: { role: UserRole.ADMIN, isActive: true, NOT: { userId } },
    });
    if (!others) throw new ConflictException(LAST_ADMIN);
  }
}

export function usersWhere(
  query: Pick<ListUsersQueryDto, 'search' | 'role' | 'isActive'>,
): Prisma.UserWhereInput {
  return {
    role: query.role,
    isActive: query.isActive,
    ...(query.search && {
      OR: [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { documentNumber: { contains: query.search.replace(/[\s.-]/g, '') } },
      ],
    }),
  };
}

export function usersOrderBy(
  query: Pick<ListUsersQueryDto, 'sortBy' | 'sortOrder'>,
): Prisma.UserOrderByWithRelationInput {
  // Quien nunca entró va al final en los dos sentidos: Postgres pone los
  // vacíos primero al ordenar de forma descendente, y «los últimos en entrar»
  // empezaría por los que nunca entraron.
  if (query.sortBy === 'lastLoginAt') {
    return { lastLoginAt: { sort: query.sortOrder, nulls: 'last' } };
  }
  return { [query.sortBy]: query.sortOrder };
}

/** «2 órdenes asignadas y 1 pago recibido», o vacío si no tiene historial. */
export function describeHistory(counts: HistoryCounts): string {
  const parts = (
    Object.entries(HISTORY_LABELS) as [
      keyof HistoryCounts,
      readonly [string, string],
    ][]
  )
    .filter(([relation]) => counts[relation] > 0)
    .map(([relation, [one, many]]) => {
      const count = counts[relation];
      return `${count} ${count === 1 ? one : many}`;
    });
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`;
}

function translateDuplicate(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    // El índice único que chocó dice cuál de los dos se repite.
    const target = JSON.stringify(error.meta?.target ?? '');
    return new ConflictException(
      target.includes('document') ? DUPLICATE_DOCUMENT : DUPLICATE_EMAIL,
    );
  }
  return error;
}
