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
import {
  TipoDetalle,
  EstadoPresupuesto,
  RolUsuario,
} from '../../../generated/prisma/enums.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
} from '../../../shared/swagger/api-response.decorators.js';
import { ChangeWorkOrderStatusDto } from './dto/change-work-order-status.dto.js';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { CreateWorkOrderItemDto } from './dto/create-work-order-item.dto.js';
import { CreateWorkOrderNoteDto } from './dto/create-work-order-note.dto.js';
import { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import { DecideQuoteDto } from './dto/decide-quote.dto.js';
import { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto.js';
import { UpdateWorkOrderDiagnosisDto } from './dto/update-work-order-diagnosis.dto.js';
import { UpdateWorkOrderItemDto } from './dto/update-work-order-item.dto.js';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto.js';
import { WorkOrderDetail } from './entities/work-order-detail.entity.js';
import type { WorkOrderWithTimeline } from './entities/work-order-detail.entity.js';
import { WorkOrder } from './entities/work-order.entity.js';
import { WorkOrderItemsService } from './work-order-items.service.js';
import { WorkOrderQuotesService } from './work-order-quotes.service.js';
import { WORK_ORDER_STATUS_LABELS } from './work-order-status.js';
import { WorkOrdersService } from './work-orders.service.js';

// Para un mecánico, una orden que no tiene asignada «no existe».
const NOT_FOUND_DESCRIPTION = 'No existe, o el mecánico no la tiene asignada';

/**
 * La orden completa que responde cada endpoint. El costo y el margen de los
 * repuestos salen solo para ADMINISTRADOR.
 */
function detail(order: WorkOrderWithTimeline, actor: SessionUser) {
  return new WorkOrderDetail(order, {
    incluirCostos: actor.rol === RolUsuario.ADMINISTRADOR,
  });
}

/**
 * Las órdenes de trabajo. El administrador las registra, las edita, las asigna
 * y las borra, y envía los presupuestos y registra la respuesta del cliente;
 * el mecánico trabaja las suyas (diagnóstico, estado, notas, servicios y
 * repuestos) y ve sus presupuestos.
 * Por eso el rol va en cada método y no en la clase.
 */
@ApiTags('work-orders')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly items: WorkOrderItemsService,
    private readonly quotes: WorkOrderQuotesService,
  ) {}

  @Get()
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MECANICO)
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
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MECANICO)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiNotFoundResponse({ description: NOT_FOUND_DESCRIPTION })
  async findOne(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(await this.workOrders.findOne(ordenTrabajoId, actor), actor),
      'Orden de trabajo obtenida',
    );
  }

  @Post()
  @Roles(RolUsuario.ADMINISTRADOR)
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
  @Roles(RolUsuario.ADMINISTRADOR)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiBadRequestResponse({
    description: 'El mecánico está inactivo, o la fecha prometida ya pasó',
  })
  @ApiNotFoundResponse({ description: 'No se encontró la orden o el usuario' })
  @ApiConflictResponse({ description: 'La orden ya se entregó o se canceló' })
  async update(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @Body() dto: UpdateWorkOrderDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(await this.workOrders.update(ordenTrabajoId, dto, actor), actor),
      'Orden de trabajo actualizada',
    );
  }

  @Put(':workOrderId/diagnosis')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MECANICO)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiNotFoundResponse({ description: NOT_FOUND_DESCRIPTION })
  @ApiConflictResponse({
    description: 'La orden no está en un estado en que se diagnostique',
  })
  async updateDiagnosis(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @Body() dto: UpdateWorkOrderDiagnosisDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    const order = await this.workOrders.updateDiagnosis(
      ordenTrabajoId,
      dto,
      actor,
    );
    return BaseResponseDto.success(
      detail(order, actor),
      order.diagnostico ? 'Diagnóstico guardado' : 'Diagnóstico borrado',
    );
  }

  @Post(':workOrderId/status')
  @HttpCode(HttpStatus.OK)
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MECANICO)
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
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @Body() dto: ChangeWorkOrderStatusDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    const order = await this.workOrders.changeStatus(
      ordenTrabajoId,
      dto,
      actor,
    );
    return BaseResponseDto.success(
      detail(order, actor),
      `Orden en «${WORK_ORDER_STATUS_LABELS[order.estado]}»`,
    );
  }

  @Post(':workOrderId/notes')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MECANICO)
  @ApiBaseResponse(WorkOrderDetail, { status: HttpStatus.CREATED })
  @ApiNotFoundResponse({ description: NOT_FOUND_DESCRIPTION })
  async addNote(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @Body() dto: CreateWorkOrderNoteDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(await this.workOrders.addNote(ordenTrabajoId, dto, actor), actor),
      dto.esPublico
        ? 'Nota agregada (la ve el cliente)'
        : 'Nota interna agregada',
      HttpStatus.CREATED,
    );
  }

  @Post(':workOrderId/items')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MECANICO)
  @ApiBaseResponse(WorkOrderDetail, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse({
    description:
      'El servicio o el repuesto está inactivo, o el detalle trae datos del otro tipo',
  })
  @ApiForbiddenResponse({
    description: 'El mecánico no fija el precio ni la descripción',
  })
  @ApiNotFoundResponse({
    description: `${NOT_FOUND_DESCRIPTION}; o no existe el servicio o el repuesto`,
  })
  @ApiConflictResponse({
    description:
      'La orden no está en un estado en que se cambien sus detalles, cambió mientras tanto, o no alcanza el stock',
  })
  async addItem(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @Body() dto: CreateWorkOrderItemDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(await this.items.create(ordenTrabajoId, dto, actor), actor),
      dto.tipo === TipoDetalle.PRODUCTO
        ? 'Repuesto agregado'
        : 'Servicio agregado',
      HttpStatus.CREATED,
    );
  }

  @Patch(':workOrderId/items/:workOrderItemId')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MECANICO)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiBadRequestResponse({
    description: 'La cantidad de un repuesto no se cambia',
  })
  @ApiForbiddenResponse({
    description: 'El mecánico no fija el precio ni la descripción',
  })
  @ApiNotFoundResponse({
    description: `${NOT_FOUND_DESCRIPTION}; o el detalle no es de esta orden`,
  })
  @ApiConflictResponse({
    description:
      'La orden no está en un estado en que se cambien sus detalles, o cambió mientras tanto',
  })
  async updateItem(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @Param('workOrderItemId', ParseIdPipe) detalleOrdenId: string,
    @Body() dto: UpdateWorkOrderItemDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    return BaseResponseDto.success(
      detail(
        await this.items.update(ordenTrabajoId, detalleOrdenId, dto, actor),
        actor,
      ),
      'Detalle actualizado',
    );
  }

  @Delete(':workOrderId/items/:workOrderItemId')
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MECANICO)
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, {
    description: 'Detalle quitado; si es un repuesto, vuelve al stock',
  })
  @ApiNotFoundResponse({
    description: `${NOT_FOUND_DESCRIPTION}; o el detalle no es de esta orden`,
  })
  @ApiConflictResponse({
    description:
      'La orden no está en un estado en que se cambien sus detalles, o cambió mientras tanto',
  })
  async removeItem(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @Param('workOrderItemId', ParseIdPipe) detalleOrdenId: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<null>> {
    await this.items.remove(ordenTrabajoId, detalleOrdenId, actor);
    return BaseResponseDto.success(null, 'Detalle quitado de la orden');
  }

  @Post(':workOrderId/quotes')
  @Roles(RolUsuario.ADMINISTRADOR)
  @ApiBaseResponse(WorkOrderDetail, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse({ description: 'La orden no tiene detalles' })
  @ApiNotFoundResponse({ description: 'No se encontró la orden' })
  @ApiConflictResponse({
    description:
      'La orden no está en diagnóstico, en reparación ni esperando repuestos, o cambió mientras tanto',
  })
  async sendQuote(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @Body() dto: CreateQuoteDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    const order = await this.quotes.send(ordenTrabajoId, dto, actor);
    return BaseResponseDto.success(
      detail(order, actor),
      `Presupuesto v${order.presupuestos[0].version} enviado: la orden espera la aprobación del cliente`,
      HttpStatus.CREATED,
    );
  }

  @Post(':workOrderId/quotes/:quoteId/decision')
  @HttpCode(HttpStatus.OK)
  @Roles(RolUsuario.ADMINISTRADOR)
  @ApiBaseResponse(WorkOrderDetail)
  @ApiNotFoundResponse({
    description: 'No se encontró la orden, o el presupuesto no es de ella',
  })
  @ApiConflictResponse({
    description:
      'El presupuesto ya se decidió o fue reemplazado, la orden no espera aprobación, o cambió mientras tanto',
  })
  async decideQuote(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
    @Param('quoteId', ParseIdPipe) presupuestoId: string,
    @Body() dto: DecideQuoteDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<WorkOrderDetail>> {
    const order = await this.quotes.decide(
      ordenTrabajoId,
      presupuestoId,
      dto,
      actor,
    );
    return BaseResponseDto.success(
      detail(order, actor),
      dto.decision === EstadoPresupuesto.APROBADO
        ? 'Presupuesto aprobado: la orden pasa a reparación'
        : 'Presupuesto rechazado: la orden vuelve a diagnóstico',
    );
  }

  @Delete(':workOrderId')
  @Roles(RolUsuario.ADMINISTRADOR)
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Orden de trabajo eliminada' })
  @ApiNotFoundResponse({ description: 'No se encontró la orden' })
  @ApiConflictResponse({
    description: 'La orden tiene detalles o presupuestos: se cancela',
  })
  async remove(
    @Param('workOrderId', ParseIdPipe) ordenTrabajoId: string,
  ): Promise<BaseResponseDto<null>> {
    await this.workOrders.remove(ordenTrabajoId);
    return BaseResponseDto.success(null, 'Orden de trabajo eliminada');
  }
}
