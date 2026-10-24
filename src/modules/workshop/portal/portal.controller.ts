import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SessionCustomer } from '../../../core/auth/session-user.js';
import { CurrentCustomer } from '../../../core/decorators/current-customer.decorator.js';
import { CustomerOnly } from '../../../core/decorators/customer-only.decorator.js';
import { ParseIdPipe } from '../../../core/validation/parse-id.pipe.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
} from '../../../shared/swagger/api-response.decorators.js';
import { DecidePortalQuoteDto } from './dto/decide-portal-quote.dto.js';
import { ListPortalVehiclesQueryDto } from './dto/list-portal-vehicles-query.dto.js';
import { ListPortalWorkOrdersQueryDto } from './dto/list-portal-work-orders-query.dto.js';
import { PortalVehicle } from './entities/portal-vehicle.entity.js';
import { PortalWorkOrderDetail } from './entities/portal-work-order-detail.entity.js';
import { PortalWorkOrder } from './entities/portal-work-order.entity.js';
import { PortalService } from './portal.service.js';

/**
 * El portal del cliente: sus vehículos, sus órdenes y su respuesta a los
 * presupuestos. Solo para una sesión de cliente: el personal recibe 403.
 */
@ApiTags('portal')
@CustomerOnly()
@ApiForbiddenResponse({ description: 'La sesión no es de un cliente' })
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('vehicles')
  @ApiPaginatedResponse(PortalVehicle)
  async vehicles(
    @CurrentCustomer() customer: SessionCustomer,
    @Query() query: ListPortalVehiclesQueryDto,
  ): Promise<BaseResponseDto<PortalVehicle[]>> {
    const { items, meta } = await this.portal.vehiclesOf(
      customer.customerId,
      query,
    );
    return BaseResponseDto.success(
      items.map((vehicle) => new PortalVehicle(vehicle)),
      'Vehículos obtenidos',
      HttpStatus.OK,
      { ...meta },
    );
  }

  @Get('vehicles/:vehicleId')
  @ApiBaseResponse(PortalVehicle)
  @ApiNotFoundResponse({ description: 'No es un vehículo del cliente' })
  async vehicle(
    @CurrentCustomer() customer: SessionCustomer,
    @Param('vehicleId', ParseIdPipe) vehicleId: string,
  ): Promise<BaseResponseDto<PortalVehicle>> {
    return BaseResponseDto.success(
      new PortalVehicle(
        await this.portal.vehicle(customer.customerId, vehicleId),
      ),
      'Vehículo obtenido',
    );
  }

  @Get('work-orders')
  @ApiPaginatedResponse(PortalWorkOrder)
  async workOrders(
    @CurrentCustomer() customer: SessionCustomer,
    @Query() query: ListPortalWorkOrdersQueryDto,
  ): Promise<BaseResponseDto<PortalWorkOrder[]>> {
    const { items, meta } = await this.portal.workOrdersOf(
      customer.customerId,
      query,
    );
    return BaseResponseDto.success(
      items.map((order) => new PortalWorkOrder(order)),
      'Órdenes obtenidas',
      HttpStatus.OK,
      { ...meta },
    );
  }

  @Get('work-orders/:workOrderId')
  @ApiBaseResponse(PortalWorkOrderDetail)
  @ApiNotFoundResponse({ description: 'No es una orden del cliente' })
  async workOrder(
    @CurrentCustomer() customer: SessionCustomer,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
  ): Promise<BaseResponseDto<PortalWorkOrderDetail>> {
    return BaseResponseDto.success(
      new PortalWorkOrderDetail(
        await this.portal.workOrder(customer.customerId, workOrderId),
      ),
      'Orden obtenida',
    );
  }

  @Post('work-orders/:workOrderId/quotes/:quoteId/decision')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(PortalWorkOrderDetail)
  @ApiNotFoundResponse({
    description: 'No es una orden o un presupuesto del cliente',
  })
  @ApiConflictResponse({
    description:
      'El presupuesto ya tiene respuesta, la orden ya no espera aprobación o cambió mientras tanto',
  })
  async decide(
    @CurrentCustomer() customer: SessionCustomer,
    @Param('workOrderId', ParseIdPipe) workOrderId: string,
    @Param('quoteId', ParseIdPipe) quoteId: string,
    @Body() dto: DecidePortalQuoteDto,
  ): Promise<BaseResponseDto<PortalWorkOrderDetail>> {
    const order = await this.portal.decide(
      customer.customerId,
      workOrderId,
      quoteId,
      dto,
    );
    return BaseResponseDto.success(
      new PortalWorkOrderDetail(order),
      dto.decision === 'APPROVED'
        ? 'Presupuesto aprobado: el taller continúa con la reparación'
        : 'Presupuesto rechazado: el taller se comunicará contigo',
    );
  }
}
