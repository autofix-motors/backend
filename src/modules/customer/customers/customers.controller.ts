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
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { Customer } from './entities/customer.entity.js';

/** Los clientes del taller. Solo el administrador los gestiona. */
@ApiTags('customers')
@Roles(UserRole.ADMIN)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiPaginatedResponse(Customer)
  async findAll(
    @Query() query: ListCustomersQueryDto,
  ): Promise<BaseResponseDto<Customer[]>> {
    const { items, meta } = await this.customers.findAll(query);
    return BaseResponseDto.success(
      items.map((customer) => new Customer(customer)),
      'Clientes obtenidos',
      HttpStatus.OK,
      { ...meta },
    );
  }

  @Get(':customerId')
  @ApiBaseResponse(Customer)
  @ApiNotFoundResponse({ description: 'No se encontró el cliente' })
  async findOne(
    @Param('customerId', ParseIdPipe) customerId: string,
  ): Promise<BaseResponseDto<Customer>> {
    return BaseResponseDto.success(
      new Customer(await this.customers.findOne(customerId)),
      'Cliente obtenido',
    );
  }

  @Post()
  @ApiBaseResponse(Customer, { status: HttpStatus.CREATED })
  @ApiConflictResponse({
    description: 'Ya existe un cliente con ese documento',
  })
  async create(
    @Body() dto: CreateCustomerDto,
  ): Promise<BaseResponseDto<Customer>> {
    return BaseResponseDto.success(
      new Customer(await this.customers.create(dto)),
      'Cliente registrado',
      HttpStatus.CREATED,
    );
  }

  @Patch(':customerId')
  @ApiBaseResponse(Customer)
  @ApiNotFoundResponse({ description: 'No se encontró el cliente' })
  @ApiConflictResponse({
    description: 'Ya existe un cliente con ese documento',
  })
  async update(
    @Param('customerId', ParseIdPipe) customerId: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<BaseResponseDto<Customer>> {
    return BaseResponseDto.success(
      new Customer(await this.customers.update(customerId, dto)),
      'Cliente actualizado',
    );
  }

  @Delete(':customerId')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Cliente eliminado' })
  @ApiNotFoundResponse({ description: 'No se encontró el cliente' })
  @ApiConflictResponse({
    description: 'El cliente tiene vehículos u órdenes registradas',
  })
  async remove(
    @Param('customerId', ParseIdPipe) customerId: string,
  ): Promise<BaseResponseDto<null>> {
    await this.customers.remove(customerId);
    return BaseResponseDto.success(null, 'Cliente eliminado');
  }
}
