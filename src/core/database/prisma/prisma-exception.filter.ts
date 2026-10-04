import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../../generated/prisma/client.js';

// Sin este filtro, una violación de constraint sale como 500 con el mensaje
// interno de Postgres, que además le filtra nombres de columnas al cliente.
const RESPONSES: Record<string, { statusCode: number; message: string }> = {
  P2002: {
    statusCode: HttpStatus.CONFLICT,
    message: 'Ya existe un registro con esos datos',
  },
  P2003: {
    statusCode: HttpStatus.CONFLICT,
    message: 'La operación rompe la relación con otro registro',
  },
  P2025: {
    statusCode: HttpStatus.NOT_FOUND,
    message: 'El registro no existe',
  },
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const known = RESPONSES[exception.code];

    if (!known) {
      // Un código que todavía no mapeamos. Se registra completo para poder
      // agregarlo después, pero al cliente no le llega el detalle interno.
      this.logger.error(
        `Error de Prisma sin mapear (${exception.code})`,
        exception.stack,
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Error interno del servidor',
      });
      return;
    }

    response.status(known.statusCode).json(known);
  }
}
