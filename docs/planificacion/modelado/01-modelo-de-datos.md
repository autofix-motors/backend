# Modelo de datos del MVP

Todas las entidades del alcance (`hoja-de-ruta/01-alcance-del-mvp.md`) en
Prisma, para revisarlas en Prisma Studio antes de escribir endpoints. Solo schema
y migraciones: sin módulos de Nest, DTO ni pantallas.

## Qué entra y qué no

- **Entra:** los modelos y enums de los cinco dominios, sus relaciones, índices y
  migraciones; el renombre de las claves primarias existentes; la regla de
  nombres de claves primarias.
- **No entra:** endpoints, DTO, services, seeds con datos de ejemplo, cambios en
  el frontend (Swagger no expone modelos nuevos), historial de préstamos de
  herramientas, fotos del vehículo.

## Decisiones

| Decisión | Por qué |
|---|---|
| Cinco archivos de schema: `core`, `customer`, `workshop`, `inventory`, `finance` | Uno por dominio; el nombre es el prefijo de sus tablas y el grupo de sus módulos |
| La clave primaria es `<entidad>Id`, nunca `id` | Pedido del equipo: la PK y las FK que la apuntan se llaman igual en todo el código |
| El documento del cliente es obligatorio y único por tipo | Pedido del equipo; evita registrar dos veces al mismo cliente |
| La OT congela el cliente que trajo el vehículo | Si el vehículo cambia de dueño, la orden sigue siendo de quien la pidió y pagó |
| Los totales de la OT y el saldo no se guardan | Salen de los ítems y los pagos; guardarlos sería tener dos verdades |
| El presupuesto sí guarda su total y copia sus ítems | Es una foto de lo que vio el cliente; la orden puede cambiar después |
| El stock del producto se guarda | Redundancia deliberada para no recorrer el kardex; se actualiza en la misma transacción que el movimiento |
| Precio y costo se congelan en el ítem de la OT | Cambiar el catálogo no altera órdenes armadas, y el margen no cambia con la siguiente compra |
| Pagos, movimientos y eventos no se editan ni se borran | Son historial: un pago se anula, un movimiento se corrige con un ajuste |
| Borrar está restringido (`RESTRICT`) por defecto | Prisma pone `SET NULL` en las relaciones opcionales, y eso borraría en silencio quién hizo qué. Solo hay `CASCADE` en los hijos sin vida propia (eventos, ítems de OT y de presupuesto, sesiones) y `SET NULL` en el ítem de un movimiento de stock |
| Dinero y cantidades en `Decimal(10, 2)` | Soles con céntimos; cantidades con fracción porque hay litros y galones |

## Tablas

| Archivo | Tablas |
|---|---|
| `core.prisma` | `core_user`, `core_session` |
| `customer.prisma` | `customer_customer`, `customer_vehicle` |
| `workshop.prisma` | `workshop_service_catalog_item`, `workshop_work_order`, `workshop_work_order_event`, `workshop_work_order_item`, `workshop_quote`, `workshop_quote_item` |
| `inventory.prisma` | `inventory_product`, `inventory_stock_movement`, `inventory_tool` |
| `finance.prisma` | `finance_payment` |

El porqué de cada modelo y de cada campo especial está en el `///` del propio
schema.

## Reglas que el schema no puede declarar

Prisma no tiene `CHECK`: estas las valida el service de cada módulo cuando
exista.

- `WorkOrderItem`: `serviceCatalogItemId` si `type` es `SERVICE`, `productId` si
  es `PRODUCT`; nunca los dos.
- `StockMovement`: `workOrderItemId` obligatorio si `type` es `WORK_ORDER`;
  `unitCost` obligatorio en `PURCHASE`. `quantity` positiva entra, negativa sale.
- `WorkOrder`: `cancelReason` obligatorio al pasar a `CANCELLED`; `deliveredAt`
  se llena al pasar a `DELIVERED`.
- `Quote`: `decidedById`, `decidedAt` y `decisionChannel` se llenan juntos, solo
  un `ADMIN` y solo si está `PENDING`.
- `Payment`: `amount` positivo; `voidedAt`, `voidedById` y `voidReason` juntos.
- `Customer.documentNumber` y `Vehicle.plate`: normalizados (sin espacios ni
  guiones, placa en mayúsculas) antes de guardar.

## Avance

- [x] Regla de claves primarias `<entidad>Id` en `nomenclatura.md` y en la skill
  `estructura-backend`.
- [x] Migración `renombrar_ids`: `core_user.id` → `user_id` y
  `core_session.id` → `session_id`, escrita a mano con `RENAME COLUMN` (Prisma
  la generaba como borrar y crear la columna, perdiendo los datos). Código de
  auth y specs ajustados.
- [x] Schemas `customer`, `workshop`, `inventory`, `finance` y relaciones en `User`.
- [x] Migración `modelo_del_taller`. `core_user.updated_at` entra con un valor
  para las filas existentes y después se le quita el default.
- [x] Glosario con los enums nuevos.
- [ ] Revisión en Prisma Studio (`pnpm db:studio`).
- [ ] `CurrentSession.userId` en el frontend (`pnpm api:types`), en un PR aparte.
