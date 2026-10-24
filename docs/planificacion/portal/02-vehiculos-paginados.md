# Vehículos del portal paginados

«Mis vehículos» del portal (`01-portal-del-cliente.md`) traía la lista
completa, sin paginar. Quien dirige el proyecto pidió paginarla con búsqueda,
como el resto de los listados (regla 3 de `proyecto.md`).

## Qué entra y qué no

- **Entra:** `GET /portal/vehicles` paginado (9 por página desde el frontend)
  con `search` por placa, marca o modelo; `GET /portal/vehicles/:vehicleId`
  para mostrar la placa del filtro de órdenes sin traer la lista entera.
- **No entra:** otros filtros (un cliente tiene pocos vehículos), ordenar por
  otra cosa que la placa, editar vehículos desde el portal.

## Decisiones

| Decisión | Por qué |
|---|---|
| `findForCustomer` reutiliza `vehiclesWhere({ customerId, search })` del listado del personal | La misma búsqueda en los dos lados: la placa se busca normalizada («abc-1» encuentra «ABC123») |
| Orden por placa con desempate por `vehicleId` | Paginación estable entre visitas |
| El vehículo ajeno responde **404** (`findOneForCustomer`: `where { vehicleId, customerId }`) | Igual que las órdenes: un 403 confirmaría que existe |
| La búsqueda también mira el nombre del dueño (viene de `vehiclesWhere`) | Inofensivo: el dueño es siempre él |

## Avance

- [x] `VehiclesService.findForCustomer` paginado y `findOneForCustomer`.
- [x] `ListPortalVehiclesQueryDto`, `GET /portal/vehicles` paginado y
  `GET /portal/vehicles/:vehicleId`.
- [x] Tests: paginación, búsqueda, filtro por cliente siempre presente, 404
  ajeno (661 en verde, lint y build). Contra la API real: 14 de 14
  comprobaciones (11 vehículos en 2 páginas, placa con guion, marca, ajeno
  fuera de la búsqueda y 404, personal 403), con limpieza.
- [x] Validado por quien dirige el proyecto (2026-10-24).
