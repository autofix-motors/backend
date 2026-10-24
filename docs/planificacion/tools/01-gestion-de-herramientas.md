# Herramientas

Tercer módulo del grupo `inventory` (`src/modules/inventory/tools/`, dentro de
`InventoryModule`), sobre el patrón de Clientes y de Repuestos. El modelo
`Tool` ya existía en `inventory.prisma`: el módulo no cambia el schema.

## Qué entra y qué no

- **Entra:** el listado paginado con búsqueda, filtros y orden, y el detalle,
  para `ADMIN` y `MECHANIC`; alta, edición, borrado real y la entrega o
  devolución rápida (`PUT /tools/:toolId/assignment`), solo `ADMIN`. La
  verificación de quien recibe la herramienta con `UsersService`, que
  `UsersModule` ahora exporta.
- **No entra:** historial de préstamos (quién la tuvo antes y cuándo: el
  schema no lo guarda, alcance del MVP), devolver solas las herramientas de un
  mecánico al desactivarlo, stock o cantidades (una herramienta es una pieza
  con su código), costo o depreciación, fotos, importación masiva.

## Decisiones

| Decisión | Por qué |
|---|---|
| **Solo una herramienta operativa (`AVAILABLE`) está asignada.** Al pasar a reparación o de baja vuelve **sola** al almacén (`assignedToId = null`); pedir en el mismo cambio que quede asignada, o asignar una que ya está en reparación o de baja, es **400** («Una herramienta en reparación no se puede asignar: márcala como operativa cuando vuelva» / «Una herramienta de baja no se puede asignar») | Quien la manda a reparar o la da de baja ya la recibió de vuelta: obligar a devolverla antes sería un paso de más. Pero pedir explícitamente las dos cosas a la vez es una contradicción, y se dice en vez de elegir una en silencio |
| **Solo se asigna a un usuario activo**, de cualquier rol (400 «El usuario está inactivo…»; 404 «No se encontró el usuario» si no existe). Se verifica con `UsersService.findOne` | Invariante 3: este módulo no lee la tabla de usuarios. Cualquier rol, porque un administrador también puede tener una herramienta (el dueño que trabaja en el taller) |
| Si no cambia quién la tiene, no se vuelve a verificar al usuario | Editar el nombre o las notas de una herramienta no puede fallar porque su mecánico se desactivó después |
| `PUT /tools/:toolId/assignment` con `{ assignedToId: uuid \| null }` (clave obligatoria) para la acción rápida, además de `assignedToId` en `PATCH` | La acción rápida del listado responde con un mensaje que dice qué pasó («Herramienta asignada a Jorge Ccori Flores» / «Herramienta devuelta al almacén»). La clave es obligatoria para que un cuerpo vacío no la devuelva por omisión. Las dos rutas pasan por la misma regla del service |
| **Borrado real, pero 409 si alguien la tiene**: «No se puede eliminar: la tiene X. Primero devuélvela al almacén» | Nada en el schema referencia a la herramienta, así que la base no lo impide; pero borrar una que físicamente está en manos de un mecánico perdería el rastro de dónde está. Para lo que ya no se usa existe «De baja» |
| Código en mayúsculas y sin espacios en los extremos, hasta 30; único (409 «Ya existe una herramienta con ese código», traducido del P2002) | Es la etiqueta pegada en la herramienta: «her-01» y «HER-01» son la misma |
| `status` es opcional al crear (nace `AVAILABLE`) pero **no anulable**: `@ValidateIf(valor !== undefined)` en vez de `@IsOptional` | Con `@IsOptional`, un `{ "status": null }` pasaría sin validar y la base lo rechazaría con un 500 |
| Notas hasta 1000 caracteres; marca hasta 60; vacías → `null` | Igual que en Clientes y Repuestos |
| Quien la tiene sale como `assignedTo: { userId, name } \| null`, leído con `include` de la relación de la propia herramienta | Es leer el modelo de este módulo, como el cliente resumido de un vehículo. Solo el nombre: nada de la cuenta del usuario |
| Un usuario con herramientas a su cargo no se puede borrar (ya lo decía `UsersService.remove`: «1 herramienta a su cargo») | La relación es `RESTRICT`; desactivarlo sí se puede, y la herramienta sigue a su nombre hasta que se devuelva |

