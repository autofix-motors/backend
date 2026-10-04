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
