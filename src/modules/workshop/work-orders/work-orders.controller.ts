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
import { UserRole } from '../../../generated/prisma/enums.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
} from '../../../shared/swagger/api-response.decorators.js';
import { ChangeWorkOrderStatusDto } from './dto/change-work-order-status.dto.js';
import { CreateWorkOrderNoteDto } from './dto/create-work-order-note.dto.js';
import { CreateWorkOrderDto } from './dto/create-work-order.dto.js';
import { ListWorkOrdersQueryDto } from './dto/list-work-orders-query.dto.js';
import { UpdateWorkOrderDiagnosisDto } from './dto/update-work-order-diagnosis.dto.js';
import { UpdateWorkOrderDto } from './dto/update-work-order.dto.js';
import { WorkOrderDetail } from './entities/work-order-detail.entity.js';
import { WorkOrder } from './entities/work-order.entity.js';
import { WORK_ORDER_STATUS_LABELS } from './work-order-status.js';
import { WorkOrdersService } from './work-orders.service.js';

// Para un mecánico, una orden que no tiene asignada «no existe».
const NOT_FOUND_DESCRIPTION = 'No existe, o el mecánico no la tiene asignada';

/**
 * Las órdenes de trabajo. El administrador las registra, las edita, las asigna
 * y las borra; el mecánico trabaja las suyas (diagnóstico, estado y notas).
 * Por eso el rol va en cada método y no en la clase.
 */
@ApiTags('work-orders')
@Controller('work-orders')
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

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
      new WorkOrderDetail(await this.workOrders.findOne(workOrderId, actor)),
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
      new WorkOrderDetail(await this.workOrders.create(dto, actor)),
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
      new WorkOrderDetail(
        await this.workOrders.update(workOrderId, dto, actor),
      ),
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
      new WorkOrderDetail(order),
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
      new WorkOrderDetail(order),
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
      new WorkOrderDetail(
        await this.workOrders.addNote(workOrderId, dto, actor),
      ),
      dto.isPublic
        ? 'Nota agregada (la ve el cliente)'
        : 'Nota interna agregada',
      HttpStatus.CREATED,
    );
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
