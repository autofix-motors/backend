# Gestión de vehículos

Segundo módulo del grupo `customer`, sobre el patrón de Clientes
(`docs/planificacion/customers/01-gestion-de-clientes.md`). El modelo `Vehicle`
ya existía en `customer.prisma`: el módulo no cambia el schema.

## Qué entra y qué no

- **Entra:** listado paginado con búsqueda, filtros y orden; detalle, alta,
  edición y borrado de vehículos, solo para `ADMIN`. Cada vehículo sale con su
  cliente resumido y cuántas órdenes de trabajo tiene. La lista de marcas
  registradas, para el filtro por marca del frontend.
- **No entra:** historial de órdenes del vehículo (llega con las órdenes de
  trabajo), traspaso con registro de dueños anteriores (cambiar `customerId`
  solo cambia el dueño actual; cada orden ya congela quién la trajo), fotos,
  kilometraje (vive en la orden), catálogo cerrado de marcas y modelos,
  importación masiva.

## Decisiones

| Decisión | Por qué |
|---|---|
| Placa normalizada: mayúsculas, sin espacios ni guiones, 5 a 7 letras o dígitos | «abc-123» y «ABC123» son la misma placa; así se compara y se busca sin ambigüedad (regla del modelo de datos) |
| VIN opcional, normalizado a mayúsculas sin espacios ni guiones; 17 letras o dígitos sin I, O ni Q | Es el formato del número de serie del fabricante: esas tres letras no se usan para no confundirlas con 1 y 0 |
| Placa y VIN únicos: se comprueba antes de guardar para decir cuál se repite (409) | El error de unicidad de la base no dice qué columna chocó de forma estable; queda como respaldo con un mensaje genérico |
| Año opcional entre 1950 y el año actual + 1 | Los modelos del año siguiente se venden desde mediados de año. El tope se calcula en cada validación, no al arrancar la API |
| El cliente se verifica con `CustomersService` (exportado por `CustomersModule`) | Invariante 3: vehicles no consulta la tabla de clientes. Si no existe, 404; si está inactivo, no se le asigna un vehículo nuevo ni se le traspasa uno (400) |
| Un vehículo de un cliente inactivo se puede seguir editando | La regla impide asignarle vehículos, no tocar los que ya tiene |
| La respuesta trae `customer` resumido y `workOrdersCount` | Se leen con `include` de la relación del propio vehículo: es lectura del modelo propio, no una consulta a la tabla de otro módulo |
| La búsqueda por nombre del cliente filtra por la relación del vehículo | Mismo criterio que el `include`; la alternativa (pedirle a `CustomersService` los ids que coinciden y filtrar con `in`) son dos consultas y una lista de ids sin tope |
| Borrado real; 409 si tiene órdenes de trabajo | Regla del proyecto: hard delete y el historial nunca en cascada |
| `GET /vehicles/brands`: marcas registradas con su cantidad, sin distinguir mayúsculas | El filtro por marca es exacto: con una lista de las marcas que existen se elige en vez de adivinar cómo se escribió |

### Búsqueda y filtros

> **Pendiente de validación de quien dirige el proyecto.**

- **Búsqueda (`search`):** placa (normalizada igual que al guardar, así «abc-1»
  encuentra «ABC123»), marca, modelo y nombre del cliente; contiene, sin
  distinguir mayúsculas.
- **Filtros:** `customerId` (uuid, el dueño) y `brand` (texto exacto, sin
  distinguir mayúsculas).
- **Orden:** `plate` (por defecto), `brand` o `createdAt`, con desempate por
  `vehicleId`.

## Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/vehicles?page&pageSize&search&customerId&brand&sortBy&sortOrder` | Página de `Vehicle` con `meta` |
| `GET` | `/vehicles/brands` | `VehicleBrand[]` (`brand`, `vehiclesCount`) |
| `GET` | `/vehicles/:vehicleId` | `Vehicle` |
| `POST` | `/vehicles` | `Vehicle` (201) |
| `PATCH` | `/vehicles/:vehicleId` | `Vehicle` |
| `DELETE` | `/vehicles/:vehicleId` | `null` |

## Avance

- [x] `CustomersModule` exporta `CustomersService`.
- [x] Módulo `customer/vehicles`: DTO, entidad, service, controller.
- [x] Tests de service (filtros, 409, cliente inactivo) y de DTO (normalización).
- [x] Prueba del flujo real contra la API y datos de prueba (31 vehículos).
- [ ] Pantalla de vehículos en el frontend: construida y verificada con
  typecheck, lint, tests y build; falta la prueba en navegador real (Postgres
  local dejó de aceptar conexiones antes de correrla).
- [ ] Validación de quien dirige el proyecto desde el frontend (funcionamiento y
  diseño). Hasta entonces no se empieza el módulo siguiente.
