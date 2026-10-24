import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './core/decorators/public.decorator.js';
import { BaseResponseDto } from './shared/dto/base-response.dto.js';
import { ApiBaseResponse } from './shared/swagger/api-response.decorators.js';

@ApiTags('health')
@Controller()
export class AppController {
  // Público: es la ruta que puede consultar el deploy para saber si la API
  // está viva, y ese chequeo no tiene sesión.
  @Public()
  @Get()
  @ApiBaseResponse(null, { description: 'La API está en línea' })
  health(): BaseResponseDto<null> {
    return BaseResponseDto.success(null, 'API en línea');
  }
}
