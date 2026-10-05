---
name: estructura-backend
description: Estructura del backend (NestJS 12 en ESM + Prisma 7 + PostgreSQL). USAR SIEMPRE antes de crear o mover un archivo en `src/` o en `prisma/` - un módulo, un endpoint, un modelo, un DTO, una migración, un seed o una consulta a la base. Define dónde vive el schema de Prisma, la división entre `prisma/` y `src/core/database/`, que los modelos REPITEN los campos comunes porque Prisma no tiene herencia, qué archivo cumple cada rol, cómo se protege un endpoint con `@Roles`, la dirección de las dependencias, la extensión `.js` obligatoria en los imports y las reglas de migraciones que rompen producción en silencio.
---

# Estructura del backend

NestJS 12 con Prisma 7 sobre PostgreSQL. Tres cosas que hay que tener presentes
antes de escribir la primera línea, porque invalidan buena parte de lo que vas a
encontrar buscando:

- **El proyecto es ESM** (`"type": "module"`). Es el andamio oficial de NestJS
  12, que además trae Vitest y oxlint en lugar de Jest y ESLint.
- **Prisma 7 cambió la configuración por completo.** La mayoría de los
  tutoriales son de Prisma 6 y no aplican.
- **La versión de Prisma está fijada exacta, y no es un capricho.** Ver abajo.

> **Qué hay hoy.** El modelo de datos completo ya está en `prisma/schema/`
> (`core`, `customer`, `workshop`, `inventory`, `finance`), pero en `src/` solo
> existe el grupo `core` (el login). Los ejemplos de módulos —`workshop/work-orders`,
> sus DTO y services— muestran **cómo se vería** el código; todavía no existe.

## Las versiones de Prisma están fijadas a mano

```json
"@prisma/client": "7.10.0",
"@prisma/adapter-pg": "7.10.0",
"prisma": "7.10.0"
```

Sin `^`, los tres. El motivo es concreto: **el dist-tag `latest` de la CLI
apunta a una release candidate de Prisma 8**, mientras el del cliente apunta a
la 7 estable.

| Paquete | Qué instala `pnpm add` sin versión |
|---|---|
| `prisma` | `8.0.0-rc.*` ← release candidate |
| `@prisma/client` | `7.10.0` estable |
| `@prisma/adapter-pg` | `7.10.0` estable |

Un `pnpm add -D prisma` a secas deja **CLI 8 con cliente 7**, que no encajan.
Prisma 8 además no es Prisma 7 con mejoras: sustituye `schema.prisma` por un
`contract.prisma` de archivo único, cambia `defineConfig` por
`definePrismaConfig` y añade un paso `prisma contract emit`. Migrar es un
trabajo propio, no una actualización.

> La propia CLI imprime «Update available 7.10.0 -> 8.0.0-rc.x» en cada comando.
> **Se ignora.** Actualizar es una decisión planificada, no algo que se hace
> porque un banner lo sugiere.

## Los imports llevan `.js`

En ESM con `moduleResolution: nodenext`, **todo import relativo termina en
`.js`**, aunque el archivo sea `.ts`:

```ts
import { AppController } from './app.controller.js';   // ✅
import { AppController } from './app.controller';      // ❌ no resuelve
```

Se refiere al archivo **compilado**, no al fuente. Los paquetes de
`node_modules` se importan por su nombre, sin extensión, como siempre.

> **Cuidado con los paquetes CommonJS.** `import * as joi from 'joi'` compila y
> revienta en ejecución: el namespace de ESM deja las funciones bajo `.default`.
> Va `import joi from 'joi'`. Y **los tests no lo detectan**, porque Vitest hace
> su propio interop; solo falla al arrancar el build con `node`.

## El mapa

```
prisma.config.ts              la configuración de la CLI. Obligatoria en Prisma 7
prisma/                       TERRITORIO DE LA HERRAMIENTA
├── schema.prisma             datasource + generator, y nada más
├── schema/
│   ├── core.prisma           usuarios (con su rol) y sesiones
│   ├── customer.prisma       clientes y vehículos
│   ├── workshop.prisma       catálogo de servicios, órdenes, eventos, ítems y presupuestos
│   ├── inventory.prisma      repuestos e insumos, kardex y herramientas
│   └── finance.prisma        pagos
├── migrations/               las genera la CLI. Se commitean
└── seeds/
    ├── index.ts              orquesta el orden
    └── core.seed.ts          el primer administrador
src/
├── main.ts                   el arranque y nada más
├── app.module.ts             importa los grupos y registra los guards globales
├── core/                     INFRAESTRUCTURA TRANSVERSAL
│   ├── config/envs.ts        esquema joi del entorno
│   ├── database/prisma/      TERRITORIO DE LA APLICACIÓN
│   │   ├── prisma.module.ts
│   │   ├── prisma.service.ts
│   │   └── prisma-exception.filter.ts
│   ├── auth/                 cookies de sesión, tipos del JWT y del usuario de sesión
│   ├── decorators/           @Public, @Roles, @CurrentUser
│   ├── validation/           pipe de validación global, ParseIdPipe, trimToNull
│   ├── filters/              filtros genéricos
│   ├── guards/               AccessGuard y RolesGuard (globales), LoginThrottlerGuard
│   ├── interceptors/
│   └── logger/
├── generated/prisma/         el cliente generado. NO se commitea, NO se edita
├── modules/
│   └── <group>/              un grupo por archivo de schema (hoy solo core tiene código)
│       ├── <group>.module.ts importa los módulos del grupo
│       └── <module>/         un paquete por dominio (lo que genera `nest g res`)
└── shared/                   lo reutilizable entre módulos
```

