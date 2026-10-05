# Movimientos de stock (kardex)

Segundo módulo del grupo `inventory` (`src/modules/inventory/stock-movements/`,
dentro de `InventoryModule`), sobre el patrón de Clientes y de Repuestos. El
modelo `StockMovement` ya existía en `inventory.prisma`: el módulo no cambia el
schema.

## Qué entra y qué no

- **Entra:** registrar compras (`PURCHASE`) y ajustes (`ADJUSTMENT`), solo
  `ADMIN`; el listado paginado del kardex con búsqueda, filtros y orden, y el
  detalle de un movimiento, para `ADMIN` y `MECHANIC` (el mecánico sin costo).
  El método `ProductsService.applyStockChange`, que es la única escritura del
  stock y del costo del producto, y `StockMovementsService.record`, que crea el
  movimiento y mueve el stock en la transacción del llamador: los dos los
  reusará el consumo en órdenes (módulo 8). Las validaciones nuevas:
  `IsMovementQuantity` (cantidad de un movimiento, con o sin signo, nunca 0)
  e `IsDateOnly` (`AAAA-MM-DD`) en `core/validation/`, y `limaDayRange`
  (`shared/lima-dates.ts`) para filtrar por días de Lima.
- **No entra:** los movimientos `WORK_ORDER` (los genera la orden de trabajo al
  agregarle un repuesto, módulo 8; por eso `StockMovementsService` todavía no
  se exporta), editar o borrar un movimiento, el saldo por fila (`stockAfter`),
  el kardex valorizado (costo promedio, valor del inventario), proveedores y
  órdenes de compra (una compra entra como movimiento, alcance del MVP),
  transferencias entre almacenes (hay uno solo), importación masiva.

## Decisiones

| Decisión | Por qué |
|---|---|
| **El stock se escribe solo con `ProductsService.applyStockChange(tx, cambio)`**, dentro de la transacción que crea el movimiento | El stock es la suma del kardex (redundancia deliberada del schema): los dos se guardan juntos o ninguno. La tabla de productos es del módulo `products` (invariante 3), así que `stock-movements` le pide el cambio a su service en vez de escribirla. `ProductsModule` exporta su service |
| **El stock nunca queda negativo**, sin bloqueos explícitos: una salida es un solo `UPDATE … SET stock = stock + Δ WHERE product_id = … AND stock >= −Δ` (`updateMany`); si no actualiza ninguna fila, 409 «Stock insuficiente: quedan X de CÓDIGO» | Comparar y descontar en la misma sentencia: con dos salidas a la vez, Postgres vuelve a evaluar el `WHERE` de la segunda cuando la primera libera la fila, así que no se pueden llevar lo mismo. Leer el stock, comparar y escribir en dos pasos sí dejaría pasar las dos |
| Compras y ajustes exigen el producto **activo** (400 «El producto está inactivo…»); el consumo en una orden (`WORK_ORDER`) no | Un producto inactivo ya no se compra ni se cuenta. Pero si se desactivó con una orden ya armada, su salida —o su devolución al quitar el ítem— tiene que poder registrarse |
| Una compra **actualiza `Product.cost`** al costo unitario de la compra | El `///` del schema: `cost` es el último costo de compra |
| `unitCost` del movimiento = el costo del producto **después** de aplicar el cambio: en una compra, el de la compra; en un ajuste (y en un consumo), el costo vigente | Así cada línea del kardex dice a qué costo entró o salió, que es lo que pide el schema para las salidas («el costo con que salió»), y una merma queda valorizada |
| `record(tx, movimiento)` es público y recibe la transacción del llamador; el tipo exige `workOrderItemId` cuando el tipo es `WORK_ORDER` | El módulo 8 creará el ítem y su salida en una sola transacción. La regla del schema (`workOrderItemId` obligatorio en `WORK_ORDER`) la impone el tipo de TypeScript, sin un chequeo en ejecución que hoy nadie podría disparar |
| **No hay edición ni borrado.** Un error se corrige con un ajuste que lo compense | El kardex es historial (modelo de datos: «Pagos, movimientos y eventos no se editan ni se borran») |
| Compra: `quantity` > 0 (`IsMovementQuantity(…, { signed: false })`; una negativa da el mismo «tiene que ser mayor que 0») y `unitCost` obligatorio con `IsMoney` (puede ser 0: un repuesto regalado por el proveedor) | La compra siempre entra; el signo lo pone el tipo |
| Ajuste: `quantity` con signo y ≠ 0, de −99999999.99 a 99999999.99; **la nota es obligatoria** (el motivo) | Un ajuste sin motivo es un número que cambió sin rastro. Un movimiento de 0 no mueve nada y solo ensucia el kardex |
| Nota de hasta 500 caracteres, recortada; en la compra, vacía → `null` | La columna no tiene tope; 500 alcanza para proveedor, factura y una línea de contexto |
| **Sin `stockAfter`** (saldo por fila) | No se guarda, y calcularlo por fila en un listado paginado y filtrado exigiría sumar todo el kardex anterior del producto. Si hace falta, sería una vista de kardex de **un** producto, ordenada por fecha, calculada en la consulta |
| `quantity` sale como texto con dos decimales y su signo («-2.50»); `unitCost` (texto o `null`) solo para `ADMIN`, como el costo de `Product` | Los `Decimal` salen con `toFixed(2)`. El mecánico consulta el kardex pero no ve costos (alcance del MVP) |
| El producto (`productId`, `code`, `name`, `unit`) y quien registró (`userId`, `name`) se leen con `include` de las relaciones del propio movimiento | Es leer el modelo de este módulo, como el cliente resumido de un vehículo; la unidad dice en qué se mide la cantidad |
| Las fechas `from` y `to` son días `AAAA-MM-DD` de **Lima** (UTC−5 fijo, sin horario de verano): `from` desde las 00:00 de Lima, `to` inclusivo hasta antes de las 00:00 del día siguiente. `from` posterior a `to` → 400 | «Los movimientos del 4» son los del 4 en el taller, no en UTC: un movimiento de las 20:00 del 4 queda guardado el 5 a la 01:00 UTC |

