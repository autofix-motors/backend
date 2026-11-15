# Nomenclatura

Cómo se llaman los archivos, las clases y los símbolos. Se sigue la convención
de NestJS, que ya viene decidida por el framework y por su CLI: pelearse con ella
significa que `nest generate` produzca archivos distintos a los escritos a mano,
y que el desajuste reaparezca cada vez que alguien use el generador.

**El dominio va en español; la estructura de NestJS, en inglés** (ver
[Idioma](#idioma)). Los comentarios, los mensajes al usuario, la documentación y
los commits van en español.

## Archivos: kebab-case y sufijo de rol

```
users.module.ts
users.controller.ts
users.service.ts
users.repository.ts
create-user.dto.ts
update-user.dto.ts
user.entity.ts
access.guard.ts
public.decorator.ts
http-exception.filter.ts
logging.interceptor.ts
parse-id.pipe.ts
users.service.spec.ts
```

Dos partes, separadas por punto: **el nombre en kebab-case** y **el rol del
archivo**. El rol no es decorativo — es lo que permite saber qué hay dentro sin
abrirlo, y lo que hace que `users.service.ts` y `users.controller.ts` se ordenen
juntos en cualquier explorador.

Nada de `usersService.ts`, `UsersService.ts` ni `users-service.ts`: el punto
antes del rol es parte de la convención.

## Clases: PascalCase con el mismo sufijo

El archivo y la clase dicen lo mismo, cada uno en su casing:

| Archivo | Clase |
|---|---|
| `users.controller.ts` | `UsersController` |
| `users.service.ts` | `UsersService` |
| `create-user.dto.ts` | `CreateUserDto` |
| `user.entity.ts` | `User` |
| `access.guard.ts` | `AccessGuard` |

**Un archivo, una clase exportada.** Si un archivo exporta tres clases, son tres
archivos.

## Carpetas: módulos agrupados por dominio

```
src/
├── core/                   infraestructura transversal (config, database, guards…)
├── modules/
│   └── core/               grupo: el de core.prisma
│       ├── core.module.ts  importa los módulos del grupo
│       └── auth/
│           ├── dto/
│           ├── entities/
│           ├── auth.controller.ts
│           ├── auth.service.ts
│           └── auth.module.ts
└── shared/                 lo reutilizable entre módulos
```

**Los módulos de dominio viven en `src/modules/<group>/<module>/`**, no sueltos
en `src/`. Lo transversal —la conexión a la base, los guards, los interceptors—
va en `src/core/`, y lo que comparten varios módulos, en `src/shared/`.

**Lo que habla con un servicio externo va en `src/services/<servicio>/`**
(almacenamiento de archivos, correo…), cuando llegue el primero. Cada uno es un
módulo de Nest con su service, que **no es global**: el módulo de dominio que lo
usa lo importa, y así su `*.module.ts` dice de qué servicios externos depende.
Se diferencia de `src/core/` en que aquello es infraestructura propia de la API
(guards, config, la base), y esto envuelve a un tercero que puede caerse o
cambiar de proveedor. Si un ambiente puede no tener ese servicio, se enciende
con una variable `<SERVICIO>_ENABLED` booleana y obligatoria en `envs.ts`:
apagarlo tiene que ser explícito.

### Un grupo por archivo de schema

Los módulos se agrupan igual que las entidades: **un grupo por archivo de
`prisma/schema/`** (hoy solo `core`). Antes de crear un módulo, la pregunta es a
qué grupo pertenece, no dónde cabe. Un grupo nace con su primer módulo: no se
crean carpetas vacías.

- **Cada grupo tiene su `<group>.module.ts`** (`CoreModule`), que importa los
  módulos del grupo, y `app.module.ts` importa solo los grupos. No es
  ceremonia: `nest g res modules/core/users` registra el módulo nuevo en el
  `*.module.ts` más cercano subiendo carpetas, así que cae en `CoreModule` sin
  tocar `app.module.ts`.
- **El grupo no sale en la URL.** `@Controller('users')` sirve `/users`, no
  `/core/users`: el grupo ordena el código, no la API.
- **El grupo no relaja la separación entre módulos.** Un módulo no consulta las
  tablas de otro aunque sean del mismo grupo (ver la invariante 3 de
  [`proyecto.md`](proyecto.md)).
- **`modules/core/` no es `src/core/`.** El primero es el grupo de dominio de
  `core.prisma` (auth, usuarios); el segundo, la infraestructura. Se llaman
  igual porque `core` es el nombre del schema, y la ruta los distingue.

### El nombre del módulo

La carpeta se llama **como el dominio**, y esa misma palabra se usa de punta a
punta: la carpeta, el prefijo de las clases, el prefijo HTTP
(`@Controller('users')`) y el scope de los commits
(ver [`commits.md`](commits.md)).

**Se elige una palabra por dominio y no se cambia a mitad de camino.** Una
carpeta `users/` que sirve `/people` con una clase `CustomersService` obliga a
mantener una traducción mental en cada cambio, y a adivinar en cada búsqueda.

En plural cuando el módulo administra una colección (`users`, `payments`) y en
singular cuando es un concepto único (`auth`, `health`). La entidad, en cambio,
va siempre en singular: `user.entity.ts` → `User`.

## Símbolos

| Qué | Cómo | Ejemplo |
|---|---|---|
| Clases, tipos, interfaces, enums | PascalCase | `UserStatus`, `PaginatedResult` |
| Métodos, funciones, variables, propiedades | camelCase | `findAllByStatus`, `createdAt` |
| Valores de enum | UPPER_SNAKE_CASE | `IN_PROGRESS`, `MECHANIC` |
| Constantes de módulo y tokens de inyección | UPPER_SNAKE_CASE | `DEFAULT_PAGE_SIZE`, `USER_REPOSITORY` |
| Variables de entorno | UPPER_SNAKE_CASE | `DATABASE_URL`, `JWT_SECRET` |
| Booleanos | prefijo `is`, `has` o `can` | `isActive`, `hasPendingQuote` |

**Las interfaces no llevan prefijo `I`.** `UserRepository`, no `IUserRepository`:
el prefijo húngaro sobra en TypeScript y ensucia cada importación.

## Los DTO nombran la operación, no la tabla

`CreateUserDto`, `UpdateUserDto`, `UserResponseDto`, `ListUsersQueryDto`. Lo que
entra y lo que sale son cosas distintas de la entidad y se llaman distinto — si
un DTO se llama igual que la entidad, tarde o temprano alguien devuelve la
entidad completa con el hash de la contraseña dentro.

## Idioma

**Desde 2026-11 el dominio va en español** (decisión de quien dirige el
proyecto, para que el modelo se explique sin traducir): modelos, campos,
relaciones, enums y sus valores, tablas, columnas y el **JSON de la API**
(propiedades de DTO y entidades, filtros y valores de `ordenarPor`). Lo que es
estructura del framework sigue en inglés: carpetas, archivos, clases, métodos,
módulos, rutas HTTP, cookies, variables de entorno y la infraestructura
compartida (`BaseResponseDto`, `page`, `pageSize`, `search`).

| Contexto | Idioma |
|---|---|
| Dominio: modelos, campos, enums, tablas, columnas, JSON de la API | Español, sin tildes ni ñ (`anio`, `contrasena`) |
| Estructura: carpetas, archivos, clases, métodos, rutas HTTP, entorno | Inglés |
| Comentarios y `///` de Prisma | Español |
| Mensajes de error que devuelve la API | Español |
| Documentación, planes, CHANGELOG y commits | Español |
| Datos sembrados que ve el usuario (nombres de catálogos) | Español |

### Cómo se escriben los nombres del dominio

```prisma
/// Orden de trabajo (OT). Un ingreso del vehículo al taller…
model OrdenTrabajo {
  /// En km. Se congela aquí porque el vehículo vuelve con otro en cada visita.
  kilometrajeIngreso Int @map("kilometraje_ingreso")
}

enum RolUsuario {
  ADMINISTRADOR
  MECANICO
}
```

- camelCase en el código y snake_case en la base, **sin tildes ni ñ**:
  `anio`, `contrasena`, `diagnostico`.
- Fechas de un hecho terminan en `En` (`creadoEn`, `entregadaEn`); booleanos
  con `activo` o `es…` (`esPublico`).
- **La traducción se elige una vez** y se anota en el glosario
  `docs/planificacion/convenciones/01-glosario.md` antes de usarla.
- **Los términos sin equivalente se quedan como están**: `DNI`, `RUC`, `VIN`.

Los campos comunes de cada modelo son `creadoEn` y `actualizadoEn`
(`creado_en`, `actualizado_en` en la base).

## La clave primaria se llama `<entidad>Id`, nunca `id`

```prisma
model OrdenTrabajo {
  ordenTrabajoId String @id @default(uuid()) @map("orden_trabajo_id") @db.Uuid
  vehiculoId     String @map("vehiculo_id") @db.Uuid   // FK: el mismo nombre que la PK de Vehiculo
}
```

- **El id de cada modelo es `<entidad>Id`** en camelCase (`usuarioId`, `sesionId`,
  `detallePresupuestoId`), con su columna en snake_case (`usuario_id`). Nunca `id`
  a secas.
- **La clave foránea se llama igual que la primaria a la que apunta**:
  `vehiculo.clienteId` ↔ `cliente.clienteId`. Si un modelo apunta dos veces al
  mismo, el nombre dice el papel (`mecanicoId`, `creadoPorId`, ambos a `Usuario`).
- **Lo mismo fuera de Prisma**: las entidades de respuesta, los DTO, el usuario de
  la sesión (`SessionUser.usuarioId`) y los tipos del frontend usan ese nombre.

> Con `id` a secas, en un `join` o en un objeto con varias entidades no se sabe de
> cuál es cada `id`, y el mismo dato se llama `id` en una tabla y `clienteId` en
> otra. Con `<entidad>Id` el nombre es el mismo en todos lados y se busca de una
> sola pasada.

## Tablas: el nombre de la entidad, en singular y sin prefijo

Cada tabla se llama como su modelo, en singular y snake_case, **sin prefijo de
dominio**:

| Archivo | Modelo | Tabla |
|---|---|---|
| `core.prisma` | `Usuario` | `usuario` |
| `core.prisma` | `CuentaCliente` | `cuenta_cliente` |
| `workshop.prisma` | `OrdenTrabajo` | `orden_trabajo` |

- El archivo de schema (`core`, `customer`, `inventory`, `workshop`) solo ordena
  el código; no aparece en la base.
- Los enums y las columnas tampoco llevan prefijo.

> Cambió en 2026-11 (antes `{archivo}_{entidad}`, como `workshop_work_order`):
> quien dirige el proyecto pidió nombres simples para la exposición. Todo vive
> en el schema `public` de Postgres.

## Lo que genera una herramienta se queda como viene

Los archivos que produce el CLI de Nest ya siguen esta convención:
`nest g res users` genera `users.service.ts`, `UsersService`,
`create-user.dto.ts` y los métodos `create`, `findAll`, `findOne`, `update` y
`remove`. Si alguna librería genera código con otro estilo, **no se renombra**:
se regeneraría solo en la siguiente actualización y el conflicto volvería cada
vez. Se deja como viene y, si hace ruido, se excluye del linter.
