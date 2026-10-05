import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { ToolStatus } from '../../../generated/prisma/enums.js';
import {
  pageWindow,
  paginationMeta,
  type Page,
} from '../../../shared/pagination.js';
import { UsersService } from '../../core/users/users.service.js';
import type { CreateToolDto } from './dto/create-tool.dto.js';
import type { ListToolsQueryDto } from './dto/list-tools-query.dto.js';
import type { UpdateToolDto } from './dto/update-tool.dto.js';
import type { ToolWithAssignee } from './entities/tool.entity.js';

// Quién la tiene se lee por la relación de la propia herramienta: es leer el
// modelo de este módulo, no consultar la tabla de usuarios por su cuenta.
const WITH_ASSIGNEE = {
  assignedTo: { select: { userId: true, name: true } },
} satisfies Prisma.ToolInclude;

const NOT_FOUND = 'No se encontró la herramienta';
const DUPLICATE = 'Ya existe una herramienta con ese código';
const INACTIVE_USER =
  'El usuario está inactivo: no se le pueden asignar herramientas';

/** Por qué una herramienta con ese estado no se puede asignar. */
const NOT_ASSIGNABLE: Record<
  Exclude<ToolStatus, typeof ToolStatus.AVAILABLE>,
  string
> = {
  IN_REPAIR:
    'Una herramienta en reparación no se puede asignar: márcala como operativa cuando vuelva',
  RETIRED: 'Una herramienta de baja no se puede asignar',
};

@Injectable()
export class ToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async findAll(query: ListToolsQueryDto): Promise<Page<ToolWithAssignee>> {
    const where = toolsWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tool.findMany({
        where,
        include: WITH_ASSIGNEE,
        // El desempate por id hace que la paginación sea estable: con varias
        // herramientas del mismo nombre o estado, el orden no cambia entre
        // páginas.
        orderBy: [{ [query.sortBy]: query.sortOrder }, { toolId: 'asc' }],
        ...pageWindow(query.page, query.pageSize),
      }),
      this.prisma.tool.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.pageSize, total) };
  }

  async findOne(toolId: string): Promise<ToolWithAssignee> {
    const tool = await this.prisma.tool.findUnique({
      where: { toolId },
      include: WITH_ASSIGNEE,
    });
    if (!tool) throw new NotFoundException(NOT_FOUND);
    return tool;
  }

  // El código llega del DTO ya en mayúsculas, así que el índice único de la
  // base basta para impedir el repetido; su P2002 se traduce a un 409 propio.
  async create(dto: CreateToolDto): Promise<ToolWithAssignee> {
    const assignedToId = await this.resolveAssignee(
      dto.status ?? ToolStatus.AVAILABLE,
      dto.assignedToId,
      null,
    );
    try {
      return await this.prisma.tool.create({
        data: { ...dto, assignedToId },
        include: WITH_ASSIGNEE,
      });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  async update(toolId: string, dto: UpdateToolDto): Promise<ToolWithAssignee> {
    const current = await this.findOne(toolId);
    const assignedToId = await this.resolveAssignee(
      dto.status ?? current.status,
      dto.assignedToId,
      current.assignedToId,
    );
    try {
      return await this.prisma.tool.update({
        where: { toolId },
        data: { ...dto, assignedToId },
        include: WITH_ASSIGNEE,
      });
    } catch (error) {
      throw translateDuplicate(error);
    }
  }

  /** Entregarla a alguien (`assignedToId`) o devolverla al almacén (`null`). */
  assign(
    toolId: string,
    assignedToId: string | null,
  ): Promise<ToolWithAssignee> {
    return this.update(toolId, { assignedToId });
  }

  /**
   * Borra la herramienta de verdad: nada en el schema la referencia. Pero si
   * alguien la tiene, borrarla perdería el rastro de una herramienta que
   * físicamente sigue en manos de un mecánico; primero se devuelve.
   */
  async remove(toolId: string): Promise<void> {
    const tool = await this.prisma.tool.findUnique({
      where: { toolId },
      select: { assignedTo: { select: { name: true } } },
    });
    if (!tool) throw new NotFoundException(NOT_FOUND);
    if (tool.assignedTo) {
      throw new ConflictException(
        `No se puede eliminar: la tiene ${tool.assignedTo.name}. Primero devuélvela al almacén`,
      );
    }
    await this.prisma.tool.delete({ where: { toolId } });
  }

  /**
   * A quién queda asignada la herramienta, según el estado con que queda y lo
   * que pide el cuerpo (`requested`: `undefined` es «no lo toca»).
   *
   * - **Solo una herramienta operativa está asignada.** Si queda en reparación
   *   o de baja, vuelve sola al almacén (quien la manda a reparar o la da de
   *   baja ya la recibió); pedir además que quede asignada es un 400.
   * - **Solo se asigna a un usuario activo**, que se verifica con
   *   `UsersService` (este módulo no lee la tabla de usuarios). Si no cambia
   *   quién la tiene, no se vuelve a verificar: editar el nombre de una
   *   herramienta no puede fallar porque su mecánico se desactivó después.
   */
  private async resolveAssignee(
    status: ToolStatus,
    requested: string | null | undefined,
    current: string | null,
  ): Promise<string | null> {
    if (status !== ToolStatus.AVAILABLE) {
      if (requested) throw new BadRequestException(NOT_ASSIGNABLE[status]);
      return null;
    }
    if (requested === undefined || requested === current) return current;
    if (requested === null) return null;

    const user = await this.users.findOne(requested);
    if (!user.isActive) throw new BadRequestException(INACTIVE_USER);
    return requested;
  }
}

/** El `where` del listado. */
export function toolsWhere(
  query: Pick<
    ListToolsQueryDto,
    'search' | 'status' | 'assignedToId' | 'isAssigned'
  >,
): Prisma.ToolWhereInput {
  const text = { contains: query.search, mode: 'insensitive' } as const;
  return {
    status: query.status,
    assignedToId: query.assignedToId,
    // En un AND aparte para no pisar `assignedToId`: los dos filtros se
    // combinan (un usuario y «en el almacén» no devuelve nada, como debe).
    ...(query.isAssigned !== undefined && {
      AND: [{ assignedToId: query.isAssigned ? { not: null } : null }],
    }),
    ...(query.search && {
      OR: [{ code: text }, { name: text }, { brand: text }],
    }),
  };
}

function translateDuplicate(error: unknown): unknown {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return new ConflictException(DUPLICATE);
  }
  return error;
}