### A validar por quien dirige el proyecto

- **Asignar a cualquier usuario activo**, no solo a mecánicos.
- **Darla de baja o mandarla a reparar la devuelve sola al almacén.** La
  alternativa era exigir devolverla antes (un 400 más).
- **Borrar una herramienta asignada: 409.** Sin historial en el schema, se
  podría borrar sin más; se eligió exigir que vuelva al almacén.
- **Desactivar a un mecánico no le quita sus herramientas**: siguen a su nombre
  (y el filtro las muestra) hasta que el administrador las devuelva.

### Búsqueda y filtros

> **Pendiente de validación de quien dirige el proyecto.**

- **Búsqueda (`search`):** código, nombre y marca; contiene, sin distinguir
  mayúsculas.
- **Filtros:** estado (`status`: `AVAILABLE`, `IN_REPAIR`, `RETIRED`), quién
  la tiene (`assignedToId`) y ubicación (`isAssigned`: `true` asignadas,
  `false` en el almacén). Se combinan: `assignedToId` con `isAssigned=false`
  no devuelve nada.
- **Orden:** `code` ascendente por defecto, `name` o `status` (en el orden del
  enum: operativa, en reparación, de baja); desempate por `toolId`.

## Endpoints

| Método | Ruta | Roles | Respuesta |
|---|---|---|---|
| `GET` | `/tools?page&pageSize&search&status&assignedToId&isAssigned&sortBy&sortOrder` | `ADMIN`, `MECHANIC` | Página de `Tool` con `meta` |
| `GET` | `/tools/:toolId` | `ADMIN`, `MECHANIC` | `Tool` |
| `POST` | `/tools` | `ADMIN` | `Tool` (201) «Herramienta registrada» |
| `PATCH` | `/tools/:toolId` | `ADMIN` | `Tool` «Herramienta actualizada» |
| `PUT` | `/tools/:toolId/assignment` | `ADMIN` | `Tool` «Herramienta asignada a X» / «Herramienta devuelta al almacén» |
| `DELETE` | `/tools/:toolId` | `ADMIN` | `null` «Herramienta eliminada»; 409 si alguien la tiene |

`Tool`: `toolId`, `code`, `name`, `brand`, `status`, `notes`, `assignedTo`
(`{ userId, name }` o `null`), `createdAt`, `updatedAt`.

## Avance

- [x] `UsersModule` exporta `UsersService`.
- [x] Módulo `inventory/tools`: DTO (alta, edición, asignación, listado),
  entidades, service, controller, en `InventoryModule`.
- [x] Tests: service (búsqueda, filtros y su combinación, paginación y
  desempate, P2002 → 409, asignación según estado y usuario activo, vuelta
  sola al almacén, sin volver a verificar si no cambia, 404, 409 al borrar una
  asignada), DTO (código en mayúsculas, topes, vacíos a null, `status` y
  `name` null en la edición, clave obligatoria en la asignación, query) y
  entidad (`assignedTo` sin datos de la cuenta). 41 tests.
- [ ] Prueba del flujo real contra la API: el script está escrito
  (`tools-flow.mjs`, 47 comprobaciones) pero no se pudo correr: Postgres local
  no acepta conexiones.
- [ ] Datos de prueba: `seed-tools.mjs` (16 herramientas, 7 asignadas a los
  mecánicos de `seed-users.mjs`, una en reparación y una de baja) escrito, sin
  correr por la misma razón.
- [ ] Validación de quien dirige el proyecto desde el frontend (funcionamiento y
  diseño). Hasta entonces no se empieza el módulo siguiente.
