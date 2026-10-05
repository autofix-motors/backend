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
import { ChangeUserPasswordDto } from './dto/change-user-password.dto.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { User } from './entities/user.entity.js';
import { UsersService } from './users.service.js';

/** El personal del taller: quienes inician sesión. Solo el administrador. */
@ApiTags('users')
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiPaginatedResponse(User)
  async findAll(
    @Query() query: ListUsersQueryDto,
  ): Promise<BaseResponseDto<User[]>> {
    const { items, meta } = await this.users.findAll(query);
    return BaseResponseDto.success(
      items.map((user) => new User(user)),
      'Usuarios obtenidos',
      HttpStatus.OK,
      { ...meta },
    );
  }

  @Get(':userId')
  @ApiBaseResponse(User)
  @ApiNotFoundResponse({ description: 'No se encontró el usuario' })
  async findOne(
    @Param('userId', ParseIdPipe) userId: string,
  ): Promise<BaseResponseDto<User>> {
    return BaseResponseDto.success(
      new User(await this.users.findOne(userId)),
      'Usuario obtenido',
    );
  }

  @Post()
  @ApiBaseResponse(User, { status: HttpStatus.CREATED })
  @ApiConflictResponse({ description: 'Ya existe un usuario con ese correo' })
  async create(@Body() dto: CreateUserDto): Promise<BaseResponseDto<User>> {
    return BaseResponseDto.success(
      new User(await this.users.create(dto)),
      'Usuario registrado',
      HttpStatus.CREATED,
    );
  }

  @Patch(':userId')
  @ApiBaseResponse(User)
  @ApiBadRequestResponse({
    description: 'Quien edita intenta desactivarse o quitarse el rol',
  })
  @ApiNotFoundResponse({ description: 'No se encontró el usuario' })
  @ApiConflictResponse({
    description:
      'Ya existe un usuario con ese correo, o es el último administrador activo',
  })
  async update(
    @Param('userId', ParseIdPipe) userId: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<User>> {
    return BaseResponseDto.success(
      new User(await this.users.update(userId, dto, actor)),
      'Usuario actualizado',
    );
  }

  @Put(':userId/password')
  @ApiBaseResponse(null, { description: 'Contraseña actualizada' })
  @ApiNotFoundResponse({ description: 'No se encontró el usuario' })
  async changePassword(
    @Param('userId', ParseIdPipe) userId: string,
    @Body() dto: ChangeUserPasswordDto,
  ): Promise<BaseResponseDto<null>> {
    await this.users.changePassword(userId, dto.password);
    return BaseResponseDto.success(
      null,
      'Contraseña actualizada. Sus sesiones abiertas se cerraron',
    );
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiBaseResponse(null, { description: 'Usuario eliminado' })
  @ApiBadRequestResponse({ description: 'Quien borra intenta borrarse' })
  @ApiNotFoundResponse({ description: 'No se encontró el usuario' })
  @ApiConflictResponse({
    description:
      'El usuario tiene historial, o es el último administrador activo',
  })
  async remove(
    @Param('userId', ParseIdPipe) userId: string,
    @CurrentUser() actor: SessionUser,
  ): Promise<BaseResponseDto<null>> {
    await this.users.remove(userId, actor);
    return BaseResponseDto.success(null, 'Usuario eliminado');
  }
}
