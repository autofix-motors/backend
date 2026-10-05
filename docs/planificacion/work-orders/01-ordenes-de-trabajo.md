# Órdenes de trabajo

Segundo módulo del grupo `workshop` (`src/modules/workshop/work-orders/`,
dentro de `WorkshopModule`), sobre el patrón de Clientes. Los modelos
`WorkOrder` y `WorkOrderEvent` ya existían en `workshop.prisma`: el módulo no
cambia el schema ni tiene migración.

## Qué entra y qué no

- **Entra:** la orden y su línea de tiempo. Alta (solo `ADMIN`) con el cliente
  congelado del dueño del vehículo, el código de seguimiento y el evento
  `RECEIVED`; listado paginado con búsqueda y filtros y detalle con los
  eventos, para `ADMIN` y el mecánico (solo las suyas); edición y asignación
  (`ADMIN`); diagnóstico, cambios de estado y notas públicas o internas
  (`ADMIN` o el mecánico asignado); borrado real de una orden sin historial.
  `VehiclesModule` ahora exporta `VehiclesService`.
- **No entra:** ítems (servicios y repuestos, módulo 8), presupuestos y el
  estado `WAITING_APPROVAL` (módulo 9), seguimiento público (módulo 10), pagos
  (módulo 11), constancia impresa, enlace de WhatsApp, totales, fotos. No hay
  secciones vacías ni código para ellos.

## Decisiones

