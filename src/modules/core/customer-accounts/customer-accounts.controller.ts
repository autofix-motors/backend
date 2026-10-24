import {
  Controller,
  Delete,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../../core/decorators/roles.decorator.js';
import { ParseIdPipe } from '../../../core/validation/parse-id.pipe.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import { BaseResponseDto } from '../../../shared/dto/base-response.dto.js';
import { ApiBaseResponse } from '../../../shared/swagger/api-response.decorators.js';
import { CustomerAccountsService } from './customer-accounts.service.js';
import { PortalCredentials } from './entities/portal-credentials.entity.js';

/**
 * El acceso de un cliente a su portal: habilitarlo, restablecer su contraseña
 * y quitarlo. Solo el administrador.
 */
@ApiTags('customer-accounts')
@Roles(UserRole.ADMIN)
@Controller('customer-accounts')
export class CustomerAccountsController {
  constructor(private readonly accounts: CustomerAccountsService) {}

  @Post(':customerId/temporary-password')
  @HttpCode(HttpStatus.OK)
  // La contraseña viaja una sola vez: que ningún intermediario la guarde.
  @Header('Cache-Control', 'no-store')
  @ApiBaseResponse(PortalCredentials)
  @ApiBadRequestResponse({ description: 'El cliente está inactivo' })
  @ApiNotFoundResponse({ description: 'No se encontró el cliente' })
  async issueTemporaryPassword(
    @Param('customerId', ParseIdPipe) customerId: string,
  ): Promise<BaseResponseDto<PortalCredentials>> {
    return BaseResponseDto.success(
      new PortalCredentials(
        await this.accounts.issueTemporaryPassword(customerId),
      ),
      'Contraseña temporal generada: compártela con el cliente',
    );
  }

  @Delete(':customerId')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Acceso al portal quitado' })
  @ApiNotFoundResponse({ description: 'El cliente no tiene acceso al portal' })
  async remove(
    @Param('customerId', ParseIdPipe) customerId: string,
  ): Promise<BaseResponseDto<null>> {
    await this.accounts.remove(customerId);
    return BaseResponseDto.success(null, 'Acceso al portal quitado');
  }
}
