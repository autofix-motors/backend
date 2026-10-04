# AutoFix Motors — Backend

API de AutoFix Motors. NestJS 12 (ESM) + Prisma 7 sobre PostgreSQL.

## Requisitos

- **Node.js** con soporte de ESM (probado con Node 24).
- **PostgreSQL** accesible: local, remoto o con Docker (opcional, ver
  [Base de datos con Docker](#base-de-datos-con-docker-opcional)).
- **pnpm** — ver [Instalar pnpm](#instalar-pnpm) si no lo tienes.

## Instalar pnpm

```bash
npm install -g pnpm
```

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores. El `.env` no se commitea.

| Variable | Obligatoria | Default | Para qué |
|---|---|---|---|
| `NODE_ENV` | Sí | — | Entorno de ejecución (`development`, `production`, ...) |
| `PORT` | No | `3001` | Puerto donde escucha la API |
| `DATABASE_URL` | Sí | — | Cadena de conexión a PostgreSQL. La usan la API y la CLI de Prisma |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Origen(es) del frontend autorizados a llamar a la API, separados por coma |
| `JWT_SECRET` | Sí | — | Firma de los JWT de acceso. Al menos 32 caracteres, distinto en cada ambiente |
| `ACCESS_TOKEN_MINUTES` | No | `15` | Vida del JWT de acceso |
| `REFRESH_TOKEN_DAYS` | No | `7` | Vida de la sesión sin refrescar |
| `ADMIN_EMAIL` · `ADMIN_PASSWORD` | Solo para el seed | — | Crean el primer administrador con `pnpm db:seed` |

## Base de datos con Docker (opcional)

**Solo si no tienes PostgreSQL instalado.** Si ya tienes uno (local o remoto),
apunta `DATABASE_URL` a él y sáltate esta sección. Requiere Docker Desktop.

```bash
docker compose up -d     # levanta Postgres 18 en el puerto 5432
docker compose down      # lo detiene; los datos se conservan
docker compose down -v   # lo detiene y BORRA los datos
```

`compose.yml` crea el usuario `postgres`, la contraseña `root` y la base `autofix_motors`,
así que el `DATABASE_URL` queda:

```
DATABASE_URL="postgresql://postgres:root@localhost:5432/autofix_motors?schema=public"
```

Si el puerto 5432 ya está ocupado (por un Postgres local), el contenedor no
levanta: detén el otro o cambia el puerto en `compose.yml`.

> Desde Postgres 18 la imagen guarda los datos en `/var/lib/postgresql/18/docker`
> y el volumen se monta en `/var/lib/postgresql`. Con la ruta de antes
> (`/var/lib/postgresql/data`) el contenedor se reinicia en bucle.

## Levantar el proyecto

```bash
pnpm install       # instala dependencias y genera el cliente de Prisma (postinstall)
pnpm db:migrate    # aplica las migraciones a tu base local
pnpm db:seed       # crea el primer administrador (ADMIN_EMAIL y ADMIN_PASSWORD)
pnpm start:dev     # levanta la API en modo watch
```

`pnpm db:migrate` **no corre el seed**: Prisma 7 dejó de hacerlo solo. Sin
`pnpm db:seed` las tablas quedan vacías y nadie puede entrar.

La API queda en `http://localhost:<PORT>` y la documentación de Swagger en
`http://localhost:<PORT>/api/docs`.

Otros modos de arranque:

```bash
pnpm start         # sin watch
pnpm build         # compila a dist/
pnpm start:prod    # corre lo ya compilado (node dist/main)
```

## Tests y lint

```bash
pnpm test          # unitarios (Vitest)
pnpm test:e2e      # punta a punta
pnpm test:cov      # con cobertura
pnpm lint          # oxlint
```

## Prisma

El schema vive en `prisma/`, dividido por archivo según el dominio
(`prisma/schema/core.prisma`, ...) y
`prisma/schema.prisma` solo con la conexión y el generador. Los comandos
principales:

| Comando | Cuándo usarlo |
|---|---|
| `pnpm db:migrate` | En desarrollo, después de editar cualquier `.prisma`. Genera la migración, la aplica a tu base local y regenera el cliente |
| `pnpm db:deploy` | Al desplegar. Solo aplica las migraciones ya generadas, no crea ninguna nueva |
| `pnpm db:generate` | Regenera el cliente de Prisma sin tocar la base (por ejemplo, después de un `pull` que trajo un schema nuevo) |
| `pnpm db:seed` | Carga los datos mínimos para que la aplicación arranque (el primer administrador, y después catálogos y estados) |
| `pnpm db:studio` | Abre una UI para explorar y editar los datos de la base conectada |

Antes de aceptar una migración, conviene revisar el SQL que generó:

```bash
pnpm exec prisma migrate dev --name lo-que-cambiaste --create-only
```

Esto la deja escrita en `prisma/migrations/` sin aplicarla. Si el SQL dice lo
que esperas y nada más, ejecuta `pnpm db:migrate` de nuevo para aplicarla.

**Nunca se usa `prisma db push`** contra una base que le importe a alguien:
sincroniza sin dejar migración y a partir de ahí el historial deja de ser
confiable. Por eso no existe ese script.

La migración generada se **commitea junto con el cambio de schema**, en el
mismo commit.
