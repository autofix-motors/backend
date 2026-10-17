# CHANGELOG

Qué se cambió, quién lo cambió y dónde mirarlo en detalle. Lo escribe quien hace
el cambio, **antes de abrir el Pull Request**.

No reemplaza a `git log`: lo traduce. El historial dice qué líneas cambiaron;
esto dice qué pasó y qué hay que mirar antes de desplegar.

## Cómo se escribe una entrada

Lo más nuevo arriba. Una sección por día, y dentro una entrada por cambio:

```markdown
## 2026-09-15

### Título corto de lo que se hizo — Nombre · HH:MM
PR [#12](../../pull/12) · commits [`abc1234`](../../commit/abc1234)

Dos o tres líneas: qué cambió y por qué. En castellano, sin jerga.

> **IMPORTANTE** — Lo que quien despliega o revisa tiene que saber sí o sí.
```

Los enlaces son relativos al propio repositorio (`../../pull/12`,
`../../commit/abc1234`), así no hay que reescribirlos si el repositorio cambia de
nombre, de organización o de servidor.

Reglas:

- **Conciso.** Dos o tres líneas. El detalle está en el PR y en los commits, y
  para eso se enlazan.
- **Enlaza los commits**, no solo el PR: es lo que permite revisar a fondo sin
  reconstruir nada.
- **Hora local del equipo.** Sirve para cruzar una entrada con un incidente.
- **`IMPORTANTE` solo cuando lo es.** Si todo es importante, nada lo es.

### Cuándo marcar IMPORTANTE

- Una **variable de entorno** nueva, renombrada o eliminada.
- Un **cambio de flujo**: algo que se hacía de una manera y ahora se hace de
  otra.
- Algo que hay que **configurar fuera del repositorio** —un servicio externo, un
  proveedor, una cuenta— para que funcione.
- Una **migración** que tarda, bloquea o no se puede revertir.
- Un **cambio incompatible en la API** que obliga a actualizar a quien la
  consume.
- Un **borrado** o una reversión.


---

## 2026-10-16

### Catálogo base del taller en el seed — Eduardo Huarcaya · 23:55
commits [`7cb7771`](../../commit/7cb7771)

`pnpm db:seed` siembra, además del administrador, 22 servicios con su mano de
obra, 26 repuestos e insumos con su stock inicial (registrado como compra en
el kardex, a nombre del administrador) y 11 herramientas. Los precios son una
estimación del mercado de Lima, para que el taller los ajuste. Volver a
sembrar no duplica stock ni cambia lo que ya existe.

> **IMPORTANTE** — Se vació la base local de desarrollo (`TRUNCATE` de todas
> las tablas salvo `_prisma_migrations`) y se volvió a sembrar: queda solo
> `admin@autofix.local` con la contraseña de `ADMIN_PASSWORD`.

### Login compartido, acceso de clientes y contraseñas temporales — Eduardo Huarcaya · 23:40
commits [`0f18b8d`](../../commit/0f18b8d)

El cliente inicia sesión en su portal (`POST /auth/customer-login`) con su
número de documento o correo, y el personal (`POST /auth/login`) con su DNI o
correo. El acceso del cliente lo habilita, restablece o quita el
administrador (`/customer-accounts`). Las contraseñas las genera el sistema
(temporales, vencen) y se cambian en el primer ingreso (`PUT /auth/password`).
El `RolesGuard` niega al cliente cualquier endpoint que no sea suyo. Plan en
`docs/planificacion/auth/01-login-compartido-y-contrasenas.md`.

> **IMPORTANTE** — Migración `20261017041056_acceso_al_portal` (solo agrega;
> pasa los correos de clientes a minúsculas). Variable nueva opcional
> `TEMPORARY_PASSWORD_DAYS` (7 por omisión). Cambia el contrato: el login
> recibe `identifier` en vez de `email`; `POST /users` ya no recibe
> `password` y exige `documentNumber`; `PUT /users/:id/password` se reemplaza
> por `POST /users/:id/temporary-password`; `CurrentSession` cambia de forma.
> El frontend tiene que regenerar sus tipos.

## 2026-10-04

### Presupuestos de una orden — Eduardo Huarcaya · 22:32
commits [`35f6e2c`](../../commit/35f6e2c)

Enviar un presupuesto (`POST /work-orders/:workOrderId/quotes`) congela los
ítems y el total de la orden en una versión nueva y la lleva a «Esperando
aprobación»; registrar la respuesta del cliente (`POST
…/quotes/:quoteId/decision`: aprobado o rechazado, canal y nota) la lleva a
reparación o de vuelta a diagnóstico. Solo `ADMIN`; el mecánico asignado los
ve en el detalle. Plan en `docs/planificacion/work-orders/03-presupuestos.md`.

