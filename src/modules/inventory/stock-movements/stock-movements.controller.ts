import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
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
import { CreateAdjustmentDto } from './dto/create-adjustment.dto.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import { ListStockMovementsQueryDto } from './dto/list-stock-movements-query.dto.js';
import { StockMovement } from './entities/stock-movement.entity.js';
import { StockMovementsService } from './stock-movements.service.js';

// El costo unitario sale solo para ADMIN. Registrar es solo suyo, así que su
// respuesta siempre lo lleva.
const costsFor = (user: SessionUser) => ({
  includeCosts: user.role === UserRole.ADMIN,
});
const WITH_COSTS = { includeCosts: true };

/**
 * El kardex: las entradas y salidas de cada producto. Los dos roles lo
 * consultan —el mecánico, sin costos—, pero solo el administrador registra
 * compras y ajustes. Los consumos en órdenes (WORK_ORDER) no se registran
 * aquí: los genera la orden de trabajo al agregarle un repuesto.
 *
 * No hay edición ni borrado: un movimiento es historial, y un error se
 * corrige con un ajuste que lo compense.
 */
@ApiTags('stock-movements')
@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly stockMovements: StockMovementsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiPaginatedResponse(StockMovement)
  @ApiBadRequestResponse({
    description: 'La fecha desde es posterior a la fecha hasta',
  })
  async findAll(
    @Query() query: ListStockMovementsQueryDto,
    @CurrentUser() user: SessionUser,
  ): Promise<BaseResponseDto<StockMovement[]>> {
    const { items, meta } = await this.stockMovements.findAll(query);
    return BaseResponseDto.success(
      items.map((movement) => new StockMovement(movement, costsFor(user))),
      'Movimientos obtenidos',
      HttpStatus.OK,
      { ...meta },
    );
  }

  @Get(':stockMovementId')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(StockMovement)
  @ApiNotFoundResponse({ description: 'No se encontró el movimiento' })
  async findOne(
    @Param('stockMovementId', ParseIdPipe) stockMovementId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<BaseResponseDto<StockMovement>> {
    return BaseResponseDto.success(
      new StockMovement(
        await this.stockMovements.findOne(stockMovementId),
        costsFor(user),
      ),
      'Movimiento obtenido',
    );
  }

  @Post('purchases')
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(StockMovement, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse({ description: 'El producto está inactivo' })
  @ApiNotFoundResponse({ description: 'No se encontró el producto' })
  async purchase(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() user: SessionUser,
  ): Promise<BaseResponseDto<StockMovement>> {
    return BaseResponseDto.success(
      new StockMovement(
        await this.stockMovements.purchase(dto, user.userId),
        WITH_COSTS,
      ),
      'Compra registrada',
      HttpStatus.CREATED,
    );
  }

  @Post('adjustments')
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(StockMovement, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse({ description: 'El producto está inactivo' })
  @ApiNotFoundResponse({ description: 'No se encontró el producto' })
  @ApiConflictResponse({
    description: 'Stock insuficiente para un ajuste que resta',
  })
  async adjust(
    @Body() dto: CreateAdjustmentDto,
    @CurrentUser() user: SessionUser,
  ): Promise<BaseResponseDto<StockMovement>> {
    return BaseResponseDto.success(
      new StockMovement(
        await this.stockMovements.adjust(dto, user.userId),
        WITH_COSTS,
      ),
      'Ajuste registrado',
      HttpStatus.CREATED,
    );
  }
}
