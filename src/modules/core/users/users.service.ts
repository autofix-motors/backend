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
import { RolUsuario } from '../../../generated/prisma/enums.js';
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
  _count: { select: { ordenesAsignadas: true } },
} satisfies Prisma.UsuarioInclude;

/**
 * Todo lo que el usuario dejó registrado en los demás dominios, con cómo se
 * nombra en el mensaje del 409. Son las relaciones de `Usuario` con RESTRICT: si
 * alguna tiene filas, la base no deja borrarlo.
 */
const HISTORY_LABELS = {
  ordenesAsignadas: ['orden asignada', 'órdenes asignadas'],
  ordenesCreadas: ['orden registrada', 'órdenes registradas'],
  eventosOrden: [
    'nota o cambio de estado en una orden',
    'notas o cambios de estado en órdenes',
  ],
  presupuestosEnviados: ['presupuesto enviado', 'presupuestos enviados'],
  presupuestosDecididos: [
    'decisión de presupuesto',
    'decisiones de presupuesto',
  ],
  movimientosStock: ['movimiento de stock', 'movimientos de stock'],
} as const satisfies Partial<
  Record<keyof Prisma.UsuarioCountOutputType, readonly [string, string]>
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
  contrasenaTemporal: string;
  expiraEn: Date;
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
      this.prisma.usuario.findMany({
        where,
        include: WITH_COUNTS,
        // El desempate por id hace que la paginación sea estable: con dos
        // usuarios del mismo nombre, el orden no cambia entre páginas.
        orderBy: [usersOrderBy(query), { usuarioId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.usuario.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(usuarioId: string): Promise<UserWithCounts> {
    const user = await this.prisma.usuario.findUnique({
      where: { usuarioId },
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
  ): Promise<{ usuario: UserWithCounts } & TemporaryPasswordResult> {
    const { contrasenaTemporal, expiraEn, ...access } =
      await this.temporaryAccess();
    try {
      const user = await this.prisma.usuario.create({
        data: { ...data, ...access },
        include: WITH_COUNTS,
      });
      return { usuario: user, contrasenaTemporal, expiraEn };
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
    usuarioId: string,
    data: UpdateUserDto,
    actor: SessionUser,
  ): Promise<UserWithCounts> {
    const current = await this.findOne(usuarioId);
    const isRoleChange = data.rol !== undefined && data.rol !== current.rol;
    const isDeactivation = current.activo && data.activo === false;

    if (usuarioId === actor.usuarioId) {
      if (data.activo === false) {
        throw new BadRequestException('No puedes desactivar tu propio usuario');
      }
      if (isRoleChange) {
        throw new BadRequestException(
          'No puedes quitarte el rol de administrador',
        );
      }
    }
    if (
      current.rol === RolUsuario.ADMINISTRADOR &&
      current.activo &&
      (isRoleChange || isDeactivation)
    ) {
      await this.assertAnotherActiveAdmin(usuarioId);
    }

    let user: UserWithCounts;
    try {
      user = await this.prisma.usuario.update({
        where: { usuarioId },
        data,
        include: WITH_COUNTS,
      });
    } catch (error) {
      throw translateDuplicate(error);
    }
    // El rol viaja en el JWT: sin esto, con el refresco seguiría renovando un
    // token con el rol viejo. El que ya tiene vence en ACCESS_TOKEN_MINUTES.
    if (isRoleChange || isDeactivation) {
      await this.sessions.revokeAll({ usuarioId });
    }
    return user;
  }

  /**
   * Restablece la contraseña con una temporal nueva (no hay «olvidé mi
   * contraseña»: el taller no envía correos). Se cierran sus sesiones para que
   * quien tenga la anterior no siga dentro.
   */
  async issueTemporaryPassword(
    usuarioId: string,
  ): Promise<TemporaryPasswordResult> {
    await this.findOne(usuarioId);
    const { contrasenaTemporal, expiraEn, ...access } =
      await this.temporaryAccess();
    await this.prisma.usuario.update({ where: { usuarioId }, data: access });
    await this.sessions.revokeAll({ usuarioId });
    return { contrasenaTemporal, expiraEn };
  }

  /**
   * Borra el usuario de verdad, solo si no dejó nada registrado: lo que hizo
   * necesita su autor. Se comprueba antes para decir qué lo impide, en vez del
   * mensaje genérico de la clave foránea. Sus sesiones se borran en cascada.
   */
  async remove(usuarioId: string, actor: SessionUser): Promise<void> {
    if (usuarioId === actor.usuarioId) {
      throw new BadRequestException('No puedes eliminar tu propio usuario');
    }
    const user = await this.prisma.usuario.findUnique({
      where: { usuarioId },
      select: {
        rol: true,
        activo: true,
        _count: { select: HISTORY_SELECT },
      },
    });
    if (!user) throw new NotFoundException(NOT_FOUND);

    if (user.rol === RolUsuario.ADMINISTRADOR && user.activo) {
      await this.assertAnotherActiveAdmin(usuarioId);
    }
    const history = describeHistory(user._count);
    if (history) {
      throw new ConflictException(
        `No se puede eliminar: el usuario tiene ${history}. Puedes desactivarlo`,
      );
    }
    await this.prisma.usuario.delete({ where: { usuarioId } });
  }

  /** Una temporal nueva, con lo que hay que guardar de ella. */
  private async temporaryAccess() {
    const contrasenaTemporal = generateTemporaryPassword();
    const expiraEn = temporaryPasswordExpiry(
      this.config.getOrThrow<number>('TEMPORARY_PASSWORD_DAYS'),
    );
    return {
      contrasenaTemporal,
      expiraEn,
      hashContrasena: await hashPassword(contrasenaTemporal),
      debeCambiarContrasena: true,
      contrasenaExpiraEn: expiraEn,
    };
  }

  /**
   * Antes de que un administrador activo deje de serlo (por rol, baja o
   * borrado), tiene que quedar otro. Se cuentan solo los activos: uno dado de
   * baja no puede entrar a devolverle el rol a nadie.
   */
  private async assertAnotherActiveAdmin(usuarioId: string): Promise<void> {
    const others = await this.prisma.usuario.count({
      where: {
        rol: RolUsuario.ADMINISTRADOR,
        activo: true,
        NOT: { usuarioId },
      },
    });
    if (!others) throw new ConflictException(LAST_ADMIN);
  }
}

export function usersWhere(
  query: Pick<ListUsersQueryDto, 'search' | 'rol' | 'activo'>,
): Prisma.UsuarioWhereInput {
  return {
    rol: query.rol,
    activo: query.activo,
    ...(query.search && {
      OR: [
        { nombre: { contains: query.search, mode: 'insensitive' } },
        { correo: { contains: query.search, mode: 'insensitive' } },
        { numeroDocumento: { contains: query.search.replace(/[\s.-]/g, '') } },
      ],
    }),
  };
}

export function usersOrderBy(
  query: Pick<ListUsersQueryDto, 'ordenarPor' | 'sentido'>,
): Prisma.UsuarioOrderByWithRelationInput {
  // Quien nunca entró va al final en los dos sentidos: Postgres pone los
  // vacíos primero al ordenar de forma descendente, y «los últimos en entrar»
  // empezaría por los que nunca entraron.
  if (query.ordenarPor === 'ultimoIngresoEn') {
    return { ultimoIngresoEn: { sort: query.sentido, nulls: 'last' } };
  }
  return { [query.ordenarPor]: query.sentido };
}

/** «2 órdenes asignadas y 1 presupuesto enviado», o vacío si no tiene historial. */
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
    // El índice único que chocó dice cuál de los dos se repite («document»
    // calza con numeroDocumento y con la columna numero_documento).
    const target = JSON.stringify(error.meta?.target ?? '');
    return new ConflictException(
      target.includes('document') ? DUPLICATE_DOCUMENT : DUPLICATE_EMAIL,
    );
  }
  return error;
}
