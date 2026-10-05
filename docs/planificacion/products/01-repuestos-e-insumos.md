# Repuestos e insumos

Primer módulo del grupo `inventory` (`src/modules/inventory/`, con su
`InventoryModule` importado en `app.module.ts`), sobre el patrón de Clientes y
del catálogo de servicios. El modelo `Product` ya existía en
`inventory.prisma`: el módulo no cambia el schema.

## Qué entra y qué no

- **Entra:** listado paginado con búsqueda, filtros y orden, y detalle, para
  `ADMIN` y `MECHANIC` (el mecánico consulta el stock y agregará repuestos a
  sus órdenes); alta, edición y borrado real solo para `ADMIN`. El costo y el
  margen solo salen para `ADMIN`. La validación de cantidades (`IsQuantity` y
  `ToQuantityText`, en `src/core/validation/quantity.ts`), que reusarán los
  movimientos de stock y los ítems de las órdenes; las reglas comunes de
  `Decimal(10, 2)` pasan a `decimal.ts`, y `money.ts` queda como una capa de
  mensajes sobre ellas.
- **No entra:** mover el stock (compras, consumos y ajustes llegan con
  `stock-movements`, el módulo 5), el kardex, historial de costos,
  categorías, proveedores, códigos de barras, fotos, importación masiva,
  herramientas (`tools`). El service no se exporta todavía: lo hará cuando
  `stock-movements` o `work-orders` lo necesiten.

## Decisiones

| Decisión | Por qué |
|---|---|
| `GET` para `ADMIN` y `MECHANIC`; `POST`, `PATCH` y `DELETE` solo `ADMIN`, con `@Roles` en cada método | Alcance del MVP: el mecánico consulta stock; los datos los mantiene el administrador |
| **El stock no se edita aquí.** Nace en 0 (default de la base) y el DTO de alta y edición no lo declara: `forbidNonWhitelisted` responde 400 a un cuerpo que lo traiga | El stock es la suma de los movimientos (redundancia deliberada del schema). Si se pudiera escribir a mano, dejaría de cuadrar con el kardex sin dejar rastro. Sí se editan `minStock`, `cost` y `price` |
| **Una sola entidad `Product` con `cost` y `margin` opcionales**, que el controller llena solo para `ADMIN` (`includeCosts`); para el mecánico las dos claves no aparecen en el JSON | Es el mismo recurso en el mismo endpoint. Con dos entidades, Swagger y los tipos del frontend tendrían que distinguir dos respuestas según quién pregunta. Ocultarlas en la API, y no solo en la pantalla, es lo que impide que el mecánico las vea |
| `margin` = `price − cost`, texto con dos decimales; negativo si se vende por debajo del costo | Se calcula al responder: guardarlo sería tener dos verdades |
| `isLowStock` = `stock <= minStock`, en los dos roles | La alerta de stock bajo del alcance. Con el mínimo en 0 y el stock en 0 también sale como bajo: está agotado |
| `code` recortado y en mayúsculas, hasta 30; único → 409 «Ya existe un producto con ese código» | Como se guarda normalizado, el índice único de la base basta (sin comparación sin mayúsculas aparte, a diferencia del catálogo); su P2002 se traduce al 409 propio |
| `name` hasta 150 (recortado); `brand` opcional hasta 60, vacía → `null` | Los largos de las columnas |
| `minStock` con `IsQuantity` (no negativo, hasta 2 decimales, hasta 99999999.99), obligatorio en el alta | Lo que cabe en `Decimal(10, 2)`. Obligatorio para que la edición rechace `null` (con `@IsOptional`, un `null` llegaría a la base como 500); el formulario lo propone en 0 |
| `cost` y `price` con `IsMoney`, obligatorios | Mismas reglas que los montos del catálogo |
| Borrado real; 409 si tiene movimientos de stock o ítems de órdenes, con las cantidades y la sugerencia de desactivarlo | Regla del proyecto: el historial no se borra. Se cuenta con `_count` de las relaciones del propio modelo |

### A validar por quien dirige el proyecto

- **Precio menor que el costo: se acepta** (no hay regla), y el margen sale
  negativo. Se podría bloquear o avisar; se dejó simple a propósito.
- **Stock bajo con mínimo 0:** un producto con mínimo 0 y stock 0 sale como
  stock bajo (agotado). Hasta que exista el módulo de movimientos, **todo** el
  inventario está en 0 y sale como stock bajo.

### Búsqueda y filtros

> **Pendiente de validación de quien dirige el proyecto.**

- **Búsqueda (`search`):** código, nombre y marca; contiene, sin distinguir
  mayúsculas.
- **Filtros:** tipo (`kind`: `PART`/`SUPPLY`), estado (`isActive`) y stock
  bajo (`lowStock=true` → `stock <= minStock`, comparando las dos columnas con
  `prisma.product.fields.minStock`; `lowStock=false` → `stock > minStock`).
- **Orden:** `name` (por defecto), `code`, `stock` o `price`, con desempate por
  `productId`. No se ordena por costo ni margen: el mecánico no los ve.

## Endpoints

| Método | Ruta | Roles | Respuesta |
|---|---|---|---|
| `GET` | `/products?page&pageSize&search&kind&isActive&lowStock&sortBy&sortOrder` | `ADMIN`, `MECHANIC` | Página de `Product` con `meta` |
| `GET` | `/products/:productId` | `ADMIN`, `MECHANIC` | `Product` |
| `POST` | `/products` | `ADMIN` | `Product` (201) |
| `PATCH` | `/products/:productId` | `ADMIN` | `Product` |
| `DELETE` | `/products/:productId` | `ADMIN` | `null` |

`Product`: `productId`, `code`, `name`, `kind`, `unit`, `brand`, `stock` y
`minStock` (texto, «4.50»), `isLowStock`, `cost` (solo `ADMIN`), `price`,
`margin` (solo `ADMIN`), `isActive`, `createdAt`, `updatedAt`.

## Avance

- [x] `decimal.ts` con las reglas de `Decimal(10, 2)`; `money.ts` sobre él, sin
  cambiar su contrato.
- [x] `IsQuantity` y `ToQuantityText` en `core/validation/quantity.ts`.
- [x] Grupo `inventory` (`InventoryModule`) en `app.module.ts`.
- [x] Módulo `inventory/products`: DTO, entidad, service, controller.
- [x] Tests de service (búsqueda, filtros, stock bajo con la referencia a la
  columna, paginación y desempate, P2002 en alta y edición, 404, 409 por
  historial), de los DTO (código normalizado, cantidades y montos, `null` en
  la edición, query) y de la entidad (costo y margen según el rol,
  `toFixed(2)`, stock bajo).
- [ ] Prueba del flujo real contra la API y datos de prueba: los scripts están
  escritos (`seed-products.mjs`, `products-flow.mjs` y `temp-movement.mts` en
  el scratchpad de la sesión) pero no se pudieron correr: Postgres local no
  acepta conexiones.
- [ ] Validación de quien dirige el proyecto desde el frontend (funcionamiento y
  diseño). Hasta entonces no se empieza el módulo siguiente.
