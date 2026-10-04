import {
  BadRequestException,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';

/**
 * El ValidationPipe global.
 *
 * - `whitelist`: solo pasan al service las propiedades decoradas en el DTO.
 * - `forbidNonWhitelisted`: una propiedad de más es un 400, así nadie escribe
 *   una columna que el DTO no declara (un `roleId` o un `isActive` colado en el
 *   cuerpo). La condición es que TODO endpoint que recibe cuerpo tenga su DTO
 *   decorado: sin decoradores, el cuerpo llegaría vacío.
 * - `exceptionFactory`: los mensajes de los DTO ya están en español, pero el de
 *   una propiedad de más lo fija class-validator en inglés («property x should
 *   not exist»). Aquí se traduce, porque la API responde siempre en español.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    // Un mensaje por campo: sin esto, un campo vacío acumula «ingresa X»,
    // «X es demasiado corto» y «X tiene que ser texto» a la vez.
    stopAtFirstError: true,
    exceptionFactory: (errors) =>
      new BadRequestException(validationMessages(errors)),
  });
}

/** Aplana los errores (también los de objetos anidados) en mensajes legibles. */
export function validationMessages(
  errors: ValidationError[],
  prefix = '',
): string[] {
  return errors.flatMap((error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const own = Object.entries(error.constraints ?? {}).map(
      ([rule, message]) =>
        rule === 'whitelistValidation'
          ? `El campo «${path}» no está permitido`
          : message,
    );
    return [...own, ...validationMessages(error.children ?? [], path)];
  });
}
