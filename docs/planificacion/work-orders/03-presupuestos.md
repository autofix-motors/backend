# Presupuestos de una orden

Módulo 9. Los presupuestos versionados de la orden de trabajo (`Quote` y
`QuoteItem`, que ya existían en `workshop.prisma`): lo que se le propone al
cliente y su respuesta, que registra el administrador. Sin migración: el
schema no cambió.

Viven **dentro del módulo `work-orders`** (`work-order-quotes.service.ts`, sus
DTO y entidades, y los endpoints en `WorkOrdersController`), por la misma razón
que los ítems (plan `02`): el presupuesto es parte de la orden, el detalle lo
lee con su `include`, cada cambio responde la orden completa, y para saber
quién ve la orden hace falta su service. Como módulo aparte habría una
dependencia circular.

> Plan escrito después de implementar (commit `35f6e2c`), para dejar las
> decisiones por escrito como en los módulos anteriores.

## Qué entra y qué no

- **Entra:** enviar un presupuesto (`POST`), que congela los ítems y el total
  en una versión nueva y lleva la orden a «Esperando aprobación»; registrar la
  respuesta del cliente (`POST …/decision`), que la lleva a reparación o de
  vuelta a diagnóstico; los presupuestos de la orden en su detalle; las
  transiciones de sistema (`SYSTEM_TRANSITIONS`) aparte de la tabla de los
  botones.
- **No entra:** que el cliente apruebe desde la página pública (alcance del
  MVP: la página solo informa; es la Fase 3), aprobar ítems sueltos,
  descuentos, impuestos (IGV), vencimiento de un presupuesto, PDF o impresión,
  envío automático por WhatsApp o correo, editar o borrar una versión enviada,
  y volver de «Esperando aprobación» a diagnóstico sin respuesta (a mano solo
  se cancela).

## Decisiones

| Decisión | Por qué |
|---|---|
| **Enviar y registrar la respuesta: solo `ADMIN`** (`@Roles` en el controller). El mecánico asignado ve los presupuestos en el detalle; otro mecánico, 404 como toda la orden | Decisión del alcance: el cliente responde por teléfono, WhatsApp o en el taller, y el administrador lo registra |
| Se envía desde «En diagnóstico», «En reparación» o «Esperando repuestos» (`SYSTEM_TRANSITIONS.QUOTE_SENT`), con al menos un ítem (400 sin ítems; 409 en otro estado) | Al terminar el diagnóstico, o si aparece otro problema a mitad de la reparación |
| **Las transiciones del presupuesto no van en `MANUAL_TRANSITIONS`**: `QUOTE_SENT` (→ `WAITING_APPROVAL`), `QUOTE_APPROVED` (→ `IN_PROGRESS`) y `QUOTE_REJECTED` (→ `DIAGNOSIS`) están en `SYSTEM_TRANSITIONS` y las aplica `WorkOrderQuotesService`, con el mismo `WorkOrderEvent` que un cambio manual. El frontend no las copia | «Esperando aprobación» no se elige con un botón: se llega enviando y se sale registrando la respuesta. Desde ahí, a mano, solo se cancela |
| **Enviar es una transacción**, con el estado como **primera** escritura (`where: { workOrderId, status: from }`): toma la fila de la orden, y un ítem que se agrega a la vez espera y después falla. Los ítems que se leen después son los definitivos | Que la foto no pierda un ítem agregado en el mismo instante. Si la orden cambió entre medio, P2025 → 409 y no se guarda nada |
| **La foto**: `QuoteItem` copia tipo, descripción, cantidad y precio; **sin costo** y sin apuntar al ítem vivo. El total se calcula con `workOrderAmounts` (Decimal, redondeo por línea, plan `02`) y se guarda en `Quote.total` | El presupuesto no cambia si después se mueven los ítems de la orden; el cliente no ve costos. `QuoteItem` no tiene columna de posición: el orden de la orden se conserva con un `createdAt` que avanza un milisegundo por línea |
| **Versión** = la última de la orden + 1. Una versión `PENDING` anterior pasa a `SUPERSEDED` al enviar otra: nunca hay dos pendientes | Hoy no conviven (con una pendiente la orden está en «Esperando aprobación», desde donde no se envía), pero la regla queda en la transacción por si cambia el flujo |
| **La respuesta es todo o nada**: `APPROVED` o `REJECTED`, el canal (`PHONE`, `WHATSAPP`, `IN_PERSON`) y una nota opcional. Se guarda quién, cuándo, el canal y la nota en el propio `Quote` | Lo que dijo el cliente y por dónde, con su responsable, sin tabla aparte |
| La respuesta solo sobre la versión `PENDING` (409 con el motivo si ya está aprobada, rechazada o reemplazada) y con la orden en «Esperando aprobación» (409 si la cancelaron mientras esperaba). El `updateMany` lleva `status: PENDING` en el `where` | Dos personas registrando a la vez no se pisan: la segunda recibe 409 «El presupuesto cambió mientras tanto» |
| Los eventos de enviar y de la respuesta son **públicos**: «Presupuesto v2 enviado: S/ 450.00» (más la nota para el cliente) y «Presupuesto v2 aprobado» | Es lo que el cliente verá en su seguimiento (Fase 3) |
| Cancelar una orden que espera aprobación deja su versión en `PENDING`, sin respuesta posible | No hay respuesta que registrar; la versión queda como se envió en el historial |

