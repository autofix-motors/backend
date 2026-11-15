import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '../../../core/auth/session-user.js';
import { CurrentUser } from '../../../core/decorators/current-user.decorator.js';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { RolUsuario } from '../../../generated/prisma/enums.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { ApiBaseResponse } from '../../../shared/swagger/api-response.decorators.js';
import { DashboardService } from './dashboard.service.js';
import { Dashboard } from './entities/dashboard.entity.js';

/**
 * El panel de inicio del personal. El mecánico ve sus órdenes; el
 * administrador, todo el taller con los montos, la carga del equipo y el stock.
 */
@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Roles(RolUsuario.ADMINISTRADOR, RolUsuario.MECANICO)
  @ApiBaseResponse(Dashboard)
  async overview(
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<Dashboard>> {
    return BaseResponseDto.success(
      await this.dashboard.overview(actor),
      'Panel obtenido',
    );
  }
}
