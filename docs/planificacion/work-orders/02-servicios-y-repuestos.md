# Servicios y repuestos de una orden

Módulo 8. Los ítems de la orden de trabajo (`WorkOrderItem`, que ya existía en
`workshop.prisma`): lo que se hace y se cobra, servicios del catálogo y
repuestos del inventario. Sin migración: el schema solo cambió el `///` de
`StockMovement.workOrderItemId` (la devolución, abajo), que no toca la base.

Viven **dentro del módulo `work-orders`** (`work-order-items.service.ts`, sus
DTO y entidades, y los endpoints en `WorkOrdersController`), no en un
`work-order-items/` propio: el ítem es parte de la orden (se borra con ella,
su total es el de ella), el detalle de la orden los lee con su `include`, y
cada cambio responde la orden completa. Como módulo aparte, `work-orders`
necesitaría su service para el detalle y él el de `work-orders` para saber
quién ve la orden: una dependencia circular para un solo agregado.

## Qué entra y qué no

- **Entra:** agregar (`POST`), editar (`PATCH`) y quitar (`DELETE`) servicios y
  repuestos, para `ADMIN` y el mecánico asignado; el repuesto descuenta el
  stock al agregarse y lo devuelve al quitarse, con su movimiento de kardex en
  la misma transacción; el detalle de la orden con `items` y `totals`, y el
  `total` en el listado. Se corrige además la tabla de estados del módulo 7:
  `READY → CANCELLED` (commit aparte, ver el plan `01`).
- **No entra:** presupuestos (módulo 9: tomarán la foto de estos ítems),
  descuentos, impuestos (IGV), pagos y saldo (módulo 11), reportes de margen,
  reservar stock sin consumirlo, cambiar la cantidad de un repuesto ya
  agregado, ordenar los ítems a mano, agregar ítems a una orden lista,
  entregada, cancelada o esperando aprobación.

## Decisiones