### A validar por quien dirige el proyecto

- **Con una versión pendiente no se envía otra**: para corregir un presupuesto
  enviado hay que registrar el rechazo (vuelve a diagnóstico) y enviar la
  siguiente. Si se quiere reemplazarlo sin respuesta, es agregar
  `WAITING_APPROVAL` a `QUOTE_SENT.from`; la transacción ya marca la anterior
  como `SUPERSEDED`.
- **La nota del envío va a la línea de tiempo pública**, no al presupuesto.

### Búsqueda y filtros

No hay listado propio: los presupuestos salen completos en el detalle de su
orden, de la versión más nueva a la más vieja, cada uno con sus ítems en el
orden de la foto.

## Endpoints

| Método | Ruta | Roles | Respuesta |
|---|---|---|---|
| `POST` | `/work-orders/:workOrderId/quotes` | `ADMIN` | `WorkOrderDetail` (201); 400 sin ítems, 404, 409 estado o cambio simultáneo |
| `POST` | `/work-orders/:workOrderId/quotes/:quoteId/decision` | `ADMIN` | `WorkOrderDetail`; 404 (presupuesto de otra orden), 409 ya decidido, orden fuera de espera o cambio simultáneo |

Cuerpo del envío: `note` opcional (hasta 2000), para el cliente. De la
respuesta: `decision` (`APPROVED` | `REJECTED`), `channel` (`PHONE` |
`WHATSAPP` | `IN_PERSON`) y `note` opcional (hasta 2000).

`WorkOrderDetail` suma `quotes`: `quoteId`, `version`, `status` (`PENDING`,
`APPROVED`, `REJECTED`, `SUPERSEDED`), `total`, `sentAt`, `sentBy`,
`decidedAt`, `decidedBy`, `decisionChannel`, `decisionNote` e `items`
(`type`, `description`, `quantity`, `unitPrice`, `subtotal`).

## Avance

- [x] `SYSTEM_TRANSITIONS` y `canApplySystemTransition` en
  `work-order-status.ts`, con su test.
- [x] DTO (`CreateQuoteDto`, `DecideQuoteDto`), entidades (`Quote`,
  `QuoteItem`), `WorkOrderQuotesService` y los dos endpoints; el detalle de la
  orden con `quotes`.
- [x] Tests: envío (estados, sin ítems, foto sin costo y en orden, versión,
  `SUPERSEDED`, evento público con la nota, cambio simultáneo), respuesta
  (aprobado y rechazado, canal, ya decidido en cada estado, orden cancelada,
  presupuesto de otra orden, registro simultáneo), DTO y entidad. 598 tests
  del backend.
- [x] Validación de quien dirige el proyecto desde el frontend (2026-10-16):
  envío, rechazo, nueva versión y aprobación, como administrador y como
  mecánico, contra la API real.
