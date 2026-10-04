# Gestión de clientes

Primer módulo construido con las reglas de `.claude/rules/proyecto.md` («Cómo
se construye un módulo»). Antes de él se armó lo transversal que usan todos.

## Qué entra y qué no

- **Entra:** listado paginado, alta, edición y borrado de clientes, solo para
  `ADMIN`; el formato `BaseResponseDto` en toda la API; la paginación compartida.
- **No entra:** vehículos (siguiente módulo), historial de órdenes del cliente,
  exportar, importación masiva.

## Decisiones

| Decisión | Por qué |
|---|---|
| Búsqueda por nombre y número de documento | Elegida por quien dirige el proyecto |
| Filtros: tipo de documento y estado (activo/inactivo) | Ídem |
| Orden por nombre (por defecto) o fecha de registro | Lo que se usa para encontrar a alguien o ver lo último |
| Borrado real; 409 si tiene vehículos u órdenes | Regla del proyecto: hard delete, sin borrar historial en cascada |
| El número de documento se normaliza y se valida según su tipo | DNI 8 dígitos; RUC 11 que empieza en 10, 15, 16, 17 o 20; CE y pasaporte 6–12 alfanuméricos. Evita duplicados escritos distinto |
| Un solo filtro global de errores | Con varios globales, cuál atrapa qué depende del orden de registro |
| `DELETE` y `logout` responden 200 con `data: null` | Mismo formato que todo lo demás |

## Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/customers?page&pageSize&search&documentType&isActive&sortBy&sortOrder` | Página de `Customer` con `meta` |
| `GET` | `/customers/:customerId` | `Customer` |
| `POST` | `/customers` | `Customer` (201) |
| `PATCH` | `/customers/:customerId` | `Customer` |
| `DELETE` | `/customers/:customerId` | `null` |

## Avance

- [x] `BaseResponseDto` en éxitos y errores, también en `/auth`.
- [x] Paginación compartida (`PaginationQueryDto`, `Page`, `paginationMeta`) y
  decoradores de Swagger para el envoltorio.
- [x] Módulo `customer/customers` con tests de service y DTO.
- [x] Pantalla de clientes en el frontend.
- [ ] Validación de quien dirige el proyecto desde el frontend (funcionamiento y
  diseño). Hasta entonces no se empieza Vehículos.
