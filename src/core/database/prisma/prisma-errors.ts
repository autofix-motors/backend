import { HttpStatus } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';

// Sin esta traducción, una violación de constraint sale como 500 con el
// mensaje interno de Postgres, que además le filtra nombres de columnas al
// cliente. La usa el filtro global (core/filters/api-exception.filter.ts).
const RESPONSES: Record<string, { statusCode: number; message: string }> = {
  P2002: {
    statusCode: HttpStatus.CONFLICT,
    message: 'Ya existe un registro con esos datos',
  },
  P2003: {
    statusCode: HttpStatus.CONFLICT,
    message: 'No se puede completar: hay registros relacionados que lo impiden',
  },
  P2025: {
    statusCode: HttpStatus.NOT_FOUND,
    message: 'El registro no existe',
  },
};

/** El código HTTP y el mensaje de un error conocido de Prisma, o undefined. */
export function prismaErrorResponse(
  exception: unknown,
): { statusCode: number; message: string } | undefined {
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
    return undefined;
  }
  return RESPONSES[exception.code];
}
