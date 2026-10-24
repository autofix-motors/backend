# Portal del cliente

Módulo B del portal. El cliente con acceso (módulo A, `auth/01-…`) ve sus
vehículos y sus órdenes —en curso y anteriores— con la línea de tiempo pública,
y **aprueba o rechaza los presupuestos** desde su cuenta. Reemplaza el
«seguimiento público por código» de la Fase 3 del alcance del MVP: el
seguimiento ahora es con sesión.

Vive en `modules/workshop/portal/`, sin tablas propias: lee a través de los
services dueños (`WorkOrdersService`, `WorkOrderQuotesService`,
`VehiclesService`).

## Qué entra y qué no

- **Entra:** sus vehículos; sus órdenes (las que **él trajo**, `WorkOrder.customerId`)
  separadas en «en curso» y «anteriores», paginadas y filtrables por vehículo; el
  detalle de una orden; responder el presupuesto pendiente (todo o nada, con
  una nota opcional).
- **No entra:** inicio con gráficos (módulo C), pagos (Fase 5), notificaciones,
  editar sus datos o sus vehículos, ver órdenes de un vehículo que ya no es
  suyo y que trajo otro dueño.

## Decisiones

| Decisión | Por qué |
|---|---|
| Endpoints bajo `/portal`, con `@CustomerOnly()` en la clase y el cliente leído con `@CurrentCustomer()` | El `RolesGuard` niega al cliente todo lo demás; el personal recibe 403 aquí |
| Una orden ajena responde **404**, no 403 (`findOneForCustomer`: `where { workOrderId, customerId }`) | Igual que el mecánico con una orden que no es suya: un 403 confirmaría que existe |
| El cliente ve: estado, código de seguimiento, vehículo, motivo, kilometraje, diagnóstico, nombre del mecánico, servicios y repuestos con precio y total, línea de tiempo **solo pública** y presupuestos | Decisión de quien dirige el proyecto. **Nunca:** costos, márgenes, notas internas, número correlativo, ids ni nombres de quién escribió cada evento |
| Entidades propias del portal (`PortalWorkOrder`, `PortalWorkOrderDetail`, …), copiadas campo por campo; nunca las del personal | Que un campo nuevo del personal no aparezca solo en el portal |
| La respuesta del cliente reutiliza el núcleo de `decide` (extraído a `applyDecision`): misma transacción, misma comprobación de versión pendiente y de estado | Una sola regla para las dos vías. El portal guarda canal `PORTAL`, sin `decidedById`, y el evento público queda **sin autor** («Presupuesto v2 aprobado por el cliente desde el portal») |
| `DecisionChannel` suma `PORTAL`; el administrador no puede registrar `PORTAL` (su DTO lo excluye) | El canal dice quién respondió de verdad |
| `WorkOrderEvent.createdById` pasa a opcional: vacío = lo hizo el cliente desde el portal | El cliente no es un `User`. Los eventos existentes conservan su autor |
| Órdenes: `state=OPEN` (no entregadas ni canceladas) u `CLOSED`, más recientes primero, 10 por página, filtro `vehicleId`. Vehículos: lista corta sin paginar | «Pestañas simples», decisión de quien dirige el proyecto: un cliente tiene pocos vehículos |

### A validar por quien dirige el proyecto

- La línea de tiempo del cliente omite quién hizo cada cambio (solo «qué» y «cuándo»).
- El cliente ve las órdenes que **él** trajo; si vendió el vehículo, sus órdenes
  anteriores siguen en su portal y no pasan al nuevo dueño.
- Vehículos sin paginar.

## Endpoints

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/portal/vehicles` | `PortalVehicle[]` (placa, marca, modelo, año, color, órdenes registradas) |
| `GET` | `/portal/work-orders?state&vehicleId&page&pageSize` | `PortalWorkOrder[]` paginado (código, estado, vehículo, motivo, fechas, total, `hasPendingQuote`) |
| `GET` | `/portal/work-orders/:workOrderId` | `PortalWorkOrderDetail`; 404 si no es suya |
| `POST` | `/portal/work-orders/:workOrderId/quotes/:quoteId/decision` | `PortalWorkOrderDetail`; `{ decision, note? }`; 404, 409 ya decidido / orden fuera de espera / cambio simultáneo |

## Avance

- [x] Schema y migración `20261018212045_decision_desde_el_portal`
  (`PORTAL`; `created_by_id` opcional, manteniendo `RESTRICT` al borrar un
  usuario). SQL revisado: solo esas dos sentencias.
- [x] `applyDecision` compartido, `decideByCustomer`, DTO del personal sin
  `PORTAL` (`StaffDecisionChannel`).
- [x] `findAllForCustomer`, `findOneForCustomer`, `VehiclesService.findForCustomer`.
- [x] Módulo `portal` (controller, service, DTO, entidades propias).
- [x] Personal: evento sin autor («El cliente (portal)») y canal «Portal del
  cliente» en el detalle.
- [x] Tests: 658 del backend (lista blanca de campos del detalle, solo eventos
  públicos, decisión por portal con canal y sin autor, 404 ajena, 409 ya
  decidido / cancelada / simultáneo, DTO del personal sin PORTAL). Contra la
  API real: 26 de 26 comprobaciones de punta a punta, con limpieza.
- [x] Frontend (nota en `frontend/docs/planificacion/portal/`).
- [x] Validado por quien dirige el proyecto (2026-10-24).