**`prisma/` es de la herramienta y `src/core/database/prisma/` es de la
aplicación.** La división no es estética: las migraciones de Prisma tienen que
vivir junto al schema, y la CLI asume la raíz. Meterlo dentro de `src/` obliga a
reconfigurar rutas, mete las migraciones en el build y desvía cada comando de lo
que dice la documentación. Se probó y se revirtió.

Las carpetas vacías de `core/` llevan un `.gitkeep` para que sobrevivan al push.

## Los modelos se agrupan por dominio, no por módulo

`prisma/schema/` tiene **un archivo por conjunto de dominio** y no un archivo por
módulo de `src/modules/`. Dentro de cada uno viven todas las entidades de ese
dominio: `core.prisma` trae `User` y `Session` juntos, aunque el día que haya un
módulo `users` y el de `auth` cada uno tenga su carpeta en `src/modules/core/`.

Antes de agregar una entidad nueva, la pregunta es **a qué dominio pertenece**,
no a qué módulo: se agrega al archivo de ese dominio, no se crea uno propio. Si
el dominio es nuevo, nace su archivo. Por ejemplo, vehículos y clientes van
juntos en `customer.prisma`, y la orden de trabajo con sus ítems y presupuestos
en `workshop.prisma`, no un archivo por modelo.

> El agrupamiento es solo para quien lee el schema: Prisma no le da ningún
> significado a la carpeta ni al nombre del archivo. Fusiona todo lo que
> encuentra bajo `prisma/` en un único schema, así que dos modelos con el mismo
> nombre siguen chocando aunque estén en archivos de dominio distintos.

