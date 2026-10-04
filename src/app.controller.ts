import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './core/decorators/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Público: es la ruta que puede consultar el deploy para saber si la API
  // está viva, y ese chequeo no tiene sesión.
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