| Decisión | Por qué |
|---|---|
| El cliente se congela del **dueño actual** del vehículo, que tiene que estar activo (400 «El dueño del vehículo está inactivo: actívalo antes de registrarle una orden»). Se leen con `VehiclesService.findOne` y `CustomersService.findOne` | Lo dice el schema: si el vehículo cambia de dueño, la orden sigue siendo de quien la pidió. Invariante 3: este módulo no lee las tablas de vehículos ni de clientes |
| **Una orden abierta por vehículo**: si ya tiene una que no está entregada ni cancelada, 409 «El vehículo ya tiene abierta la orden OT-000123: ciérrala o cancélala antes de registrar otra» | Dos órdenes abiertas repartirían el trabajo y los cobros entre dos. Se comprueba antes de crear (sin índice parcial en la base: dos altas simultáneas del mismo vehículo podrían pasar; es improbable en un taller) |
| El mecánico asignado es **cualquier usuario activo** (400 si está inactivo, 404 si no existe), verificado con `UsersService`. Si no cambia, no se vuelve a verificar | Como en herramientas: el dueño que trabaja en el taller también puede llevar una orden. Editar una orden no puede fallar porque su mecánico se desactivó después |
| `trackingCode` = `AFM-` + 6 símbolos de `23456789ABCDEFGHJKMNPQRSTUVWXYZ` con `crypto.randomInt`; ante un P2002 se sortea otro, hasta 5 veces | Sin 0/O ni 1/I/L, que se confunden al dictarlo. `crypto` y no `Math.random`, que es predecible: el código es la llave de la página pública. 887 millones de códigos: dos choques seguidos son prácticamente imposibles |
| El evento `RECEIVED` («Vehículo recibido en el taller», público), el de reasignación y el de cada cambio de estado van **anidados en la misma escritura** de la orden (`events: { create }`) | Prisma escribe la orden y su evento en una sola transacción: no hay orden sin su «Recibido» ni cambio de estado sin su evento |
| Las transiciones son una **tabla pura** (`MANUAL_TRANSITIONS` en `work-order-status.ts`) con `canTransition(from, to, role)`, probada par por par para los dos roles. Fuera de la tabla, 409 «Una orden en «X» no puede pasar a «Y»»; en la tabla pero no para el rol, 403 | Una sola fuente para la API; el frontend tiene una copia para dibujar los botones, con el mismo test |
| El mecánico lleva su orden **a** `DIAGNOSIS`, `IN_PROGRESS`, `WAITING_PARTS` o `READY` (desde el estado que la tabla permita, también desde `RECEIVED`); `DELIVERED` y `CANCELLED` solo `ADMIN` | Es el trabajo del taller; entregar y cancelar tocan al cliente y a la caja |
| **`WAITING_APPROVAL` no se pide a mano**: desde `DIAGNOSIS` no se ofrece, y desde `WAITING_APPROVAL` solo se cancela. El módulo 9 lo extiende así: enviar un presupuesto lleva DIAGNOSIS → WAITING_APPROVAL y registrar la decisión lleva a IN_PROGRESS (aprobado) o DIAGNOSIS (rechazado), **desde el service de presupuestos**, en su transacción, con su regla y creando el mismo `WorkOrderEvent`. La tabla queda para los botones; si alguna de esas salidas se quiere también a mano, se agrega a la tabla (y a la copia del frontend) con su test | Así lo dice el alcance: la aprobación la registra el administrador con la respuesta del cliente, no un botón de estado |
| `READY → IN_PROGRESS` es el **retrabajo** | El cliente encontró algo al recoger |
| Cambiar de estado escribe con el estado leído en el `where` (`{ workOrderId, status: from }`); si otro lo cambió entre medio, 409 «La orden cambió de estado mientras tanto: vuelve a cargarla» | Dos personas moviendo la misma orden no se pisan en silencio |
| Cancelar exige la nota (400 «Indica el motivo de la cancelación en la nota») y la guarda también en `cancelReason`, con `cancelledAt`; entregar llena `deliveredAt`. `isPublic` es `true` por defecto en los cambios de estado | Reglas de `01-modelo-de-datos.md`. El cambio de estado es lo que el cliente sigue |
| Una nota es un evento sin estado; `isPublic` **obligatorio** en la nota. Se puede anotar también en una orden cerrada | Que el cliente la vea es una decisión, no un valor por omisión. Después de entregar todavía pasan cosas (una llamada, una garantía) |
| El diagnóstico se escribe en `RECEIVED`, `DIAGNOSIS`, `IN_PROGRESS` y `WAITING_PARTS` (409 en los demás). `PUT` con la clave obligatoria; `null` o vacío lo borran | Esperando aprobación, el cliente evalúa un presupuesto armado sobre ese diagnóstico; listo o cerrada, el trabajo terminó. La clave obligatoria evita que un cuerpo vacío lo borre |
| Una orden **entregada o cancelada no se edita** (409 «La orden ya se entregó / está cancelada: no se puede editar»); el vehículo no se cambia nunca (no está en el DTO de edición) | La orden cerrada es historial. Un vehículo equivocado se cancela o se borra y se registra otra |
| La fecha prometida (`AAAA-MM-DD`) **no puede ser anterior a hoy en Lima**, pero al editar solo se valida si cambia | Una orden ya vencida se tiene que poder seguir editando sin moverle la fecha |
| El mecánico ve **solo las suyas**: en el listado el service fuerza `mechanicId` al de la sesión; en el detalle y en cada acción, una orden ajena da **404** «No se encontró la orden de trabajo» | Un 403 confirmaría que la orden existe |
| **Borrado real** solo sin ítems, presupuestos ni pagos (409 «No se puede eliminar: la orden tiene 2 ítems y 1 pago. Puedes cancelarla»). Los eventos caen en cascada | Es para la orden registrada por error. Los eventos son de la orden; ítems, presupuestos y pagos son historial (RESTRICT) |
| `isOverdue` sale calculado: fecha prometida anterior a hoy en Lima y la orden no entregada ni cancelada. La fecha prometida sale como `AAAA-MM-DD` | El mismo día prometido todavía no vence. Nuevo `limaToday()` en `shared/lima-dates.ts` y `toDateColumn`/`fromDateColumn` en `shared/date-column.ts` para la columna `@db.Date` |
| Toda acción sobre una orden responde la orden completa (`WorkOrderDetail`, con eventos). `WorkOrderDetail` extiende la entidad `WorkOrder` del listado | La pantalla se actualiza con la respuesta, sin volver a pedirla. Es el mismo recurso con más campos: extender una clase concreta con `super(order)` no tiene el problema de la base abstracta que describe la skill |

### A validar por quien dirige el proyecto

- **El mecánico puede iniciar el diagnóstico o la reparación desde
  `RECEIVED`.** La regla dice que se mueve «entre DIAGNOSIS, IN_PROGRESS,
  WAITING_PARTS y READY»; se interpretó como los estados a los que puede
  llevar la orden.
- **Desde `READY` no se cancela** (la tabla pedida solo da DELIVERED e
  IN_PROGRESS), aunque el alcance dice «CANCELLED desde cualquier estado antes
  de DELIVERED». Si se quiere, es una línea en la tabla y en su copia.
- **Asignar a cualquier usuario activo**, no solo a mecánicos.
- **Notas en órdenes cerradas** sí se permiten.
- **Una orden abierta por vehículo**, sin índice en la base.

### Búsqueda y filtros

> **Pendiente de validación de quien dirige el proyecto.**

- **Búsqueda (`search`):** número de orden (si el texto es `123`, `OT-000123`
  u `ot123`), placa (normalizada: «abk-5» encuentra «ABK582»), nombre del
  cliente y código de seguimiento; contiene, sin distinguir mayúsculas.
