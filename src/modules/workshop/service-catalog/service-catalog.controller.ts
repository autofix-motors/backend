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
import { CreateServiceCatalogItemDto } from './dto/create-service-catalog-item.dto.js';
import { ListServiceCatalogQueryDto } from './dto/list-service-catalog-query.dto.js';
import { UpdateServiceCatalogItemDto } from './dto/update-service-catalog-item.dto.js';
import { ServiceCatalogItem } from './entities/service-catalog-item.entity.js';
import { ServiceCatalogService } from './service-catalog.service.js';

/**
 * El catálogo de servicios del taller. Lo consultan los dos roles —el mecánico
 * agrega servicios a sus órdenes—, pero solo el administrador lo modifica. Por
 * eso el rol va en cada método y no en la clase.
 */
@ApiTags('service-catalog')
@Controller('service-catalog')
export class ServiceCatalogController {
  constructor(private readonly serviceCatalog: ServiceCatalogService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiPaginatedResponse(ServiceCatalogItem)
  @ApiBadRequestResponse({
    description: 'El precio mínimo es mayor que el máximo',
  })
  async findAll(
    @Query() query: ListServiceCatalogQueryDto,
  ): Promise<BaseResponseDto<ServiceCatalogItem[]>> {
    const { items, meta } = await this.serviceCatalog.findAll(query);
    return BaseResponseDto.success(
      items.map((item) => new ServiceCatalogItem(item)),
      'Servicios obtenidos',
      HttpStatus.OK,
      { ...meta },
    );
  }

  @Get(':serviceCatalogItemId')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(ServiceCatalogItem)
  @ApiNotFoundResponse({ description: 'No se encontró el servicio' })
  async findOne(
    @Param('serviceCatalogItemId', ParseIdPipe) serviceCatalogItemId: string,
  ): Promise<BaseResponseDto<ServiceCatalogItem>> {
    return BaseResponseDto.success(
      new ServiceCatalogItem(
        await this.serviceCatalog.findOne(serviceCatalogItemId),
      ),
      'Servicio obtenido',
    );
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(ServiceCatalogItem, { status: HttpStatus.CREATED })
  @ApiConflictResponse({ description: 'Ya existe un servicio con ese nombre' })
  async create(
    @Body() dto: CreateServiceCatalogItemDto,
  ): Promise<BaseResponseDto<ServiceCatalogItem>> {
    return BaseResponseDto.success(
      new ServiceCatalogItem(await this.serviceCatalog.create(dto)),
      'Servicio registrado',
      HttpStatus.CREATED,
    );
  }

  @Patch(':serviceCatalogItemId')
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(ServiceCatalogItem)
  @ApiNotFoundResponse({ description: 'No se encontró el servicio' })
  @ApiConflictResponse({ description: 'Ya existe un servicio con ese nombre' })
  async update(
    @Param('serviceCatalogItemId', ParseIdPipe) serviceCatalogItemId: string,
    @Body() dto: UpdateServiceCatalogItemDto,
  ): Promise<BaseResponseDto<ServiceCatalogItem>> {
    return BaseResponseDto.success(
      new ServiceCatalogItem(
        await this.serviceCatalog.update(serviceCatalogItemId, dto),
      ),
      'Servicio actualizado',
    );
  }

  @Delete(':serviceCatalogItemId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Servicio eliminado' })
  @ApiNotFoundResponse({ description: 'No se encontró el servicio' })
  @ApiConflictResponse({
    description: 'El servicio ya se usó en órdenes de trabajo',
  })
  async remove(
    @Param('serviceCatalogItemId', ParseIdPipe) serviceCatalogItemId: string,
  ): Promise<BaseResponseDto<null>> {
    await this.serviceCatalog.remove(serviceCatalogItemId);
    return BaseResponseDto.success(null, 'Servicio eliminado');
  }
}
