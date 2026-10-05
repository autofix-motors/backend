# Gestión del personal

Primer módulo nuevo del grupo `core` después de `auth`, sobre el patrón de
Clientes y Vehículos. El modelo `User` ya existía en `core.prisma`: el módulo no
cambia el schema.

## Qué entra y qué no

- **Entra:** listado paginado con búsqueda, filtros y orden; detalle, alta (con
  contraseña inicial), edición, cambio de contraseña por el administrador y
  borrado real, todo solo para `ADMIN`. Cada usuario sale con cuántas órdenes
  tiene asignadas como mecánico. Al desactivar, cambiar el rol o la contraseña,
  se cierran sus sesiones (`SessionsService.revokeAllForUser`, de `auth`).
- **No entra:** que cada usuario cambie su propia contraseña desde un «Mi
  perfil» (hoy lo hace el administrador, también la suya), «olvidé mi
  contraseña» (el taller no envía correos), reglas de complejidad más allá del
  largo, la carga de trabajo por mecánico con solo las órdenes abiertas (llega
  con las órdenes de trabajo; hoy el número cuenta todas las asignadas),
  listado de las sesiones abiertas de un usuario, auditoría de quién cambió qué.

## Decisiones

| Decisión | Por qué |
|---|---|
| Correo en minúsculas y sin espacios, único: 409 «Ya existe un usuario con ese correo» | Es con lo que se inicia sesión; el login lo normaliza igual |
| Contraseña de 8 a 200 caracteres, guardada con argon2id | El mismo hash y el mismo mínimo que el administrador sembrado (`core.seed.ts`); el tope evita que argon2 procese megabytes |
| La contraseña no se edita con `PATCH`: tiene su `PUT /users/:userId/password` | El DTO de edición no la declara, así que la lista blanca la rechaza (400). Cambiarla tiene un efecto aparte: cierra las sesiones |
| El alta no recibe `isActive`: un usuario nace activo | Crear a alguien que no puede entrar no tiene uso; se desactiva después |
| Nadie se desactiva, se quita el rol `ADMIN` ni se borra a sí mismo (400) | Un administrador podría quedarse fuera por un clic. Se compara con el usuario de la sesión (`@CurrentUser()`) |
| Siempre queda al menos un `ADMIN` activo: degradar, desactivar o borrar al último es 409 | Sin un administrador activo nadie puede crear ni reactivar usuarios. Se cuentan solo los activos: uno dado de baja no puede entrar |
| Desactivar, cambiar el rol o la contraseña cierra todas sus sesiones | El rol viaja en el JWT y el refresco renovaría el acceso. La tabla de sesiones es de `auth` (invariante 3): `SessionsService.revokeAllForUser`, exportado por `AuthModule` |
| Borrado real; 409 con el detalle si tiene historial | Órdenes asignadas o registradas, notas o cambios de estado, presupuestos enviados o decididos, movimientos de stock, herramientas a su cargo, pagos recibidos o anulados (las relaciones `RESTRICT` de `User`). El mensaje sugiere desactivarlo. Sus sesiones sí se borran en cascada |
| `assignedWorkOrdersCount` con `_count` de la relación del propio `User` | Es leer el modelo de este módulo, no consultar la tabla de órdenes |
| `PUT .../password` responde `data: null` | No hay nada del usuario que cambie a la vista |

### Limitaciones conocidas

- **El acceso se corta al vencer el JWT, no al instante.** Cerrar las sesiones
  revoca el refresco: el usuario desactivado o degradado conserva su acceso (y
  su rol viejo) hasta `ACCESS_TOKEN_MINUTES` (15 min). Cortarlo al instante
  exigiría consultar la base en cada petición (hoy los guards no lo hacen).
- **Cambiarse la propia contraseña también cierra la sesión propia**: el JWT no
  dice qué sesión es la actual, así que se revocan todas. Al vencer el acceso
  hay que volver a entrar con la contraseña nueva.
- **La regla del último administrador no está protegida contra una carrera**:
  dos administradores que se desactivan uno al otro en el mismo instante
  podrían dejar al taller sin ninguno. Se comprueba antes de guardar, sin
  bloqueo; con dos o tres administradores no justifica una transacción
  serializable.

### Búsqueda y filtros

> **Pendiente de validación de quien dirige el proyecto.**

- **Búsqueda (`search`):** nombre y correo; contiene, sin distinguir
  mayúsculas.
- **Filtros:** `role` (`ADMIN`, `MECHANIC`) e `isActive` (`true`/`false`).
- **Orden:** `name` (por defecto), `createdAt` o `lastLoginAt`, con desempate
  por `userId`. En `lastLoginAt` quien nunca entró va al final en los dos
  sentidos (`nulls: 'last'`).

## Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/users?page&pageSize&search&role&isActive&sortBy&sortOrder` | Página de `User` con `meta` |
| `GET` | `/users/:userId` | `User` |
| `POST` | `/users` | `User` (201) |
| `PATCH` | `/users/:userId` | `User` |
| `PUT` | `/users/:userId/password` | `null` |
| `DELETE` | `/users/:userId` | `null` |

`User`: `userId`, `email`, `name`, `phone`, `role`, `isActive`, `lastLoginAt`,
`assignedWorkOrdersCount`, `createdAt`, `updatedAt`. Nunca el hash.

## Avance

- [x] `SessionsService.revokeAllForUser` y su export desde `AuthModule`.
- [x] Módulo `core/users`: DTO, entidad, service, controller.
- [x] Tests de service (búsqueda, orden, hash, reglas sobre uno mismo, último
  administrador, cierre de sesiones, 409 por historial) y de DTO
  (normalización, contraseña, `null` en la edición).
- [ ] Prueba del flujo real contra la API y datos de prueba: el script está
  escrito (`users-flow.mts` y `seed-users.mjs` en el scratchpad de la sesión)
  pero no se pudo correr: Postgres local no acepta conexiones.
- [ ] Validación de quien dirige el proyecto desde el frontend (funcionamiento y
  diseño). Hasta entonces no se empieza el módulo siguiente.