- **Filtros:** `status` (uno o varios separados por coma), `mechanicId` (solo
  `ADMIN`: al mecánico se le fuerza el suyo), `vehicleId` y `customerId` (para
  «Ver órdenes» desde Vehículos y Clientes), `overdue=true|false` (vencidas) y
  `from`/`to` sobre el día de ingreso en Lima (`to` inclusivo). Se combinan:
  vencidas y un estado dan las vencidas de ese estado.
- **Orden:** `receivedAt` descendente por defecto, `promisedDate` (sin fecha
  al final en los dos sentidos) o `number`; desempate por `workOrderId`.

## Endpoints

| Método | Ruta | Roles | Respuesta |
|---|---|---|---|
| `GET` | `/work-orders?page&pageSize&search&status&mechanicId&vehicleId&customerId&overdue&from&to&sortBy&sortOrder` | `ADMIN`, `MECHANIC` (las suyas) | Página de `WorkOrder` con `meta` |
| `GET` | `/work-orders/:workOrderId` | `ADMIN`, mecánico asignado | `WorkOrderDetail` |
| `POST` | `/work-orders` | `ADMIN` | `WorkOrderDetail` (201) «Orden de trabajo registrada» |
| `PATCH` | `/work-orders/:workOrderId` | `ADMIN` | `WorkOrderDetail` «Orden de trabajo actualizada» |
| `PUT` | `/work-orders/:workOrderId/diagnosis` | `ADMIN`, mecánico asignado | `WorkOrderDetail` «Diagnóstico guardado» / «Diagnóstico borrado» |
| `POST` | `/work-orders/:workOrderId/status` | `ADMIN`, mecánico asignado | `WorkOrderDetail` (200) «Orden en «En reparación»» |
| `POST` | `/work-orders/:workOrderId/notes` | `ADMIN`, mecánico asignado | `WorkOrderDetail` (201) «Nota agregada (la ve el cliente)» / «Nota interna agregada» |
| `DELETE` | `/work-orders/:workOrderId` | `ADMIN` | `null` «Orden de trabajo eliminada»; 409 con ítems, presupuestos o pagos |

`WorkOrder`: `workOrderId`, `number`, `trackingCode`, `status`, `mileageIn`,
`reason`, `promisedDate`, `receivedAt`, `deliveredAt`, `isOverdue`, `vehicle`
(`vehicleId`, `plate`, `brand`, `model`), `customer` (`customerId`, `name`,
`phone`), `mechanic` (`userId`, `name` o `null`). `WorkOrderDetail` suma
`diagnosis`, `cancelledAt`, `cancelReason`, `createdBy` (`userId`, `name`) y
`events` (`workOrderEventId`, `status` o `null`, `note`, `isPublic`,
`createdBy`, `createdAt`), del más antiguo al más reciente.

## Avance

- [x] `VehiclesModule` exporta `VehiclesService`.
- [x] `limaToday()` y `toDateColumn`/`fromDateColumn` en `shared/`, con tests.
- [x] Módulo `workshop/work-orders`: tabla de transiciones, códigos, DTO,
  entidades, service, controller, en `WorkshopModule`.
- [x] Tests: transiciones par por par para los dos roles (134 casos con las vencidas), código de
  seguimiento (alfabeto, fuente aleatoria, reintento ante P2002 y tope),
  número de orden, vencidas; service (`where` de búsqueda, filtros,
  vencidas en hora de Lima y su combinación con el estado, orden, mecánico
  forzado, 404 al mecánico ajeno, cliente congelado, dueño y mecánico
  inactivos, fecha pasada, orden abierta repetida, eventos de reasignación,
  cierre, cancelación, entrega, cambio simultáneo, borrado con historial);
  DTO (alta, edición con `null`, estado, nota, diagnóstico, query) y
  entidades. 211 tests del módulo; 484 del backend en total.
- [ ] Prueba del flujo real contra la API: el script está escrito
  (`work-orders-flow.mjs`, 65 comprobaciones) pero no se pudo correr:
  Postgres local no acepta conexiones.
- [ ] Datos de prueba: `seed-work-orders.mjs` (15 órdenes en todos los estados
  que se alcanzan a mano, con diagnóstico, notas públicas e internas,
  vencidas, entregadas y canceladas) escrito, sin correr por la misma razón.
  `WAITING_APPROVAL` no se puede sembrar hasta el módulo de presupuestos.
- [ ] Validación de quien dirige el proyecto desde el frontend (funcionamiento y
  diseño). Hasta entonces no se empieza el módulo siguiente.
