import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { BaseResponseDto } from '../../shared/dto/base-response.dto.js';
import { prismaErrorResponse } from '../database/prisma/prisma-errors.js';

const INTERNAL_ERROR = 'Error interno del servidor';
const GENERIC_ERROR = 'No se pudo completar la operación';

// Mensajes que Nest o sus librerías fijan en inglés.
const SPANISH: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'La solicitud no es válida',
  [HttpStatus.UNAUTHORIZED]: 'Inicia sesión para continuar',
  [HttpStatus.FORBIDDEN]: 'No tienes permiso para esta acción',
  [HttpStatus.CONFLICT]: 'La operación entra en conflicto con otro registro',
  [HttpStatus.TOO_MANY_REQUESTS]:
    'Demasiados intentos seguidos. Espera un minuto y vuelve a intentar',
  [HttpStatus.NOT_FOUND]: 'El recurso no existe',
};

/**
 * Todo error sale con el formato de BaseResponseDto, sea una excepción de Nest
 * (validación, 401, 403, 404…), un error conocido de Prisma o uno inesperado.
 * Es un solo filtro a propósito: con varios globales, cuál atrapa qué depende
 * del orden de registro.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    response.status(body.statusCode).json(body);
  }

  toBody(exception: unknown): BaseResponseDto<null> {
    if (exception instanceof HttpException) {
      return fromHttpException(exception);
    }

    const prisma = prismaErrorResponse(exception);
    if (prisma) return BaseResponseDto.error(prisma.message, prisma.statusCode);

    // Inesperado: se registra completo, pero al cliente no le llega el detalle
    // interno (nombres de tablas, rutas, la pila).
    this.logger.error(
      'Error no controlado',
      exception instanceof Error ? exception.stack : String(exception),
    );
    return BaseResponseDto.error(
      INTERNAL_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

function fromHttpException(exception: HttpException): BaseResponseDto<null> {
  const status = exception.getStatus();
  const raw = exception.getResponse();
  const message =
    typeof raw === 'object' && raw !== null && 'message' in raw
      ? raw.message
      : raw;

  // La validación de un DTO trae una lista: el mensaje las une y `error` las
  // conserva para quien quiera marcarlas campo por campo.
  if (Array.isArray(message)) {
    return BaseResponseDto.error(message.join('. '), status, message);
  }
  // Los mensajes propios ya están en español; los que pone Nest por defecto
  // («Not Found», «ThrottlerException: Too Many Requests») se traducen.
  const text =
    typeof message === 'string' && !isNestDefault(exception, message)
      ? message
      : (SPANISH[status] ?? GENERIC_ERROR);
  return BaseResponseDto.error(text, status);
}

function isNestDefault(exception: HttpException, message: string): boolean {
  return (
    message.startsWith('Cannot ') ||
    message.startsWith('ThrottlerException') ||
    message ===
      exception.name
        .replace(/Exception$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
  );
}
