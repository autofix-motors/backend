import type { ValidationError } from '@nestjs/common';
import { validationMessages } from './validation.pipe.js';

const error = (
  property: string,
  constraints: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError => ({ property, constraints, children });

describe('validationMessages', () => {
  it('conserva los mensajes en español de los DTO', () => {
    expect(
      validationMessages([
        error('email', { isEmail: 'Ingresa un correo válido' }),
      ]),
    ).toEqual(['Ingresa un correo válido']);
  });

  it('traduce la propiedad de más, que class-validator da en inglés', () => {
    expect(
      validationMessages([
        error('roleId', {
          whitelistValidation: 'property roleId should not exist',
        }),
      ]),
    ).toEqual(['El campo «roleId» no está permitido']);
  });

  it('incluye los errores de objetos anidados con su ruta', () => {
    expect(
      validationMessages([
        error('address', {}, [
          error('extra', {
            whitelistValidation: 'property extra should not exist',
          }),
        ]),
      ]),
    ).toEqual(['El campo «address.extra» no está permitido']);
  });
});