| Decisión | Por qué |
|---|---|
| Se agregan, editan y quitan solo en `RECEIVED`, `DIAGNOSIS`, `IN_PROGRESS` y `WAITING_PARTS` (`ITEM_STATUSES` y `canChangeItems` en `work-order-status.ts`, con copia en el frontend). En los demás, 409 «Los servicios y repuestos no se pueden cambiar con la orden en «Listo para recoger»» | Esperando aprobación el cliente evalúa un presupuesto armado con esos ítems; lista o cerrada, lo que se cobra ya no se mueve |
| Toda escritura va con el estado leído en el `where` del evento (`{ workOrderId, status }`), dentro de la transacción: si la orden cambió de estado entre medio, P2025 → 409 «La orden cambió de estado mientras tanto», y el ítem y el stock se deshacen | El mismo criterio que el cambio de estado: no se agrega un repuesto a una orden que otro acaba de entregar |
| **Servicio:** copia `description` (el nombre del catálogo) y `unitPrice` (`laborPrice`); `quantity` por omisión 1. **Repuesto:** copia «código · nombre», `unitPrice` (`price`) y `unitCost` (el `cost` vigente, congelado). El original tiene que existir (404) y estar activo (400) | Lo dice el schema: lo que se cobra no cambia si después se renombra o se sube el precio del original, y el margen no cambia con la siguiente compra. Se leen con `ServiceCatalogService.findOne` y `ProductsService.findOne` (invariante 3); `ServiceCatalogModule` y `StockMovementsModule` ahora exportan su service |
| `unitPrice` y `description` propios **solo `ADMIN`**: si el mecánico los manda, **403** «Solo el administrador fija el precio o la descripción de un ítem», y no se guarda nada | Lo que se cobra es una decisión de la caja. 403 y no ignorarlos, para que el mecánico sepa que lo que escribió no se guardó; es el mismo código que el resto del módulo usa para «en la tabla, pero no para tu rol» |
| Un ítem es una cosa o la otra: `serviceCatalogItemId` obligatorio en `SERVICE` y `productId` en `PRODUCT` (DTO), y el del otro tipo da 400 (service) | Regla de `01-modelo-de-datos.md` que el schema no puede declarar |
| **Agregar un repuesto** crea el ítem y llama a `StockMovementsService.record(tx, { type: 'WORK_ORDER', quantity: -q, workOrderItemId, note: 'Consumo en OT-000123' })` en una sola `$transaction`. Si no alcanza, `applyStockChange` lanza 409 «Stock insuficiente: quedan X de CÓDIGO» y no queda ni el ítem ni el movimiento | El patrón «Transacción con stock» de la skill: el stock nunca queda negativo (se compara y descuenta en la misma sentencia) y no hay ítem sin su salida. La orden va en la nota porque, si el ítem se quita, el movimiento pierde su `workOrderItemId` (SetNull) |
| **La cantidad de un repuesto no se edita** (400 «quítalo y vuelve a agregarlo con la cantidad correcta»). Del repuesto, el administrador sí cambia precio y descripción | Un ítem mueve stock una sola vez (`workOrderItemId` es único en el kardex): editar la cantidad obligaría a un segundo movimiento del mismo ítem |
| **Quitar un repuesto** borra el ítem y registra, en la misma transacción, un movimiento **`WORK_ORDER` positivo, sin ítem**, con la nota «Devolución: ítem quitado de OT-000123». El consumo original queda en el kardex con `workOrderItemId` en null (SetNull) | No es un `ADJUSTMENT`: no corrige el inventario, deshace un consumo, y un reporte de consumo por órdenes (WORK_ORDER) tiene que dar el neto. Además el ajuste exige el producto activo, y un repuesto desactivado después de usarse se tiene que poder devolver (lo que ya anticipaba `applyStockChange`). Por eso `NewStockMovement` acepta `WORK_ORDER` sin ítem **solo con nota obligatoria**, y el `///` del schema y `01-modelo-de-datos.md` dicen ahora «obligatorio en la salida». El `delete` va primero: si otro ya lo quitó, P2025 → 404 y el stock no vuelve dos veces |
| Cada cambio deja un **evento interno** en la línea de tiempo: «Se agregó: 2 × FA-TOY-90915 · Filtro… (S/ 35.00 c/u)», «Se modificó «…»: cantidad 1 → 2, precio S/ 80.00 → S/ 90.00», «Se quitó: … (vuelve al stock)». Una edición sin cambios no escribe ni anota | Quién movió qué y cuándo, sobre todo la plata y el stock. Interno: el cliente verá el total en el presupuesto, no cada línea que se movió |
| Montos con **Decimal**, nunca `number` (`work-order-totals.ts`): subtotal = cantidad × precio **redondeado a céntimos** (medio céntimo hacia arriba), y los totales suman esos subtotales ya redondeados. `labor` (servicios), `parts` (repuestos), `total`; para `ADMIN`, `partsCost` (cantidad × costo, redondeado por línea) y `partsMargin` (`parts − partsCost`). Todo sale como texto `toFixed(2)` | 1.25 L a S/ 38.90 son S/ 48.63; si se sumara sin redondear por línea, el total podría no cuadrar con lo que se ve línea por línea |
| `unitCost`, `partsCost` y `partsMargin` solo para `ADMIN` (la clave no aparece para el mecánico), con `WorkOrderDetail(order, { includeCosts })` | Como en Repuestos: el mecánico no ve costos ni márgenes (alcance del MVP) |
| El listado trae `total` por orden: `include` de los ítems con solo `type`, `quantity` y `unitPrice` | Es una consulta más por página (Prisma trae los ítems de todas las órdenes de la página juntos), sin SQL a mano ni guardar el total en la orden (el schema lo prohíbe: serían dos verdades). No se ordena ni filtra por total |
| `DELETE` del ítem responde 200 con `data: null` (regla del proyecto); `POST` y `PATCH` responden la orden completa | El frontend vuelve a pedir el detalle tras quitar |
| La unidad del repuesto (`unit`) sale en cada ítem, leída por la relación del propio ítem | La cantidad sin unidad no dice nada («2» ¿qué?) |

### A validar por quien dirige el proyecto

- **El mecánico agrega servicios, no solo repuestos.** El alcance dice que el
  mecánico «agrega los repuestos consumidos»; el pedido del módulo le da
  también los servicios (al precio del catálogo) y quitar ítems.
- **El mecánico que manda precio o descripción recibe 403** (no se ignora).
- **La devolución es `WORK_ORDER` y no `ADJUSTMENT`** (motivo arriba).
- **Ítems en `RECEIVED`**: se pueden agregar desde que se recibe el vehículo.
- **Nada impide marcar lista o entregar una orden sin ítems.** Hoy es solo
  costumbre (los datos de prueba los cargan antes); si se quiere como regla,
  es una validación en el cambio de estado.
