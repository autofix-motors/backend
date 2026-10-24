import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '../../generated/prisma/client.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

describe('ApiExceptionFilter', () => {
  const filter = new ApiExceptionFilter();

  it('conserva el mensaje propio de una excepción', () => {
    expect(filter.toBody(new ConflictException('Ya existe'))).toEqual({
      success: false,
      message: 'Ya existe',
      data: null,
      statusCode: 409,
      error: undefined,
      meta: undefined,
    });
  });

  it('une los mensajes de validación y conserva la lista en error', () => {
    const body = filter.toBody(
      new BadRequestException(['Falta el nombre', 'El correo no es válido']),
    );
    expect(body).toMatchObject({
      message: 'Falta el nombre. El correo no es válido',
      statusCode: 400,
      error: ['Falta el nombre', 'El correo no es válido'],
    });
  });

  it('traduce los mensajes por defecto de Nest', () => {
    expect(filter.toBody(new NotFoundException()).message).toBe(
      'El recurso no existe',
    );
    expect(filter.toBody(new ThrottlerException()).message).toMatch(
      /Demasiados intentos/,
    );
  });

  it('traduce un error conocido de Prisma', () => {
    const error = new Prisma.PrismaClientKnownRequestError('duplicado', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(filter.toBody(error)).toMatchObject({
      success: false,
      statusCode: 409,
    });
  });

  it('no filtra el detalle de un error inesperado', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const body = filter.toBody(
      new Error('relation "core_user" does not exist'),
    );
    expect(body).toMatchObject({
      statusCode: 500,
      message: 'Error interno del servidor',
    });
  });
});
