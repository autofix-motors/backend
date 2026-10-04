# Glosario

Las traducciones fijas del negocio. El código va en inglés y lo que ve el usuario
en español; un término se elige **una vez** y se usa igual en la base, la API, el
frontend y los commits (ver `.claude/rules/nomenclatura.md`).

Un término nuevo se agrega aquí **antes** de usarlo, para que no aparezcan dos
traducciones de lo mismo.

| Español | Código | Notas |
|---|---|---|
| Usuario, personal | `User` | Quien inicia sesión. Hoy el personal del taller es el conjunto de usuarios |
| Administrador | `ADMIN` | Valor de `UserRole` |
| Mecánico | `MECHANIC` | Valor de `UserRole` |
| Cliente | `Customer` | Persona o empresa dueña del vehículo. No inicia sesión |
| Vehículo | `Vehicle` | |
| Placa | `plate` | Única. Se guarda en mayúsculas y sin guiones |
| Kilometraje | `mileage` | En km. `mileageIn` es el del ingreso |
| Orden de trabajo (OT) | `WorkOrder` | Ruta de la API `/work-orders` |
| Estado de la OT | `WorkOrderStatus` | Ver los valores abajo |
| Cambio de estado, línea de tiempo | `WorkOrderEvent` | Cada cambio con fecha, usuario y nota |
| Nota pública / interna | `isPublic` | La pública la ve el cliente en el seguimiento |
| Fecha prometida | `promisedDate` | Cuándo se le dijo al cliente que estaría listo |
| Código de seguimiento | `trackingCode` | Aleatorio, no secuencial (`AFM-7K3Q9X`) |
| Catálogo de servicios | `ServiceCatalogItem` | Ruta de la API `/service-catalog` |
| Mano de obra | `labor` | |
| Presupuesto | `Quote` | Versionado: cada envío es una versión nueva |
| Ítem (de OT o de presupuesto) | `WorkOrderItem`, `QuoteItem` | Un servicio o un repuesto, con cantidad y precio |
| Repuesto, insumo | `Product` | Lo que se consume y tiene stock |
| Herramienta | `Tool` | Se asigna, no se consume |
| Movimiento de stock, kardex | `StockMovement` | Entrada, salida o ajuste |
| Stock mínimo | `minStock` | Debajo de este valor se alerta |
| Costo / precio de venta | `cost` / `price` | En soles (PEN) |
| Pago | `Payment` | Uno o varios por OT; un adelanto es un pago |
| Método de pago | `PaymentMethod` | `CASH`, `YAPE_PLIN`, `CARD`, `TRANSFER` |
| Seguimiento | `tracking` | La página pública y su módulo |

## Estados de la orden de trabajo

| Español | Código |
|---|---|
| Recibido | `RECEIVED` |
| En diagnóstico | `DIAGNOSIS` |
| Esperando aprobación | `WAITING_APPROVAL` |
| En reparación | `IN_PROGRESS` |
| Esperando repuestos | `WAITING_PARTS` |
| Listo para recoger | `READY` |
| Entregado | `DELIVERED` |
| Cancelado | `CANCELLED` |

## Términos que se quedan como están

`DNI`, `RUC`, `SUNAT`, `VIN`, `Yape`, `Plin`.
