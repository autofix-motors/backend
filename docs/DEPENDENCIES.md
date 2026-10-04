# Dependencias

Qué se instaló, cuándo y para qué. Lo escribe quien instala o quita el paquete,
en el mismo commit. El formato y el porqué están en
[`.claude/rules/dependencias.md`](../.claude/rules/dependencias.md).

No están listadas las que vienen en el andamio de `nest new` (`@nestjs/common`,
`@nestjs/core`, `typescript`, `vitest`, `oxlint`, `prettier`…): son la línea base
del framework, no una decisión del equipo.

## Instaladas

| Fecha | Paquete | Tipo | Para qué |
|---|---|---|---|
| 2026-09-18 | `@nestjs/config` | prod | Leer el `.env` y exponer la configuración por inyección |
| 2026-09-18 | `@nestjs/swagger` | prod | Generar la documentación OpenAPI a partir de los `@ApiProperty` de las entidades de respuesta. Aporta además el `PartialType` que conserva la metadata de la documentación, a diferencia del de `@nestjs/mapped-types` |
| 2026-09-18 | `class-validator` | prod | Validar los DTO con decoradores. Es lo que entiende el `ValidationPipe` que trae NestJS. En uso desde el 2026-09-25, con `whitelist` encendido |
| 2026-09-18 | `class-transformer` | prod | Lo necesita `ValidationPipe` con `transform: true`: es lo que convierte el cuerpo en una instancia del DTO |
| 2026-09-19 | `joi` | prod | Validar las variables de entorno al arrancar, vía el `validationSchema` de `ConfigModule`. Reemplaza a `zod`, que se retiró |
| 2026-09-19 | `@prisma/client` | prod | El ORM: cliente tipado generado a partir del schema |
| 2026-09-19 | `@prisma/adapter-pg` | prod | Driver adapter de Postgres. Prisma 7 no permite instanciar el cliente sin uno |
| 2026-09-19 | `pg` | prod | Driver de PostgreSQL. Lo usa el adapter de Prisma, que además maneja el pool de conexiones |
| 2026-09-19 | `prisma` | dev | CLI de Prisma: migraciones, generación del cliente, seeds y studio |
| 2026-09-19 | `@types/pg` | dev | Tipos de `pg`, que no los trae el paquete |
| 2026-09-19 | `dotenv` | dev | Cargar el `.env` en `prisma.config.ts`. La CLI de Prisma no levanta Nest, así que no pasa por `@nestjs/config` |
| 2026-09-19 | `tsx` | dev | Ejecutar los seeds de Prisma, que son TypeScript. El andamio de NestJS 12 ya no trae `ts-node` |
| 2026-09-25 | `@nestjs/jwt` | prod | Firmar y verificar el JWT de acceso que viaja en la cookie `afm_access` |
| 2026-09-25 | `cookie-parser` | prod | Leer las cookies de sesión: sin él, `request.cookies` no existe |
| 2026-09-25 | `argon2` | prod | Guardar las contraseñas como hash argon2id, el algoritmo que OWASP recomienda primero |
| 2026-09-25 | `@nestjs/throttler` | prod | Limitar los intentos de login contra fuerza bruta (5 por minuto por IP y correo) |
| 2026-09-25 | `@types/cookie-parser` | dev | Tipos de `cookie-parser`, que no los trae el paquete |

## Retiradas