> **IMPORTANTE** — Sin migración. Cambio de flujo: «Esperando aprobación» ya
> no se alcanza a mano, solo enviando un presupuesto (`SYSTEM_TRANSITIONS`), y
> desde ahí a mano solo se cancela. Cambia el contrato: `WorkOrderDetail` suma
> `quotes`; el frontend tiene que regenerar sus tipos.

### Servicios y repuestos de una orden — Eduardo Huarcaya · 22:25
commits [`746d8e8`](../../commit/746d8e8) · [`2ba1b34`](../../commit/2ba1b34)

Los ítems de la orden (`POST`, `PATCH` y `DELETE` en
`/work-orders/:workOrderId/items`), para `ADMIN` y el mecánico asignado,
mientras la orden se diagnostica o se repara. El repuesto descuenta el stock en
la misma transacción (409 sin stock, sin crear nada) y lo devuelve al quitarse
con un movimiento `WORK_ORDER` positivo; precio y descripción propios, solo
`ADMIN`. El detalle trae `items` y `totals` (Decimal; costo y margen solo
`ADMIN`) y el listado, `total`. Además, una orden lista para recoger ya se
puede cancelar.

> **IMPORTANTE** — Sin migración (solo cambió un `///` del schema). Cambia el
> contrato: `WorkOrder` suma `total` y `WorkOrderDetail`, `items` y `totals`;
> el frontend tiene que regenerar sus tipos. No se probó contra la base:
> Postgres local no acepta conexiones (scripts de flujo y de datos listos, sin
> correr).

### Órdenes de trabajo — Eduardo Huarcaya · 21:50
commits [`085b208`](../../commit/085b208)

Segundo módulo del grupo `workshop` (`/work-orders`): la orden y su línea de
tiempo. Alta, edición, asignación y borrado (sin ítems, presupuestos ni pagos)
para `ADMIN`; listado (número, placa, cliente y código; estados, mecánico,
vehículo, cliente, vencidas y días de ingreso) y detalle con eventos, y
diagnóstico, cambios de estado (tabla `canTransition`) y notas para `ADMIN` y
el mecánico asignado, que solo ve las suyas. `VehiclesModule` exporta su service.

> **IMPORTANTE** — Sin migración. No se probó contra la base: Postgres local
> no acepta conexiones (scripts de flujo y de datos listos, sin correr).

### Herramientas — Eduardo Huarcaya · 21:05
commits [`b2635aa`](../../commit/b2635aa)

Tercer módulo del grupo `inventory` (`/tools`): listado (búsqueda por código,
nombre y marca; filtros por estado, quién la tiene y si está en el almacén) y
detalle para `ADMIN` y `MECHANIC`; alta, edición, entrega o devolución rápida
(`PUT /tools/:toolId/assignment`) y borrado real (409 si alguien la tiene) solo
para `ADMIN`. Solo una herramienta operativa se asigna, y solo a un usuario
activo (verificado con `UsersService`, que `UsersModule` ahora exporta); en
reparación o de baja vuelve sola al almacén.

> **IMPORTANTE** — Sin migración. No se probó contra la base: Postgres local
> no acepta conexiones (scripts de flujo y de datos listos, sin correr).

### Movimientos de stock — Eduardo Huarcaya · 20:40
commits [`4aab90d`](../../commit/4aab90d) · [`3659689`](../../commit/3659689)

Kardex del grupo `inventory` (`/stock-movements`): compras y ajustes solo para
`ADMIN`, listado (búsqueda por producto y nota; filtros por tipo, producto y
rango de días de Lima) y detalle para los dos roles, el costo solo para
`ADMIN`. El stock se mueve con `ProductsService.applyStockChange` en la misma
transacción que el movimiento y nunca queda negativo (409). Sin edición ni
borrado: un error se corrige con un ajuste.

> **IMPORTANTE** — Sin migración. Una compra cambia `Product.cost` al costo de
> la compra. No se probó contra la base: Postgres local no acepta conexiones
> (scripts de flujo y de datos listos, sin correr).

### Repuestos e insumos — Eduardo Huarcaya · 20:05
commits [`a3a4558`](../../commit/a3a4558) · [`2fda56f`](../../commit/2fda56f)

