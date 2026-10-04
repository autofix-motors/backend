# Nomenclatura

Cómo se llaman los archivos, las clases y los símbolos. Se sigue la convención
de NestJS, que ya viene decidida por el framework y por su CLI: pelearse con ella
significa que `nest generate` produzca archivos distintos a los escritos a mano,
y que el desajuste reaparezca cada vez que alguien use el generador.

**Todo identificador va en inglés** (ver [Idioma](#idioma)). Los comentarios,
los mensajes al usuario, la documentación y los commits siguen en español.

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
| Booleanos | prefijo `is`, `has` o `can` | `isActive`, `hasPendingPayment` |

**Las interfaces no llevan prefijo `I`.** `UserRepository`, no `IUserRepository`:
el prefijo húngaro sobra en TypeScript y ensucia cada importación.

## Los DTO nombran la operación, no la tabla

`CreateUserDto`, `UpdateUserDto`, `UserResponseDto`, `ListUsersQueryDto`. Lo que
entra y lo que sale son cosas distintas de la entidad y se llaman distinto — si
un DTO se llama igual que la entidad, tarde o temprano alguien devuelve la
entidad completa con el hash de la contraseña dentro.

## Idioma

**Todo identificador va en inglés**: modelos, campos, enums y sus valores,
tablas, columnas, carpetas, archivos, clases, funciones, variables, rutas de la
API, cookies y variables de entorno. El inglés es lo que espera cualquiera que
se sume, y migrar después cuesta más con cada módulo.

| Contexto | Idioma |
|---|---|
| Identificadores (código, base, API, entorno) | Inglés |
| Comentarios y `///` de Prisma | Español |
| Mensajes de error que devuelve la API | Español |
| Documentación, planes, CHANGELOG y commits | Español |
| Datos sembrados que ve el usuario (nombres de catálogos) | Español |

### Términos del negocio: su nombre en español, al lado

Hay términos del taller cuya traducción no se reconoce a primera vista. Se
elige una traducción y **el modelo, campo o valor de enum lleva su nombre en
español en el `///`**:

```prisma
/// Español: orden de trabajo.
/// Lo que el taller se compromete a hacer sobre un vehículo…
model WorkOrder {
  /// Español: kilometraje al ingreso.
  mileageIn Int @map("mileage_in")
}

enum UserRole {
  /// Español: mecánico.
  MECHANIC
}
```

(`WorkOrder` es un ejemplo de cómo se vería; `UserRole` existe en `core.prisma`.)

- **Se marca lo que no se entiende solo.** `mileageIn` lleva «Español:
  kilometraje al ingreso»; `createdAt` o `email` no llevan nada.
- **La traducción se elige una vez** y se anota en un glosario en
  `docs/planificacion/convenciones/` (se crea con el primer término). Un término
  nuevo se agrega ahí antes de usarlo, para que no aparezcan dos traducciones de
  lo mismo.
- **Los términos sin equivalente se quedan como están**, con su explicación:
  `ubigeo` (el código INEI del distrito), `SUNAT`, `DNI`, `RUC`.

Los campos comunes de cada modelo son `createdAt` y `updatedAt`
(`created_at`, `updated_at` en la base).

## La clave primaria se llama `<entidad>Id`, nunca `id`

```prisma
model WorkOrder {
  workOrderId String @id @default(uuid()) @map("work_order_id") @db.Uuid
  vehicleId   String @map("vehicle_id") @db.Uuid   // FK: el mismo nombre que la PK de Vehicle
}
```

- **El id de cada modelo es `<entidad>Id`** en camelCase (`userId`, `sessionId`,
  `quoteItemId`), con su columna en snake_case (`user_id`). Nunca `id` a secas.
- **La clave foránea se llama igual que la primaria a la que apunta**:
  `vehicle.customerId` ↔ `customer.customerId`. Si un modelo apunta dos veces al
  mismo, el nombre dice el papel (`mechanicId`, `createdById`, ambos a `User`).
- **Lo mismo fuera de Prisma**: las entidades de respuesta, los DTO, el usuario de
  la sesión (`SessionUser.userId`) y los tipos del frontend usan ese nombre.

> Con `id` a secas, en un `join` o en un objeto con varias entidades no se sabe de
> cuál es cada `id`, y el mismo dato se llama `id` en una tabla y `customerId` en
> otra. Con `<entidad>Id` el nombre es el mismo en todos lados y se busca de una
> sola pasada.

## Tablas: prefijo del archivo de schema, en singular

Cada tabla se llama **`{archivo}_{entidad}`**, en singular y snake_case. El
archivo de schema también va en singular, y su nombre es el prefijo:

| Archivo | Modelo | Tabla |
|---|---|---|
| `core.prisma` | `User` | `core_user` |
| `core.prisma` | `Session` | `core_session` |
| `workshop.prisma` (ejemplo) | `WorkOrder` | `workshop_work_order` |

- El prefijo va **siempre**, aunque se repita.
- El **modelo** de Prisma no lleva prefijo: en el código es
  `this.prisma.user`.
- Los enums y las columnas no llevan prefijo.

Todo vive en el schema `public` de Postgres: el prefijo existe para que el
diagrama ERD agrupe las tablas por dominio.

## Lo que genera una herramienta se queda como viene

Los archivos que produce el CLI de Nest ya siguen esta convención:
`nest g res users` genera `users.service.ts`, `UsersService`,
`create-user.dto.ts` y los métodos `create`, `findAll`, `findOne`, `update` y
`remove`. Si alguna librería genera código con otro estilo, **no se renombra**:
se regeneraría solo en la siguiente actualización y el conflicto volvería cada
vez. Se deja como viene y, si hace ruido, se excluye del linter.
