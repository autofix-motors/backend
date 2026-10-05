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
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';
import { ListVehiclesQueryDto } from './dto/list-vehicles-query.dto.js';
import { UpdateVehicleDto } from './dto/update-vehicle.dto.js';
import { VehicleBrand } from './entities/vehicle-brand.entity.js';
import { Vehicle } from './entities/vehicle.entity.js';
import { VehiclesService } from './vehicles.service.js';

/** Los vehículos de los clientes. Solo el administrador los gestiona. */
@ApiTags('vehicles')
@Roles(UserRole.ADMIN)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @ApiPaginatedResponse(Vehicle)
  async findAll(
    @Query() query: ListVehiclesQueryDto,
  ): Promise<BaseResponseDto<Vehicle[]>> {
    const { items, meta } = await this.vehicles.findAll(query);
    return BaseResponseDto.success(
      items.map((vehicle) => new Vehicle(vehicle)),
      'Vehículos obtenidos',
      HttpStatus.OK,
      { ...meta },
    );
  }

  // Va antes de `:vehicleId`: si no, «brands» se tomaría como un id.
  @Get('brands')
  @ApiBaseResponse(VehicleBrand, { isArray: true })
  async brands(): Promise<BaseResponseDto<VehicleBrand[]>> {
    const brands = await this.vehicles.brands();
    return BaseResponseDto.success(
      brands.map((brand) => new VehicleBrand(brand)),
      'Marcas obtenidas',
    );
  }

  @Get(':vehicleId')
  @ApiBaseResponse(Vehicle)
  @ApiNotFoundResponse({ description: 'No se encontró el vehículo' })
  async findOne(
    @Param('vehicleId', ParseIdPipe) vehicleId: string,
  ): Promise<BaseResponseDto<Vehicle>> {
    return BaseResponseDto.success(
      new Vehicle(await this.vehicles.findOne(vehicleId)),
      'Vehículo obtenido',
    );
  }

  @Post()
  @ApiBaseResponse(Vehicle, { status: HttpStatus.CREATED })
  @ApiBadRequestResponse({ description: 'El cliente está inactivo' })
  @ApiNotFoundResponse({ description: 'No se encontró el cliente' })
  @ApiConflictResponse({
    description: 'Ya existe un vehículo con esa placa o ese VIN',
  })
  async create(
    @Body() dto: CreateVehicleDto,
  ): Promise<BaseResponseDto<Vehicle>> {
    return BaseResponseDto.success(
      new Vehicle(await this.vehicles.create(dto)),
      'Vehículo registrado',
      HttpStatus.CREATED,
    );
  }

  @Patch(':vehicleId')
  @ApiBaseResponse(Vehicle)
  @ApiBadRequestResponse({ description: 'El cliente nuevo está inactivo' })
  @ApiNotFoundResponse({
    description: 'No se encontró el vehículo o el cliente',
  })
  @ApiConflictResponse({
    description: 'Ya existe un vehículo con esa placa o ese VIN',
  })
  async update(
    @Param('vehicleId', ParseIdPipe) vehicleId: string,
    @Body() dto: UpdateVehicleDto,
  ): Promise<BaseResponseDto<Vehicle>> {
    return BaseResponseDto.success(
      new Vehicle(await this.vehicles.update(vehicleId, dto)),
      'Vehículo actualizado',
    );
  }

  @Delete(':vehicleId')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Vehículo eliminado' })
  @ApiNotFoundResponse({ description: 'No se encontró el vehículo' })
  @ApiConflictResponse({
    description: 'El vehículo tiene órdenes de trabajo registradas',
  })
  async remove(
    @Param('vehicleId', ParseIdPipe) vehicleId: string,
  ): Promise<BaseResponseDto<null>> {
    await this.vehicles.remove(vehicleId);
    return BaseResponseDto.success(null, 'Vehículo eliminado');
  }
}
