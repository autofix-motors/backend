import { Injectable } from '@nestjs/common';
import type { Page } from '../../../shared/pagination.js';
import { VehiclesService } from '../../customer/vehicles/vehicles.service.js';
import type { VehicleWithRelations } from '../../customer/vehicles/entities/vehicle.entity.js';
import type { WorkOrderWithTimeline } from '../work-orders/entities/work-order-detail.entity.js';
import { WorkOrderQuotesService } from '../work-orders/work-order-quotes.service.js';
import {
  WorkOrdersService,
  type WorkOrderWithPendingQuote,
} from '../work-orders/work-orders.service.js';
import type { DecidePortalQuoteDto } from './dto/decide-portal-quote.dto.js';
import type { ListPortalVehiclesQueryDto } from './dto/list-portal-vehicles-query.dto.js';
import type { ListPortalWorkOrdersQueryDto } from './dto/list-portal-work-orders-query.dto.js';

/**
 * Lo que el cliente hace en su portal. No tiene tablas propias: todo pasa por
 * los services dueños (invariante 3), siempre filtrado por el cliente de la
 * sesión, que llega del JWT y nunca del cuerpo de la petición.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly workOrders: WorkOrdersService,
    private readonly quotes: WorkOrderQuotesService,
  ) {}

  vehiclesOf(
    customerId: string,
    query: ListPortalVehiclesQueryDto,
  ): Promise<Page<VehicleWithRelations>> {
    return this.vehicles.findForCustomer(customerId, query);
  }

  vehicle(
    customerId: string,
    vehicleId: string,
  ): Promise<VehicleWithRelations> {
    return this.vehicles.findOneForCustomer(vehicleId, customerId);
  }

  workOrdersOf(
    customerId: string,
    query: ListPortalWorkOrdersQueryDto,
  ): Promise<Page<WorkOrderWithPendingQuote>> {
    return this.workOrders.findAllForCustomer(customerId, {
      open: query.state === 'OPEN',
      vehicleId: query.vehicleId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  workOrder(
    customerId: string,
    workOrderId: string,
  ): Promise<WorkOrderWithTimeline> {
    return this.workOrders.findOneForCustomer(workOrderId, customerId);
  }

  decide(
    customerId: string,
    workOrderId: string,
    quoteId: string,
    dto: DecidePortalQuoteDto,
  ): Promise<WorkOrderWithTimeline> {
    return this.quotes.decideByCustomer(workOrderId, quoteId, dto, customerId);
  }
}
