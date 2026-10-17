// joi es CommonJS: con `import * as joi` el namespace de ESM deja las funciones
// bajo `.default` y `joi.string()` revienta en ejecución. Compila igual, y
// Vitest tampoco lo detecta porque hace su propio interop: solo falla al
// arrancar el build con node.
import joi from 'joi';

export const envsSchema = joi
  .object({
    NODE_ENV: joi.string().required(),
    PORT: joi.number().default(3001),
    // Orígenes del frontend autorizados a llamar a la API. Uno o varios
    // separados por coma. En producción debe apuntar al dominio real del
    // frontend, nunca a '*'.
    CORS_ORIGIN: joi.string().default('http://localhost:3000'),
    DATABASE_URL: joi.string().required(),
    // Firma de los JWT de acceso. Quien la conozca puede fabricar una sesión de
    // cualquier usuario: sale del entorno, distinta en cada ambiente, y se
    // cambia si se filtra (eso cierra todas las sesiones de acceso vigentes).
    JWT_SECRET: joi.string().min(32).required().messages({
      'string.min': 'JWT_SECRET tiene que tener al menos 32 caracteres',
    }),
    // Vida del JWT de acceso. Es también lo que tarda en perder el acceso un
    // usuario dado de baja: el refresco ya lo rechaza, pero el acceso vigente
    // dura hasta que vence.
    ACCESS_TOKEN_MINUTES: joi.number().integer().min(1).default(15),
    // Vida de la sesión: pasado este plazo sin refrescar, hay que volver a entrar.
    REFRESH_TOKEN_DAYS: joi.number().integer().min(1).default(7),
    // Vida de una contraseña temporal (la que genera el sistema al crear un
    // usuario o habilitar el portal de un cliente). Viaja por WhatsApp: que
    // venza limita lo que queda expuesto en el chat si nadie la usa.
    TEMPORARY_PASSWORD_DAYS: joi.number().integer().min(1).default(7),
  })
  .unknown(true);