- **Redondeo por línea** (medio céntimo hacia arriba).

### Búsqueda y filtros

No hay listado propio: los ítems salen completos en el detalle de su orden,
en el orden en que se agregaron (`createdAt`, desempate por id). El listado de
órdenes suma `total`, sin filtro ni orden por él.

> **Pendiente de validación de quien dirige el proyecto.** Si hace falta
> filtrar órdenes por monto (por ejemplo, para cobranzas), se agregaría con los
> pagos.

## Endpoints

| Método | Ruta | Roles | Respuesta |
|---|---|---|---|
| `POST` | `/work-orders/:workOrderId/items` | `ADMIN`, mecánico asignado | `WorkOrderDetail` (201) «Servicio agregado» / «Repuesto agregado»; 400 inactivo o datos del otro tipo, 403 precio del mecánico, 404, 409 estado o stock insuficiente |
| `PATCH` | `/work-orders/:workOrderId/items/:workOrderItemId` | `ADMIN`, mecánico asignado | `WorkOrderDetail` «Ítem actualizado»; 400 cantidad de un repuesto, 403, 404, 409 estado |
| `DELETE` | `/work-orders/:workOrderId/items/:workOrderItemId` | `ADMIN`, mecánico asignado | `null` «Ítem quitado de la orden»; 404, 409 estado |

Cuerpo de `POST`: `type` (`SERVICE` | `PRODUCT`), `serviceCatalogItemId` o
`productId`, `quantity` (texto o número, > 0, hasta 2 decimales; por omisión
1), y solo `ADMIN`: `unitPrice`, `description` (hasta 200). `PATCH`: `quantity`
(solo servicios), `unitPrice` y `description` (solo `ADMIN`).

`WorkOrder` (listado) suma `total`. `WorkOrderDetail` suma `items`
(`workOrderItemId`, `type`, `description`, `quantity`, `unit` o `null`,
`unitPrice`, `subtotal`, `unitCost` solo `ADMIN`, `serviceCatalogItemId`,
`productId`, `createdAt`) y `totals` (`labor`, `parts`, `total`; `partsCost` y
`partsMargin` solo `ADMIN`).

## Avance

- [x] Corrección del módulo 7: `READY → CANCELLED` en la tabla y su copia del
  frontend, con sus tests; plan `01` actualizado (commit aparte).
- [x] `ServiceCatalogModule` y `StockMovementsModule` exportan su service;
  `NewStockMovement` acepta la devolución `WORK_ORDER` sin ítem y con nota.
- [x] `work-order-totals.ts` (Decimal), `ITEM_STATUSES`, DTO, entidades
  (`WorkOrderItem`, `WorkOrderTotals`), `WorkOrderItemsService` y los tres
  endpoints; detalle con ítems y montos, listado con `total`.
- [x] Tests: montos con Decimal (redondeo por línea, 0.1 + 0.2, costo y
  margen), permisos (mecánico sin precios, 403; otro mecánico, 404), estados
  (409 en cada uno de los no permitidos, cambio simultáneo), stock
  insuficiente (409 y la transacción no anota nada), devolución al quitar
  (movimiento positivo sin ítem y con nota; P2025 sin devolver dos veces),
  cantidad de repuesto no editable, DTO (null, campos de más, tipo), entidad
  (costo solo `ADMIN`) y el `record` de la devolución. 532 tests del backend.
- [ ] Prueba del flujo real contra la API: el script está escrito
  (`work-order-items-flow.mjs`, 44 comprobaciones contra la base real; 41 de
  41 pasan contra la API simulada `work-order-items-mock-api.mjs`, que no
  imita el kardex) pero no se pudo correr: Postgres local no acepta
  conexiones.
- [ ] Datos de prueba: `seed-work-orders.mjs` ahora agrega servicios y
  repuestos a las órdenes sembradas antes de cada estado (las listas y
  entregadas los tienen, una con un repuesto quitado), sin dejar stock
  negativo. Sin correr por la misma razón.
- [ ] Validación de quien dirige el proyecto desde el frontend (funcionamiento y
  diseño). Hasta entonces no se empieza el módulo siguiente.