**Los módulos siguen el mismo agrupamiento**: cada archivo de schema es un grupo
en `src/modules/<group>/`, con sus módulos adentro. `core.prisma` ↔
`modules/core/` (hoy, `auth`); un `workshop.prisma` sería `modules/workshop/`.
Ver [`Un módulo`](#un-módulo).

### La tabla lleva el nombre de su archivo delante

El archivo se nombra **en singular** (`core.prisma`, `workshop.prisma`) y ese
nombre es el **prefijo de cada tabla** que define, también en singular:

```prisma
// workshop.prisma
model WorkOrder {
  ...
  @@map("workshop_work_order")
}
```

- **Tabla = `{archivo}_{entidad}`**, en snake_case: `core_user`,
  `core_session`, `workshop_vehicle`.
- **El prefijo va siempre, aunque se repita**: un modelo `Payment` en un
  `payment.prisma` sería `payment_payment`. Una excepción por caso vuelve
  ambigua la regla.
- **El modelo no lleva prefijo**: sigue siendo `User`, y en el código,
  `this.prisma.user`. El prefijo es de la base.
- **Los enums y las columnas no llevan prefijo.**

Todas las tablas están en el schema `public` de Postgres. El prefijo solo sirve
para que el diagrama ERD agrupe las tablas por dominio: se descartó usar schemas
de Postgres separados (`core.user`) porque complican permisos y herramientas
sin aportar nada más que ese orden visual.

## Cada modelo dice por qué existe

El schema es lo primero que lee quien llega al proyecto. Un modelo sin
explicación obliga a adivinar para qué sirve, o a preguntarle a quien lo
escribió, que para entonces quizá ya no está.

```prisma
// Ejemplo inspirado en workshop.prisma (discountRate no existe).

/// Un trabajo que el taller hace sobre un vehículo, desde que entra hasta que
/// se entrega. Es una entidad aparte del vehículo porque el mismo auto vuelve
/// muchas veces, y cada visita tiene su propio diagnóstico y su propio cobro.
model WorkOrder {
  workOrderId  String   @id @default(uuid()) @map("work_order_id") @db.Uuid
  /// El kilometraje al recibir el vehículo, en km. Se congela aquí: el del
  /// vehículo cambia con cada visita.
  mileageIn    Int      @map("mileage_in")
  /// Fracción, no porcentaje: 0.1000 es 10 %.
  discountRate Decimal? @map("discount_rate") @db.Decimal(5, 4)
  ...
}
```

`core.prisma` es el ejemplo real: `User` explica por qué los clientes del
taller no son usuarios, y `Session` por qué existe si ya hay un JWT.

- **Todo modelo lleva un `///` encima que dice por qué existe**: qué problema del
  negocio resuelve y, si no es obvio, por qué es una entidad aparte y no un campo
  de otra. No se describe *qué es* («tabla de órdenes»), sino *para qué sirve*.
- **Los campos especiales llevan `///`**:
  - la unidad o escala (fracción o porcentaje, km, soles, horas);
  - un valor congelado a propósito;
  - un opcional que en realidad es obligatorio según otro campo, regla que valida
    el service porque Prisma no declara `CHECK`;
  - la forma de un `Json`;
  - una redundancia deliberada;
  - el origen del dato.

  Los campos obvios —`name`, `code`, `createdAt`— no llevan comentario: el
  ruido esconde lo que importa.
- **Los enums llevan `///`** cuando no es obvio por qué son un enum y no una
  tabla, típicamente porque los fija una norma o el código (como `UserRole`).
- **`///` para el porqué, `//` para notas del schema.** `///` pasa al cliente
  generado como JSDoc: quien escribe `prisma.session` lo ve al pasar el cursor,
  sin abrir el schema. `//` se descarta al generar, y queda para separadores de
  sección y notas sobre relaciones (`onDelete`, cascadas).
- **Un modelo sin `///` no pasa la revisión.**

## Los modelos REPITEN los campos comunes

**Prisma no tiene herencia de modelos.** No hay `abstract model` ni
`model X extends Y`: las dos sintaxis fallan con
`This line is invalid. It does not start with any known Prisma schema keyword`.
Es la petición [#13105](https://github.com/prisma/prisma/issues/13105), abierta
desde 2022 y sin compromiso de los mantenedores.

La clave primaria se llama **`<entidad>Id`, nunca `id`** (`vehicleId`, con su
columna `vehicle_id`), y la clave foránea que la apunta, igual: ver
[`nomenclatura.md`](../../rules/nomenclatura.md).

Así que **cada modelo declara sus campos comunes**, y eso es lo correcto aquí,
no un apaño:

```prisma
// Ejemplo
model Vehicle {
  vehicleId String @id @default(uuid()) @map("vehicle_id") @db.Uuid
  plate     String @unique @db.VarChar(10)

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt      @map("updated_at")

  @@map("customer_vehicle")
}

model WorkOrderNote {
  workOrderNoteId String @id @default(uuid()) @map("work_order_note_id") @db.Uuid
  text            String

  createdAt DateTime @default(now()) @map("created_at")
  // Sin `updatedAt`: las notas no se editan. Omitir un campo común es
  // simplemente no escribirlo.
  @@map("workshop_work_order_note")
}
```

Lo mismo vale para **el modelo de respuesta** de cada módulo: no hereda de una
clase base, declara sus campos. Se intentó con una `BaseEntity` compartida y se
descartó, por dos motivos comprobados:

- La base no puede copiar datos en su constructor. Para recortarla con
  `OmitType()`, NestJS **instancia la clase original una vez con `undefined`**
  para leer sus inicializadores y se traga la excepción: el `super(registro)` de
  la clase real nunca llega. El síntoma es una respuesta sin `id` ni `createdAt`
  y **ningún error en el log**.
- `OmitType()` exige un `Type<T>` instanciable, así que la base no puede ser
  `abstract`.

> Repetir tres líneas por modelo cuesta menos que una abstracción que se rompe
> en silencio. Y el schema dice exactamente lo que hay en la tabla, sin mirar
> otro archivo.

## La configuración de Prisma

**`prisma.config.ts`** (raíz). En Prisma 7 la URL de conexión **ya no va en el
schema**:

```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seeds/index.ts',
  },
  datasource: { url: env('DATABASE_URL') },
});
```

- **`schema` apunta al DIRECTORIO, no al archivo.** Con una ruta a
  `prisma/schema.prisma`, Prisma 7 lee solo ese archivo e **ignora en silencio**
  los de `schema/`: las migraciones salen incompletas sin un solo aviso. Es la
  causa de los issues [#28669](https://github.com/prisma/prisma/issues/28669) y
  [#28673](https://github.com/prisma/prisma/issues/28673), los dos cerrados.
- **`migrations.path` se declara explícito.** Sin él, con schema multi-archivo
  las migraciones caen **dentro** de la carpeta del schema.
- Este archivo lee el `.env` por su cuenta con `dotenv`: la CLI no levanta la
  aplicación de Nest. La validación con joi de `src/core/config/` protege el
  arranque de la API; este archivo protege los comandos de migración. Son dos
  caminos distintos hacia la misma variable y los dos tienen que existir.
- **Se queda en la raíz.** La CLI lo busca ahí sola; moverlo obliga a pasar
  `--config` en cada comando.

**`prisma/schema.prisma`** — solo la conexión y el generador:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

Cuatro cosas de Prisma 7 que no son negociables:

- **`provider = "prisma-client"`**, no `prisma-client-js`, que está deprecado.
- **`output` es obligatorio.** El cliente ya no vive en `node_modules`: se genera
  dentro del repositorio.
- **No hay `url` en el `datasource`.** Si lo ves en un tutorial, es de Prisma 6.
- **`schema.prisma` va en la raíz de `prisma/`**, al lado de `schema/`,
  `migrations/` y `seeds/`. Prisma 7 no lo busca dentro de subdirectorios.

**No hace falta `moduleFormat`.** El generador de Prisma 7 es ESM por defecto y
el proyecto también lo es, así que encajan sin configuración extra.

## Un módulo

`nest g res modules/<group>/<module>` genera la estructura y **no hay que
pelearse con ella**. Los módulos viven en `src/modules/<group>/<module>/`, dentro
del grupo de su archivo de schema:

```
src/modules/core/                (existe)
├── core.module.ts               importa AuthModule
└── auth/

src/modules/workshop/            (ejemplo: así se vería un grupo nuevo)
├── workshop.module.ts           importa VehiclesModule, CustomersModule…
├── vehicles/
├── customers/
└── work-orders/
```

- **El grupo tiene su `<group>.module.ts`**, y `app.module.ts` importa solo los
  grupos. La CLI registra el módulo nuevo en el `*.module.ts` más cercano
  subiendo carpetas (`@nestjs/schematics`, `utils/module.finder.js`): con el
  módulo de grupo, `nest g res modules/core/users` cae en `CoreModule` solo.
- **El primer módulo de un grupo crea el grupo**: su carpeta y su
  `<group>.module.ts`, que se agrega a `app.module.ts`. No se crean grupos vacíos.
- **El grupo no sale en la URL**: `@Controller('vehicles')` sirve `/vehicles`,
  no `/workshop/vehicles`.
- **`modules/core/` no es `src/core/`**: el primero es el grupo de dominio, el
  segundo la infraestructura.

Dentro del grupo, cada módulo tiene la forma de siempre:

```
src/modules/workshop/work-orders/        (ejemplo)
├── dto/
│   ├── create-work-order.dto.ts         lo que ENTRA
│   └── update-work-order.dto.ts
├── entities/
│   └── work-order.entity.ts             ← NO es una entidad de ORM. Ver abajo
├── work-orders.controller.ts            endpoints: validar, exigir rol, llamar, responder
├── work-orders.service.ts               la lógica, y las consultas vía PrismaService
├── work-orders.module.ts                el cableado
└── work-orders.service.spec.ts          tests (Vitest)
```

Y el modelo, que la CLI no genera, va aparte: en el archivo del **dominio** al
que pertenece, dentro de `prisma/schema/` (`WorkOrder` iría en
`workshop.prisma`, junto a `Vehicle` y `Customer` — no en un
`work-order.prisma` propio).

Los identificadores van en inglés —modelo, campos, carpeta, clases— y los
términos del negocio sin traducción evidente llevan su nombre en español en el
`///`. Ver [`nomenclatura.md`](../../rules/nomenclatura.md).

| Archivo | Qué va | Qué **no** va |
|---|---|---|
| `*.controller.ts` | Validar la entrada, exigir el rol, llamar al service, responder | Consultas a la base, reglas de negocio |
| `*.service.ts` | La lógica del dominio y las consultas con `this.prisma.*` | Nada de HTTP: ni `Request`, ni `Response`, ni códigos de estado a mano |
| `dto/*.dto.ts` | Lo que **entra**: forma y validación | Lo que sale |
| `entities/*.entity.ts` | Lo que **sale**: el modelo de respuesta de Swagger | Decoradores de ORM, lógica |
| `*.module.ts` | Imports, providers, exports | Cualquier otra cosa |

### Todo cuerpo entra por un DTO decorado

El `ValidationPipe` global (`src/core/validation/validation.pipe.ts`) tiene
`whitelist` y `forbidNonWhitelisted` encendidos:

- **Solo pasan al service las propiedades decoradas** con `class-validator`.
- **Una propiedad de más es un 400.** Así nadie escribe una columna que el DTO
  no declara, como un `role` o un `isActive` colado en el cuerpo.

```ts
// Ejemplo
export class CreateCustomerDto {
  @ApiProperty({ example: 'Juan Pérez', maxLength: 120 })
  @IsString({ message: 'El nombre tiene que ser texto' })
  @IsNotEmpty({ message: 'Ingresa el nombre' })
  @MaxLength(120, { message: 'El nombre tiene como máximo 120 caracteres' })
  name: string;
}
```

`LoginDto` (`modules/core/auth/dto/`) es el ejemplo real.

- **Todo endpoint que recibe cuerpo necesita su DTO con decoradores.** Es la
  trampa conocida: sin decoradores, la lista blanca deja el cuerpo **vacío** y
  la API responde 201 con un registro en blanco, sin ningún error.
- **Cada decorador lleva su `message` en español.** El único mensaje que
  class-validator da en inglés, el de la propiedad de más, lo traduce el
  `exceptionFactory` del pipe.
- **El DTO de edición es `PartialType` de `@nestjs/swagger`**, no el de
  `@nestjs/mapped-types`, para conservar la documentación, y **siempre con
  `{ skipNullProperties: false }`**: con el default, `{ "name": null }` salta la
  validación y la base lo rechaza con un 500. Los opcionales siguen aceptando
  `null` por su propio `@IsOptional`.
- **Un monto en soles se valida con `@ToMoneyText()` y `@IsMoney('El precio…')`**
  (`src/core/validation/money.ts`): acepta texto o número, lo deja como
  texto y exige no negativo, hasta 2 decimales y hasta 99999999.99 (lo que cabe
  en `Decimal(10, 2)`). Nunca `@IsNumber`: un `number` redondea en silencio
  («12.345» pasaría como 12.35). En una query, un `Transform` que convierta el
  texto vacío en `undefined` va en lugar de `@ToMoneyText()`. Ejemplo real:
  `modules/workshop/service-catalog/dto/`.
- **Una cantidad en la unidad de un producto** (stock mínimo, la cantidad de un
  movimiento) se valida igual, con `@ToQuantityText()` y
  `@IsQuantity('El stock mínimo')` (`src/core/validation/quantity.ts`). Las
  reglas de `Decimal(10, 2)` viven una vez en `decimal.ts`; `money.ts` y
  `quantity.ts` solo ponen sus mensajes. Ejemplo real:
  `modules/inventory/products/dto/`.
- **El `:id` de la ruta se valida con `ParseIdPipe`**
  (`@Param('id', ParseIdPipe)`). Sin él, un id mal formado llega a Postgres y
  sale como 500.
- **Los decoradores documentan el cuerpo en Swagger**, que es el contrato que
  lee el frontend.

### `entities/` decide qué sale

Con Prisma el modelo está en el schema, así que `entities/work-order.entity.ts`
queda libre para lo que de verdad hacía falta: **decidir qué sale por la API**.

```ts
// Ejemplo
export class WorkOrder {
  constructor(order: WorkOrderModel) {
    this.id = order.id;
    this.mileageIn = order.mileageIn;
    this.laborCost = order.laborCost.toFixed(2);
    this.createdAt = order.createdAt;
  }

  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 84500 }) mileageIn: number;
  @ApiProperty({ example: '180.00' }) laborCost: string;
  @ApiProperty({ format: 'date-time' }) createdAt: Date;
}
```

El ejemplo real es `CurrentSession` (`modules/core/auth/entities/`): copia el
usuario campo por campo para que el hash de la contraseña nunca salga.

- **Lo que no está en esta clase es tan importante como lo que está.** El tipo
  que genera Prisma trae todas las columnas; devolverlo crudo expone la que no
  debía — un hash, una marca interna, un campo de auditoría.
- **El constructor copia campo por campo.** Un `Object.assign` o un
  `...order` haría entrar la columna nueva sola, que es justo lo que esta
  clase existe para impedir.
- **No uses `implements`** contra el tipo de Prisma: obliga a declarar todas las
  columnas, lo contrario de lo que este archivo hace.
- **Un campo que un rol no puede ver** (el costo y el margen de un repuesto,
  que el mecánico no ve) es opcional en la misma entidad, con
  `@ApiPropertyOptional` y «Solo para ADMIN» en su descripción, y el
  constructor lo copia solo si el controller se lo pide
  (`new Product(product, { includeCosts })`, calculado con `@CurrentUser()`).
  Para el otro rol la clave no sale en el JSON. Una sola entidad y no dos: es
  el mismo recurso en el mismo endpoint. Ejemplo real:
  `modules/inventory/products/`.
- **Los `Decimal` salen como cadena, con `.toFixed(2)`.** Prisma los devuelve
  como objetos de decimal.js para no perder céntimos; serializados sin más,
  `180.50` viaja como `"180.5"` y el céntimo se pierde al cuadrar totales.
- La respuesta se declara con `@ApiBaseResponse(Modelo)` o
  `@ApiPaginatedResponse(Modelo)` (`src/shared/swagger/`), no con
  `@ApiOkResponse`. Una lista corta sin paginar (las opciones de un filtro,
  como `GET /vehicles/brands`) es `@ApiBaseResponse(Modelo, { isArray: true })`. El tipo de retorno de TypeScript no alcanza: sin el plugin
  de CLI de `@nestjs/swagger` —que este proyecto no usa—, el decorador es la
  única fuente de la documentación, y Swagger no entiende el genérico
  `BaseResponseDto<T>` sin ayuda.

### Toda respuesta va en `BaseResponseDto`

El controlador nunca devuelve la entidad suelta: la envuelve con
`BaseResponseDto.success(data, mensaje, status?, meta?)`
(`src/shared/dto/base-response.dto.ts`). El `mensaje` es en español y es lo que
el frontend le muestra al usuario («Cliente registrado»). Los errores no se
envuelven a mano: se lanza la excepción de Nest con su mensaje y el filtro
global (`src/core/filters/api-exception.filter.ts`) arma la respuesta, igual que
con los errores de Prisma.

- **Borrar** responde 200 con `data: null` y un mensaje, no 204: el formato es
  el mismo para todo.
- **Un listado** recibe un DTO que extiende `PaginationQueryDto`
  (`page`, `pageSize`, `search`) con sus filtros, y el service devuelve un
  `Page<T>` (`src/shared/pagination.ts`): `findMany` y `count` con el mismo
  `where` en una `$transaction`, `pageWindow()` para `skip`/`take`, y un
  desempate por la clave primaria en `orderBy` para que las páginas no se
  pisen. La paginación sale en `meta`.
- **Un filtro que compara dos columnas de la misma fila** (stock bajo:
  `stock <= minStock`) usa la referencia a la columna,
  `this.prisma.product.fields.minStock`, como valor del filtro. La función que
  arma el `where` la recibe por parámetro (`productsWhere(query, minStock)`)
  para probarla sin base.
- **El ejemplo real** es `modules/customer/customers/`.

### El service consulta directo

`PrismaClient` ya es el repositorio. Una capa `*.repository.ts` que solo
reenvía llamadas agrega archivos sin agregar nada:

```ts
// Ejemplo
@Injectable()
export class WorkOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateWorkOrderDto) {
    return this.prisma.workOrder.create({ data });
  }

  async findOne(id: string) {
    const order = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`No existe la orden ${id}`);
    return order;
  }

  update(id: string, data: UpdateWorkOrderDto) {
    // No se comprueba antes si existe: Prisma lanza P2025 y el filtro lo
    // traduce a 404. Comprobarlo aquí serían dos consultas y una condición de
    // carrera entre las dos.
    return this.prisma.workOrder.update({ where: { id }, data });
  }
}
```

**Se agrega un `*.repository.ts` solo cuando hay una razón concreta**: una
consulta que se repite en tres sitios, un `$queryRaw` que hay que aislar, o un
armado de filtros que ya no cabe en el service.

## El puente: `src/core/database/prisma/`

**`prisma.service.ts`** — Prisma 7 **exige un driver adapter**, no se puede
instanciar el cliente sin él:

```ts
@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

Por eso `pg` es una dependencia de producción: la usa el adapter. **El pool de
conexiones lo maneja `pg`**, no Prisma.

**`$connect()` no valida la conexión.** Con driver adapter es perezoso: no abre
conexión ni comprueba credenciales, así que con una `DATABASE_URL` equivocada la
aplicación arranca sin quejarse y revienta en el primer request. El `SELECT 1`
fuerza una conexión real para que el error salga al desplegar, que es cuando
alguien lo está mirando.

> Efecto secundario: cualquier test que levante el `AppModule` entero necesita
> una base alcanzable. Es lo correcto para un test de punta a punta, y explica
> por qué `pnpm test:e2e` falla si el `.env` no apunta a ningún lado.

**`prisma.module.ts`** — `@Global` para no importarlo en cada módulo, y registra
el filtro con `APP_FILTER`.

**`prisma-exception.filter.ts`** — traduce los errores de Prisma a HTTP. Sin él,
una violación de constraint sale como **500 con el mensaje interno de
Postgres**, que además filtra nombres de columnas al cliente:

| Código | Qué pasó | Respuesta |
|---|---|---|
| `P2002` | Violación de unique | `409 Conflict` |
| `P2003` | Violación de clave foránea | `409 Conflict` |
| `P2025` | El registro no existe | `404 Not Found` |

Lo no mapeado se registra completo y sale como 500 genérico. El cuerpo es
siempre `{ statusCode, message }`.

## Las dependencias van en una dirección

```
controller → service → prisma
                     → otro service
```

**Nunca al revés.** Un service no conoce el HTTP; un controller no consulta la
base.

## Autenticación y roles

**Todo endpoint exige sesión por defecto.** Dos guards globales (`APP_GUARD` en
`app.module.ts`, en este orden, porque el segundo lee lo que deja el primero):

- **`AccessGuard`**: verifica el JWT de la cookie `afm_access` y deja el usuario
  (`SessionUser`: `id` y `role`) en la petición.
- **`RolesGuard`**: si el endpoint declara `@Roles(...)`, el rol del usuario
  tiene que ser uno de esos. Sin el decorador, basta con tener sesión.

```ts
// Ejemplo: solo un administrador gestiona los usuarios, en todo el controlador
@Roles(UserRole.ADMIN)
@Controller('users')
export class UsersController { … }

// auth.controller.ts (real)
@Public()                         // sin sesión: se declara a propósito
@Post('login')
login(@Body() dto: LoginDto) { … }

@Get('session')                   // solo exige sesión
session(@CurrentUser() user: SessionUser) { … }
```

- **Si los roles cambian según el endpoint, `@Roles` va en cada método** y no
  en la clase: el del método reemplaza al de la clase (`getAllAndOverride`), y
  mezclarlos obliga a leer los dos para saber quién entra. Ejemplo real:
  `ServiceCatalogController`, que el mecánico consulta y solo el administrador
  modifica.
- **Un endpoint público se marca con `@Public()`.** Un endpoint desprotegido
  tiene que ser una decisión visible, no un olvido.
- **Los roles los define el código**: son el enum `UserRole` de `core.prisma`
  (`ADMIN`, `MECHANIC`), no una tabla. Un usuario tiene un solo rol y no hay
  permisos finos: el taller no los necesita.
  - Un rol nuevo es un valor nuevo del enum, con su migración.
  - `@Roles` recibe `UserRole`: un rol mal escrito no compila.
- **El rol viaja en el JWT**, así que los guards no consultan la base.
  Consecuencia: un cambio de rol o una baja tardan hasta `ACCESS_TOKEN_MINUTES`
  en notarse. El refresco sí consulta la base y rechaza al usuario inactivo, y
  `users` cierra sus sesiones (`SessionsService.revokeAllForUser`) al
  desactivarlo o cambiarle el rol o la contraseña.
- **Una regla que depende de quién actúa** (nadie se desactiva ni se borra a sí
  mismo) la decide el service: el controller lee `@CurrentUser()` y se lo pasa
  como `actor: SessionUser`. Ejemplo real: `UsersService.update` y `remove`.
- **La cookie de refresco (`afm_refresh`) solo viaja a `/auth`.** El flujo
  (rotación del refresh, detección de reuso) está explicado en los comentarios
  de `modules/core/auth/` y en el `///` de `Session`.

### Entre módulos

Un módulo puede importar el **service** de otro. **Lo que no puede es consultar
las tablas de otro módulo**, aunque `this.prisma.user` compile perfectamente
desde `work-orders.service.ts`.

> Esta es la regla que el schema compartido de Prisma ya no protege sola. Si
> `work-orders` lee la tabla de `users` por su cuenta, el día que `users` cambie
> una columna nadie se entera hasta que falla en ejecución, porque el cambio no
> aparece en ningún import.

El ejemplo real: `VehiclesModule` importa `CustomersModule`, que exporta
`CustomersService`, y verifica al dueño con `customers.findOne()`. Leer la
relación del propio modelo con `include` (el cliente resumido de cada vehículo)
sí está permitido: es la consulta del módulo dueño de `Vehicle`.

Si dos módulos se necesitan todo el tiempo, probablemente son uno.

## Servicios externos

Hoy no hay ninguno. Si se agrega uno (correo, almacenamiento de archivos), va
en `src/services/<servicio>/` como módulo de Nest **no global**: lo importa el
módulo que lo usa, y así su `*.module.ts` dice de qué terceros depende. Sus
variables se validan en `envs.ts` y, si un ambiente puede no tenerlo, se
enciende con su `<SERVICIO>_ENABLED` (ver
[`nomenclatura.md`](../../rules/nomenclatura.md)).

## Migraciones: la regla que rompe producción en silencio

```bash
pnpm db:migrate    # local: genera y aplica (prisma migrate dev)
pnpm db:deploy     # despliegue: solo aplica
pnpm db:generate   # regenera el cliente
pnpm db:seed
pnpm db:studio
```

- **Una migración escrita a mano lleva la hora en UTC** en el nombre de su
  carpeta (`date -u +%Y%m%d%H%M%S`), como las que genera Prisma. Prisma las
  aplica en orden alfabético: con la hora local (UTC−5) una migración nueva
  queda **antes** que otras más viejas, falla al aplicarse sobre tablas que
  todavía no existen y bloquea las siguientes. Pasó con `renombrar_ids`.
- **Todo cambio del schema necesita su migración generada, revisada y
  commiteada.** Editar un `.prisma` sin migrar funciona en tu máquina —el
  cliente se regenera— y falla al desplegar. No avisa.
- **Revisar el SQL que generó**, y que diga lo que esperas **y solo eso**. Un
  rename mal detectado sale como `DROP` + `CREATE`, y eso es pérdida de datos.
  `prisma migrate diff --from-empty --to-schema prisma --script` lo imprime sin
  tocar la base.
- **Nunca `prisma db push`** contra una base que le importe a alguien:
  sincroniza sin dejar migración, y a partir de ahí el historial miente. Por eso
  no hay script `db:push`.
- **Una migración aplicada no se edita.** Si salió mal, se corrige con una nueva.
- **`prisma migrate reset` borra la base entera.** Prisma 7 trae un guardia que
  bloquea el comando cuando detecta que lo invoca un agente de IA, y exige
  consentimiento explícito de la persona. Ese guardia no se rodea: si hace falta
  resetear, lo corre una persona.

## El cliente generado

`src/generated/prisma/` **no se commitea y no se edita**. Va al `.gitignore`, se
excluye de oxlint y de Prettier, y se regenera:

- después de cada `pnpm install` (script `postinstall`),
- después de cada cambio del schema,
- en el CI, antes de compilar.

> Si falta, el proyecto no compila y el error habla de imports que no existen,
> no de Prisma. Es la primera cosa que hay que descartar cuando algo no compila
> después de un `pull`.

Se genera **fuera** de `prisma/` y fuera de `core/`, a propósito: la frontera
entre lo escrito a mano y lo generado queda a la vista y el `.gitignore` sigue
siendo una línea.

## Seeds

`prisma/seeds/index.ts` orquesta el orden y cada grupo siembra lo suyo en su
`<group>.seed.ts`. Se corren con `pnpm db:seed`, **solo de forma explícita**.

Son **idempotentes**: correrlos dos veces deja lo mismo. Se usa `upsert`, o se
comprueba antes y no se toca lo que ya existe, como hace `core.seed.ts` con el
administrador (volver a sembrar no puede cambiarle la contraseña a quien ya la
cambió). Un seed que falla la segunda vez que lo corres es un seed que nadie va
a correr.

Y siembran **solo lo que la aplicación necesita para arrancar** —el primer
administrador (de `ADMIN_EMAIL` y `ADMIN_PASSWORD`), catálogos, estados—, no
datos de prueba. Los datos de prueba son de los tests.

Viven fuera de `src/` a propósito: así no entran en el build ni viajan a
producción.

## Tests

El runner es **Vitest**, configurado en `vitest.config.ts` (unitarios) y
`vitest.config.e2e.ts`. Los `describe`, `it` y `expect` son globales: no se
importan.

Los tests unitarios van **junto al archivo que prueban**
(`auth.service.spec.ts`, `roles.guard.spec.ts`); los de punta a punta, en
`test/`.

**Lo que decide algo es lo que se prueba.** Un service cuyo método es una sola
llamada a Prisma no necesita test propio: probarlo es probar a Prisma. Lo que sí
se prueba es lo que hay alrededor — las reglas, los cálculos, los casos borde— y
**el modelo de respuesta**, que es quien decide qué sale por la API.

> `vitest.config.ts` todavía lleva `passWithNoTests: true`, de cuando no quedaba
> ningún `.spec.ts`. Ya hay, así que es una muleta que se puede quitar.

## Convenciones de código

- **Formato:** Prettier. **Lint:** oxlint (`oxlint.json`). Los dos ignoran
  `src/generated/`.
- **Nombres:** ver [`nomenclatura.md`](../../rules/nomenclatura.md). El archivo
  del modelo se agrupa por dominio en `prisma/schema/` (`core.prisma`, y los
  que vengan), no por módulo: los módulos de un mismo grupo
  (`src/modules/<group>/`) comparten su archivo de schema.
- **Los comandos se corren con `pnpm`**, que es el gestor del proyecto.
- **Las dependencias nuevas se registran** en `docs/DEPENDENCIES.md`, con fecha
  y motivo. Ver [`dependencias.md`](../../rules/dependencias.md).
