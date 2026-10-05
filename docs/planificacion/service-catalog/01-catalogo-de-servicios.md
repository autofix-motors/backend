# Catálogo de servicios

Primer módulo del grupo `workshop` (`src/modules/workshop/`, con su
`WorkshopModule` importado en `app.module.ts`), sobre el patrón de Clientes. El
modelo `ServiceCatalogItem` ya existía en `workshop.prisma`: el módulo no
cambia el schema.

## Qué entra y qué no

- **Entra:** listado paginado con búsqueda, filtros y orden, y detalle, para
  `ADMIN` y `MECHANIC` (el mecánico agrega servicios a sus órdenes); alta,
  edición y borrado real solo para `ADMIN`. La validación de montos en soles
  (`IsMoney` y `ToMoneyText`, en `src/core/validation/money.ts`), que reusarán
  repuestos y pagos.
- **No entra:** agregar servicios a una orden (llega con `work-orders`, que
  copiará nombre y precio al ítem), historial de cambios de precio, categorías
  de servicios, duración estimada, precios por tipo de vehículo, importación
  masiva. El service no se exporta todavía: lo hará cuando `work-orders` lo
  necesite.

## Decisiones

| Decisión | Por qué |
|---|---|
| `GET` para `ADMIN` y `MECHANIC`; `POST`, `PATCH` y `DELETE` solo `ADMIN`, con `@Roles` en cada método | El mecánico consulta el catálogo para armar sus órdenes, pero los precios los fija el administrador. Un `@Roles` de clase obligaría a sobrescribirlo método por método |
| `laborPrice` entra como texto («120.50») o número (120.5), no negativo, hasta 2 decimales y hasta 99999999.99; se valida como texto y llega así a Prisma | Es lo que cabe en `Decimal(10, 2)`. Validarlo como texto evita que un `number` redondee en silencio: «12.345» es un 400, no S/ 12.35. Mensajes distintos para negativo, decimales de más, tope y formato |
| `laborPrice` sale como texto con `toFixed(2)` («120.00») | Regla de los `Decimal`: serializado sin más, 120.50 viaja como «120.5» |
| Nombre único sin distinguir mayúsculas: 409 «Ya existe un servicio con ese nombre» | La base solo impide el nombre escrito igual; «cambio de aceite» y «Cambio de aceite» serían dos servicios indistinguibles. Se compara con `mode: 'insensitive'` antes de crear o renombrar, y el P2002 queda de respaldo |
| Nombre de 1 a 120 caracteres (recortado); descripción opcional de hasta 1000 | El nombre sigue al `VarChar(120)`. La descripción no tiene tope en la base; el DTO la limita como las notas de clientes y vehículos |
| Borrado real; 409 si el servicio ya se usó en ítems de órdenes, con la cantidad y la sugerencia de desactivarlo | Regla del proyecto: el historial no se borra. Se cuenta con `_count.workOrderItems` de la relación del propio modelo (leer el modelo de este módulo, no la tabla de órdenes) |
| Rango de precio invertido (`minPrice` > `maxPrice`): 400 «El precio mínimo no puede ser mayor que el máximo» | Responder vacío escondería el error de quien arma la consulta |

### Limitaciones conocidas

- **El nombre único sin mayúsculas no está protegido contra una carrera**: dos
  altas simultáneas de «Lavado» y «lavado» pasarían la comprobación y la base
  aceptaría las dos (su índice distingue mayúsculas). Con un solo
  administrador cargando el catálogo no justifica un índice sobre
  `lower(name)`, que exigiría una migración.

### Búsqueda y filtros

> **Pendiente de validación de quien dirige el proyecto.**

- **Búsqueda (`search`):** nombre y descripción; contiene, sin distinguir
  mayúsculas.
- **Filtros:** `isActive` (`true`/`false`) y rango del precio de mano de obra
  (`minPrice`, `maxPrice`, en soles, extremos incluidos; cada uno opcional).
- **Orden:** `name` (por defecto), `laborPrice` o `createdAt`, con desempate
  por `serviceCatalogItemId`.

## Endpoints

| Método | Ruta | Roles | Respuesta |
|---|---|---|---|
| `GET` | `/service-catalog?page&pageSize&search&isActive&minPrice&maxPrice&sortBy&sortOrder` | `ADMIN`, `MECHANIC` | Página de `ServiceCatalogItem` con `meta` |
| `GET` | `/service-catalog/:serviceCatalogItemId` | `ADMIN`, `MECHANIC` | `ServiceCatalogItem` |
| `POST` | `/service-catalog` | `ADMIN` | `ServiceCatalogItem` (201) |
| `PATCH` | `/service-catalog/:serviceCatalogItemId` | `ADMIN` | `ServiceCatalogItem` |
| `DELETE` | `/service-catalog/:serviceCatalogItemId` | `ADMIN` | `null` |

`ServiceCatalogItem`: `serviceCatalogItemId`, `name`, `description`,
`laborPrice` (texto, «120.00»), `isActive`, `createdAt`, `updatedAt`.

## Avance

- [x] Grupo `workshop` (`WorkshopModule`) en `app.module.ts`.
- [x] `IsMoney` y `ToMoneyText` en `core/validation/money.ts`.
- [x] Módulo `workshop/service-catalog`: DTO, entidad, service, controller.
- [x] Tests de service (búsqueda, rango de precio, orden, nombre repetido sin
  mayúsculas y P2002, 404, 409 por uso en órdenes), de los DTO (formato del
  precio, `null` en la edición, query) y de la entidad (`toFixed(2)`).
- [ ] Prueba del flujo real contra la API y datos de prueba: los scripts están
  escritos (`service-catalog-flow.mjs`, `seed-service-catalog.mjs` y
  `temp-wo-service.mts` en el scratchpad de la sesión) pero no se pudieron
  correr: Postgres local no acepta conexiones.
- [ ] Validación de quien dirige el proyecto desde el frontend (funcionamiento y
  diseño). Hasta entonces no se empieza el módulo siguiente.
