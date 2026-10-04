import { BadRequestException, Injectable, ParseUUIDPipe } from '@nestjs/common';

/**
 * Valida que el `:id` de la ruta sea un UUID antes de consultar la base. Sin
 * esto, un id mal formado llega a Postgres y sale como 500. Extiende el pipe de
 * Nest solo para dar el mensaje en español: el suyo dice «Validation failed
 * (uuid v 4 is expected)».
 *
 * Uso: `@Param('id', ParseIdPipe) id: string`.
 */
@Injectable()
export class ParseIdPipe extends ParseUUIDPipe {
  constructor() {
    super({
      version: '4',
      exceptionFactory: () =>
        new BadRequestException('El identificador no es válido'),
    });
  }
}