| Fecha | Paquete | Por qué |
|---|---|---|
| 2026-09-18 | `typeorm` | Reemplazado por Prisma antes de escribir código con él |
| 2026-09-18 | `@nestjs/typeorm` | Descartado junto con `typeorm` |
| 2026-09-18 | `nestjs-zod` | Probado y descartado. Funcionaba —validación, serialización y documentación desde un solo esquema—, pero sostenerlo costaba más de lo que ahorraba: una librería de terceros cuyos rangos de peer van por detrás de NestJS 12, un codec a medida por cada `Date` y cada `Decimal` porque no se pueden representar en JSON Schema, y un camino distinto del que documenta NestJS |
| 2026-09-19 | `zod` | Reemplazado por `joi` en la validación del entorno. Los DTO nunca llegaron a usarlo |
| 2026-09-19 | `drizzle-orm` | Descartado. Se evaluó como reemplazo de Prisma y se revirtió: la única versión que documenta la web es la `1.0.0-rc`, una release candidate cuya API rompe con todo el material existente —`drizzle(pool, { schema })` y `NodePgDatabase<typeof schema>` ya no compilan, y el formato de las migraciones cambió dentro de la propia línea v1 |
| 2026-09-19 | `drizzle-kit` | Descartado junto con `drizzle-orm`: van en lockstep y mezclarlos da errores que no mencionan las versiones |
| 2026-10-04 | `@aws-sdk/client-s3` | Ya no se usa: se quitó el almacenamiento de archivos al reducir la plantilla a autenticación |
| 2026-10-04 | `@aws-sdk/s3-request-presigner` | Ya no se usa: se retiró junto con `@aws-sdk/client-s3` |

## Notas

- **Las versiones de Prisma están fijadas exactas, a propósito.** Los tres
  paquetes van sin `^`. El motivo es que **el dist-tag `latest` de la CLI apunta
  a `8.0.0-rc.x`**, una release candidate, mientras el de `@prisma/client`
  apunta a la `7.10.0` estable: un `pnpm add -D prisma` a secas deja CLI 8 con
  cliente 7, que no encajan. Prisma 8 además sustituye `schema.prisma` por un
  `contract.prisma` de archivo único y cambia `defineConfig` por
  `definePrismaConfig`; migrar es un trabajo propio, no una actualización. La
  CLI imprime un aviso de actualización en cada comando: se ignora.
- **`@prisma/client` y `prisma` suben juntos o no suben.**
- **El cliente de Prisma no se commitea.** Vive en `src/generated/prisma/`, está
  en el `.gitignore`, excluido de oxlint y de Prettier, y se regenera solo con
  el script `postinstall`. Si el proyecto no compila después de un `pull`, es lo
  primero que hay que descartar: `pnpm db:generate`.
- **`whitelist` encendido desde el 2026-09-25.** Hasta entonces estaba apagado
  porque ningún DTO tenía decoradores, y encendido dejaba el cuerpo vacío. Con
  la autenticación llegaron los primeros DTO decorados (`LoginDto`) y se encendió. Desde ahí, todo endpoint que recibe cuerpo necesita su
  DTO decorado.
- **`argon2` trae binarios precompilados** para Linux (glibc y musl), Windows y
  macOS, así que no necesita compilar nada al instalar. pnpm avisa «Ignored
  build scripts: argon2» y está bien que lo ignore: el binario ya viene.
- **`cookie-parser` es CommonJS**, como `joi`: se importa con
  `import cookieParser from 'cookie-parser'`.
- **Aviso de peer preexistente:** `vite-tsconfig-paths` arrastra `tsconfck`,
  que declara `typescript ^5` y el proyecto usa la 6. Viene de antes de la
  autenticación y está pendiente de decidir.
- **`joi` es CommonJS.** Se importa con `import joi from 'joi'`, no con
  `import * as joi`. La segunda forma compila y revienta en ejecución, y los
  tests no la detectan porque Vitest hace su propio interop.
- **`multer` no se instala aparte.** Viene con `@nestjs/platform-express` 12
  (multer 2.4), que es de donde lo usa `FileInterceptor`. Tampoco hace falta
  `@types/multer`: cada controller declara la interfaz mínima del archivo que
  recibe (`buffer`, `mimetype`, `size`).
- **`file-type` viene con `@nestjs/common`** y es lo que usa `FileTypeValidator`
  para revisar el contenido real del archivo (magic numbers), no el tipo que
  declara el navegador.
- **Aviso de peer conocido, no de este cambio:** `tsconfck@3.1.6` (dependencia
  de `vite-tsconfig-paths`, dev) declara `typescript ^5` y el proyecto usa la
  6. Detectado el 2026-09-25; pendiente de revisar.
