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
import { CreateProductDto } from './dto/create-product.dto.js';
import { ListProductsQueryDto } from './dto/list-products-query.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { Product } from './entities/product.entity.js';
import { ProductsService } from './products.service.js';

// El costo y el margen salen solo para ADMIN. Las modificaciones son solo
// suyas, así que su respuesta siempre los lleva.
const costsFor = (user: SessionUser) => ({
  includeCosts: user.role === UserRole.ADMIN,
});
const WITH_COSTS = { includeCosts: true };

/**
 * Los repuestos e insumos. Los consultan los dos roles —el mecánico revisa el
 * stock y agrega repuestos a sus órdenes—, pero solo el administrador los
 * modifica. Por eso el rol va en cada método y no en la clase. El mecánico
 * tampoco ve el costo ni el margen: la lectura los incluye según quién
 * pregunta.
 */
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiPaginatedResponse(Product)
  async findAll(
    @Query() query: ListProductsQueryDto,
    @CurrentUser() user: SessionUser,
  ): Promise<BaseResponseDto<Product[]>> {
    const { items, meta } = await this.products.findAll(query);
    return BaseResponseDto.success(
      items.map((product) => new Product(product, costsFor(user))),
      'Productos obtenidos',
      HttpStatus.OK,
      { ...meta },
    );
  }

  @Get(':productId')
  @Roles(UserRole.ADMIN, UserRole.MECHANIC)
  @ApiBaseResponse(Product)
  @ApiNotFoundResponse({ description: 'No se encontró el producto' })
  async findOne(
    @Param('productId', ParseIdPipe) productId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<BaseResponseDto<Product>> {
    return BaseResponseDto.success(
      new Product(await this.products.findOne(productId), costsFor(user)),
      'Producto obtenido',
    );
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(Product, { status: HttpStatus.CREATED })
  @ApiConflictResponse({ description: 'Ya existe un producto con ese código' })
  async create(
    @Body() dto: CreateProductDto,
  ): Promise<BaseResponseDto<Product>> {
    return BaseResponseDto.success(
      new Product(await this.products.create(dto), WITH_COSTS),
      'Producto registrado',
      HttpStatus.CREATED,
    );
  }

  @Patch(':productId')
  @Roles(UserRole.ADMIN)
  @ApiBaseResponse(Product)
  @ApiNotFoundResponse({ description: 'No se encontró el producto' })
  @ApiConflictResponse({ description: 'Ya existe un producto con ese código' })
  async update(
    @Param('productId', ParseIdPipe) productId: string,
    @Body() dto: UpdateProductDto,
  ): Promise<BaseResponseDto<Product>> {
    return BaseResponseDto.success(
      new Product(await this.products.update(productId, dto), WITH_COSTS),
      'Producto actualizado',
    );
  }

  @Delete(':productId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Producto eliminado' })
  @ApiNotFoundResponse({ description: 'No se encontró el producto' })
  @ApiConflictResponse({
    description: 'El producto tiene movimientos de stock o ítems de órdenes',
  })
  async remove(
    @Param('productId', ParseIdPipe) productId: string,
  ): Promise<BaseResponseDto<null>> {
    await this.products.remove(productId);
    return BaseResponseDto.success(null, 'Producto eliminado');
  }
}