### A validar por quien dirige el proyecto

- **Compras y ajustes de un producto inactivo: no se permiten.** Para
  registrar una devolución al proveedor de un producto ya desactivado habría
  que activarlo un momento. ¿Se permite el ajuste de un inactivo?
- **El costo de una compra reemplaza al del producto** (último costo, como dice
  el schema), no un costo promedio. Con compras a precios distintos, el margen
  sale contra la última.
- **Costo unitario 0 en una compra: se acepta** (un repuesto que regala el
  proveedor).
- **Sin saldo por fila.** El kardex muestra entradas y salidas; el stock actual
  está en Repuestos.

### Búsqueda y filtros

> **Pendiente de validación de quien dirige el proyecto.**

- **Búsqueda (`search`):** código y nombre del producto, y la nota; contiene,
  sin distinguir mayúsculas.
- **Filtros:** tipo (`type`: `PURCHASE`, `WORK_ORDER`, `ADJUSTMENT`), producto
  (`productId`) y rango de días (`from`, `to`, en `AAAA-MM-DD`, días de Lima,
  `to` inclusivo).
- **Orden:** `createdAt` descendente por defecto (lo más reciente primero), o
  `quantity`; desempate por `stockMovementId`. No se ordena por costo: el
  mecánico no lo ve.

## Endpoints

| Método | Ruta | Roles | Respuesta |
|---|---|---|---|
| `GET` | `/stock-movements?page&pageSize&search&type&productId&from&to&sortBy&sortOrder` | `ADMIN`, `MECHANIC` | Página de `StockMovement` con `meta` |
| `GET` | `/stock-movements/:stockMovementId` | `ADMIN`, `MECHANIC` | `StockMovement` |
| `POST` | `/stock-movements/purchases` | `ADMIN` | `StockMovement` (201) «Compra registrada» |
| `POST` | `/stock-movements/adjustments` | `ADMIN` | `StockMovement` (201) «Ajuste registrado»; 409 si deja el stock negativo |

`StockMovement`: `stockMovementId`, `type`, `quantity` (texto con signo,
«-2.50»), `unitCost` (texto o `null`, solo `ADMIN`), `note`,
`workOrderItemId`, `product` (`productId`, `code`, `name`, `unit`),
`createdBy` (`userId`, `name`), `createdAt`.

Errores de las altas: 400 por validación o producto inactivo, 404 «No se
encontró el producto», 409 «Stock insuficiente: quedan X de CÓDIGO».

## Avance

- [x] `IsMovementQuantity` (con `decimalError` aceptando el signo con
  `signed`) e `IsDateOnly` en `core/validation/`; `limaDayRange` en
  `shared/lima-dates.ts`.
- [x] `ProductsService.applyStockChange` (atómico, no negativo, costo en la
  compra, activo salvo en `WORK_ORDER`) y `ProductsModule` exporta su service.
- [x] Módulo `inventory/stock-movements`: DTO, entidades, service con
  `record`, controller, en `InventoryModule`.
- [x] Tests: `applyStockChange` (incremento atómico, condición de stock en la
  misma sentencia, 409 con lo que queda, 404, inactivo, consumo sin exigir
  activo, costo solo en la compra), service (búsqueda, filtros, rango de días
  de Lima, rango invertido, paginación y desempate, 404, compra y ajuste en la
  misma transacción con su costo, consumo con su ítem en la transacción del
  llamador), DTO (compra > 0 y costo obligatorio, ajuste ≠ 0 con signo y
  motivo obligatorio, query con fechas reales), entidad (costo solo para
  `ADMIN`, signo y dos decimales) y `limaDayRange`.
- [x] Patrón «transacción con stock» en la skill `estructura-backend`.
- [ ] Prueba del flujo real contra la API: el script está escrito
  (`stock-movements-flow.mjs`, con salidas simultáneas para comprobar que el
  stock no queda negativo) pero no se pudo correr: Postgres local no acepta
  conexiones.
- [ ] Datos de prueba: `seed-stock-movements.mjs` (una compra por producto
  activo, cuatro ajustes) escrito, sin correr por la misma razón.
- [ ] Validación de quien dirige el proyecto desde el frontend (funcionamiento y
  diseño). Hasta entonces no se empieza el módulo siguiente.