Primer módulo del grupo `inventory` (`/products`): listado con búsqueda por
código, nombre y marca, filtros por tipo, estado y stock bajo, y detalle para
`ADMIN` y `MECHANIC` (el mecánico sin costo ni margen); alta, edición y borrado
real (409 si tiene movimientos u órdenes) solo para `ADMIN`. El stock no se
edita: nace en 0 y lo moverán los movimientos. Nuevo `IsQuantity`
(`core/validation/quantity.ts`); las reglas de `Decimal(10, 2)` quedan en
`decimal.ts`.

> **IMPORTANTE** — Sin migración. La respuesta de `Product` cambia según el
> rol: `cost` y `margin` no vienen para `MECHANIC`. No se probó contra la base:
> Postgres local no acepta conexiones.

### Catálogo de servicios — Eduardo Huarcaya · 19:50
commits [`2cf1d2e`](../../commit/2cf1d2e)

Primer módulo del grupo `workshop` (`/service-catalog`): listado con búsqueda
por nombre y descripción, filtros por estado y rango de precio, y detalle para
`ADMIN` y `MECHANIC`; alta, edición y borrado real (409 si ya se usó en
órdenes) solo para `ADMIN`. Nombre único sin distinguir mayúsculas. El precio se
valida como monto en soles con `IsMoney` (`core/validation/money.ts`) y sale
como texto con dos decimales.

> **IMPORTANTE** — Sin migración. No se probó contra la base: Postgres local
> no acepta conexiones.

### Personal — Eduardo Huarcaya · 19:35
commits [`2059dcd`](../../commit/2059dcd) · [`a50950c`](../../commit/a50950c)

Módulo de usuarios (`/users`, solo `ADMIN`): listado con búsqueda por nombre y
correo, filtros por rol y estado, alta con contraseña inicial (argon2id),
edición, cambio de contraseña y borrado real (409 si tiene historial). Nadie se
desactiva, se quita el rol ni se borra a sí mismo, y siempre queda un
administrador activo. Desactivar o cambiar rol o contraseña cierra sus sesiones
(`SessionsService.revokeAllForUser`, exportado por `AuthModule`).

> **IMPORTANTE** — El acceso de un usuario desactivado o degradado se corta al
> vencer su JWT (hasta `ACCESS_TOKEN_MINUTES`), no al instante. Sin migración.
> No se probó contra la base: Postgres local no acepta conexiones.

### Vehículos — Eduardo Huarcaya · 19:15
commits [`db898eb`](../../commit/db898eb)

Módulo de vehículos: listado paginado con búsqueda por placa, marca, modelo y
cliente, filtros por cliente y marca, y alta, edición y borrado real (409 si
tiene órdenes). Placa y VIN normalizados y únicos; el dueño se verifica con
`CustomersService`, que ahora se exporta. `GET /vehicles/brands` alimenta el
filtro por marca.

### Clientes y respuesta base en toda la API — Eduardo Huarcaya · 18:30

Módulo de clientes (listado paginado con búsqueda por nombre y documento,
filtros por tipo de documento y estado, alta, edición y borrado real). Toda la
API responde con `BaseResponseDto`, también los errores y `/auth`.

> **IMPORTANTE** — Cambia el formato de todas las respuestas: el frontend
> necesita su PR `feature/clientes`. `POST /auth/logout` pasa de 204 a 200.

### Modelo de datos del taller — Eduardo Huarcaya · 13:10

Todas las entidades del MVP en Prisma: clientes y vehículos, catálogo, órdenes de
trabajo con su línea de tiempo, ítems y presupuestos, inventario y pagos. Las
claves primarias pasan a llamarse `<entidad>Id` (`userId`, `sessionId`), también
en la respuesta de la sesión.

> **IMPORTANTE** — Dos migraciones: `renombrar_ids` (renombra columnas, sin
> pérdida de datos) y `modelo_del_taller`. `GET /auth/session` y el login
> devuelven `userId` en vez de `id`: el frontend tiene que regenerar sus tipos.

### Base del proyecto a partir de la plantilla — Eduardo Huarcaya · 12:10

Arranque de AutoFix Motors con la base técnica de un proyecto anterior, sin su
historial: NestJS 12 + Prisma 7 sobre PostgreSQL, solo con autenticación
(login con cookies httpOnly, sesiones con refresco rotativo) y dos roles,
`ADMIN` y `MECHANIC`, que se exigen con `@Roles()`.

> **IMPORTANTE** — La base nace con una sola migración (`init`). Variables
> obligatorias: `NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`. El primer
> administrador se crea con `pnpm db:seed` y `ADMIN_EMAIL` + `ADMIN_PASSWORD`.
