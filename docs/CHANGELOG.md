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

## 2026-10-04

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
