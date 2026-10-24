import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { ParseIdPipe } from '../../../core/validation/parse-id.pipe.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
} from '../../../shared/swagger/api-response.decorators.js';
import { AssignToolDto } from './dto/assign-tool.dto.js';
import { CreateToolDto } from './dto/create-tool.dto.js';
import { ListToolsQueryDto } from './dto/list-tools-query.dto.js';
import { UpdateToolDto } from './dto/update-tool.dto.js';
import { Tool } from './entities/tool.entity.js';
import { ToolsService } from './tools.service.js';

const NOT_ASSIGNABLE_DESCRIPTION =
  'La herramienta no está operativa, o el usuario está inactivo';

/**
 * Las herramientas del taller. Las consultan los dos roles —el mecánico mira
 * qué hay y quién tiene qué—, pero solo el administrador las registra, las
 * entrega y las da de baja. Por eso el rol va en cada método y no en la clase.
 */
@ApiTags('tools')
@Controller('tools')
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiPaginatedResponse(Tool)
  async findAll(
    @Query() query: ListToolsQueryDto,
  ): Promise<BaseResponseDto<Tool[]>> {
    const { items, meta } = await this.tools.findAll(query);
    return BaseResponseDto.success(
      items.map((tool) => new Tool(tool)),
      'Herramientas obtenidas',
      HttpStatus.OK,
      { ...meta },
    );
  }

  @Get(':toolId')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(Tool)
  @ApiNotFoundResponse({ description: 'No se encontró la herramienta' })
  async findOne(
    @Param('toolId', ParseIdPipe) toolId: string,
  ): Promise<BaseResponseDto<Tool>> {
    return BaseResponseDto.success(
      new Tool(await this.tools.findOne(toolId)),
      'Herramienta obtenida',
    );
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(Tool, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse({ description: NOT_ASSIGNABLE_DESCRIPTION })
  @ApiNotFoundResponse({ description: 'No se encontró el usuario' })
  @ApiConflictResponse({
    description: 'Ya existe una herramienta con ese código',
  })
  async create(@Body() dto: CreateToolDto): Promise<BaseResponseDto<Tool>> {
    return BaseResponseDto.success(
      new Tool(await this.tools.create(dto)),
      'Herramienta registrada',
      HttpStatus.CREATED,
    );
  }

  @Patch(':toolId')
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(Tool)
  @ApiBadRequestResponse({ description: NOT_ASSIGNABLE_DESCRIPTION })
  @ApiNotFoundResponse({
    description: 'No se encontró la herramienta o el usuario',
  })
  @ApiConflictResponse({
    description: 'Ya existe una herramienta con ese código',
  })
  async update(
    @Param('toolId', ParseIdPipe) toolId: string,
    @Body() dto: UpdateToolDto,
  ): Promise<BaseResponseDto<Tool>> {
    return BaseResponseDto.success(
      new Tool(await this.tools.update(toolId, dto)),
      'Herramienta actualizada',
    );
  }

  /**
   * La acción rápida del listado: entregarla o devolverla sin abrir el
   * formulario, con un mensaje que dice qué pasó.
   */
  @Put(':toolId/assignment')
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(Tool)
  @ApiBadRequestResponse({ description: NOT_ASSIGNABLE_DESCRIPTION })
  @ApiNotFoundResponse({
    description: 'No se encontró la herramienta o el usuario',
  })
  async assign(
    @Param('toolId', ParseIdPipe) toolId: string,
    @Body() dto: AssignToolDto,
  ): Promise<BaseResponseDto<Tool>> {
    const tool = await this.tools.assign(toolId, dto.assignedToId);
    return BaseResponseDto.success(
      new Tool(tool),
      tool.assignedTo
        ? `Herramienta asignada a ${tool.assignedTo.name}`
        : 'Herramienta devuelta al almacén',
    );
  }

  @Delete(':toolId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Herramienta eliminada' })
  @ApiNotFoundResponse({ description: 'No se encontró la herramienta' })
  @ApiConflictResponse({
    description: 'Alguien la tiene: primero se devuelve al almacén',
  })
  async remove(
    @Param('toolId', ParseIdPipe) toolId: string,
  ): Promise<BaseResponseDto<null>> {
    await this.tools.remove(toolId);
    return BaseResponseDto.success(null, 'Herramienta eliminada');
  }
}
