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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SessionUser } from '../../../core/auth/session-user.js';
import { CurrentUser } from '../../../core/decorators/current-user.decorator.js';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { ParseIdPipe } from '../../../core/validation/parse-id.pipe.js';
import { ItemType, UserRole } from '../../../generated/prisma/enums.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
} from '../../../shared/swagger/api-response.decorators.js';
import { ChangeWorkOrderStatusDto } from './dto/change-work-order-status.dto.js';
import { CreateWorkOrderItemDto } from './dto/create-work-order-item.dto.js';
import { CreateWorkOrderNoteDto } from './dto/create-work-order-note.dto.js';
import { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto.js';
import { UpdateWorkOrderDiagnosisDto } from './dto/update-work-order-diagnosis.dto.js';
import { UpdateWorkOrderItemDto } from './dto/update-work-order-item.dto.js';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto.js';
import { WorkOrderDetail } from './entities/work-order-detail.entity.js';
import type { WorkOrderWithTimeline } from './entities/work-order-detail.entity.js';
import { WorkOrder } from './entities/work-order.entity.js';
import { WorkOrderItemsService } from './work-order-items.service.js';
import { WORK_ORDER_STATUS_LABELS } from './work-order-status.js';
import { WorkOrdersService } from './work-orders.service.js';

// Para un mecánico, una orden que no tiene asignada «no existe».
const NOT_FOUND_DESCRIPTION = 'No existe, o el mecánico no la tiene asignada';

/**
 * La orden completa que responde cada endpoint. El costo y el margen de los
 * repuestos salen solo para ADMIN.
 */
function detail(order: WorkOrderWithTimeline, actor: SessionUser) {
  return new WorkOrderDetail(order, {
    includeCosts: actor.role === UserRole.ADMIN,
  });
}

/**
 * Las órdenes de trabajo. El administrador las registra, las edita, las asigna
 * y las borra; el mecánico trabaja las suyas (diagnóstico, estado, notas,
 * servicios y repuestos).
 * Por eso el rol va en cada método y no en la clase.
 */
@ApiTags('work-orders')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly items: WorkOrderItemsService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiPaginatedResponse(WorkOrder)
  async findAll(
    @Query() query: ListWorkOrdersQueryDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrder[]>> {
    const { items, meta } = await this.workOrders.findAll(query, actor);
    return BaseResponseDto.success(
      items.map((order) => new WorkOrder(order)),
      'Órdenes de trabajo obtenidas',
      HttpStatus.OK,
      { ...meta },
    );
  }

  @Get(':workOrderId')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiNotFoundResponse({ description: NOT_FOUND_DESCRIPTION })
  async findOne(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(await this.workOrders.findOne(workOrderId, actor), actor),
      'Orden de trabajo obtenida',
    );
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(WorkOrderDetail, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse({
    description:
      'El dueño del vehículo o el mecánico están inactivos, o la fecha prometida ya pasó',
  })
  @ApiNotFoundResponse({
    description: 'No se encontró el vehículo o el usuario',
  })
  @ApiConflictResponse({
    description: 'El vehículo ya tiene una orden abierta',
  })
  async create(
    @Body() dto: CreateWorkOrderDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(await this.workOrders.create(dto, actor), actor),
      'Orden de trabajo registrada',
      HttpStatus.CREATED,
    );
  }

  @Patch(':workOrderId')
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiBadRequestResponse({
    description: 'El mecánico está inactivo, o la fecha prometida ya pasó',
  })
  @ApiNotFoundResponse({ description: 'No se encontró la orden o el usuario' })
  @ApiConflictResponse({ description: 'La orden ya se entregó o se canceló' })
  async update(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Body() dto: UpdateWorkOrderDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(await this.workOrders.update(workOrderId, dto, actor), actor),
      'Orden de trabajo actualizada',
    );
  }

  @Put(':workOrderId/diagnosis')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiNotFoundResponse({ description: NOT_FOUND_DESCRIPTION })
  @ApiConflictResponse({
    description: 'La orden no está en un estado en que se diagnostique',
  })
  async updateDiagnosis(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Body() dto: UpdateWorkOrderDiagnosisDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    const order = await this.workOrders.updateDiagnosis(
      workOrderId,
      dto,
      actor,
    );
    return BaseResponseDto.success(
      detail(order, actor),
      order.diagnosis ? 'Diagnóstico guardado' : 'Diagnóstico borrado',
    );
  }

  @Post(':workOrderId/status')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiBadRequestResponse({ description: 'Cancelar exige el motivo en la nota' })
  @ApiForbiddenResponse({
    description: 'El mecánico no entrega ni cancela órdenes',
  })
  @ApiNotFoundResponse({ description: NOT_FOUND_DESCRIPTION })
  @ApiConflictResponse({
    description:
      'Desde su estado actual la orden no puede pasar al pedido, o cambió mientras tanto',
  })
  async changeStatus(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Body() dto: ChangeWorkOrderStatusDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    const order = await this.workOrders.changeStatus(workOrderId, dto, actor);
    return BaseResponseDto.success(
      detail(order, actor),
      `Orden en «${WORK_ORDER_STATUS_LABELS[order.status]}»`,
    );
  }

  @Post(':workOrderId/notes')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(WorkOrderDetail, { status: HttpStatus.CREATED })
  @ApiNotFoundResponse({ description: NOT_FOUND_DESCRIPTION })
  async addNote(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Body() dto: CreateWorkOrderNoteDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(await this.workOrders.addNote(workOrderId, dto, actor), actor),
      dto.isPublic
        ? 'Nota agregada (la ve el cliente)'
        : 'Nota interna agregada',
      HttpStatus.CREATED,
    );
  }

  @Post(':workOrderId/items')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(WorkOrderDetail, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse({
    description:
      'El servicio o el repuesto está inactivo, o el ítem trae datos del otro tipo',
  })
  @ApiForbiddenResponse({
    description: 'El mecánico no fija el precio ni la descripción',
  })
  @ApiNotFoundResponse({
    description: `${NOT_FOUND_DESCRIPTION}; o no existe el servicio o el repuesto`,
  })
  @ApiConflictResponse({
    description:
      'La orden no está en un estado en que se cambien sus ítems, cambió mientras tanto, o no alcanza el stock',
  })
  async addItem(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Body() dto: CreateWorkOrderItemDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(await this.items.create(workOrderId, dto, actor), actor),
      dto.type === ItemType.PRODUCT ? 'Repuesto agregado' : 'Servicio agregado',
      HttpStatus.CREATED,
    );
  }

  @Patch(':workOrderId/items/:workOrderItemId')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiBadRequestResponse({
    description: 'La cantidad de un repuesto no se cambia',
  })
  @ApiForbiddenResponse({
    description: 'El mecánico no fija el precio ni la descripción',
  })
  @ApiNotFoundResponse({
    description: `${NOT_FOUND_DESCRIPTION}; o el ítem no es de esta orden`,
  })
  @ApiConflictResponse({
    description:
      'La orden no está en un estado en que se cambien sus ítems, o cambió mientras tanto',
  })
  async updateItem(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('workOrderItemId', ParseIdPipe) workOrderItemId: string,
    @Body() dto: UpdateWorkOrderItemDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(
        await this.items.update(workOrderId, workOrderItemId, dto, actor),
        actor,
      ),
      'Ítem actualizado',
    );
  }

  @Delete(':workOrderId/items/:workOrderItemId')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, {
    description: 'Ítem quitado; si es un repuesto, vuelve al stock',
  })
  @ApiNotFoundResponse({
    description: `${NOT_FOUND_DESCRIPTION}; o el ítem no es de esta orden`,
  })
  @ApiConflictResponse({
    description:
      'La orden no está en un estado en que se cambien sus ítems, o cambió mientras tanto',
  })
  async removeItem(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('workOrderItemId', ParseIdPipe) workOrderItemId: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<null>> {
    await this.items.remove(workOrderId, workOrderItemId, actor);
    return BaseResponseDto.success(null, 'Ítem quitado de la orden');
  }

  @Delete(':workOrderId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Orden de trabajo eliminada' })
  @ApiNotFoundResponse({ description: 'No se encontró la orden' })
  @ApiConflictResponse({
    description: 'La orden tiene ítems, presupuestos o pagos: se cancela',
  })
  async remove(
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
  ): Promise<BaseResponseDto<null>> {
    await this.workOrders.remove(workOrderId);
    return BaseResponseDto.success(null, 'Orden de trabajo eliminada');
  }
}
