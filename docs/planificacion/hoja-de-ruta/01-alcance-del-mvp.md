# Alcance del MVP

AutoFix Motors reemplaza el trabajo manual de un taller mecánico: quién trajo
qué vehículo, qué se le hizo, con qué repuestos, cuánto se cobró y en qué estado
está. El cliente sigue el avance desde su portal, con la cuenta que le habilita
el taller (antes: una página pública por código; ver «Seguimiento público»).

Es un proyecto chico a propósito: lo necesario para llevar el seguimiento de los
servicios y saber cuánto generan. No es un ERP.

## Decisiones tomadas

| Tema | Decisión | Por qué |
|---|---|---|
| Acceso del cliente al seguimiento | **Código por orden** (aleatorio, ej. `AFM-7K3Q9X`) | La placa sola no sirve: se ve en la calle y cualquiera vería el estado del auto de otro |
| Dinero | **Pagos por orden + reportes**, sin gastos del taller | Lo que el taller necesita saber es cuánto generan las reparaciones; registrar egresos es otra captura diaria que no se pidió |
| Presupuesto | **Lo responde el cliente desde su portal**, o el administrador registra la respuesta que llega por teléfono, WhatsApp o en el taller | Cambió en 2026-10 (antes solo el administrador): el canal «Portal» dice que respondió el propio cliente |
| Mecánico | **Ve solo sus órdenes asignadas** | El administrador asigna y reasigna; el mecánico no se distrae con lo ajeno |

## La pieza central: la orden de trabajo

Todo cuelga de la orden de trabajo (OT): el cliente y su vehículo, el mecánico
asignado, los servicios y repuestos, los cambios de estado —que alimentan el
seguimiento público— y los pagos —que alimentan los ingresos—.

```
RECEIVED ──► DIAGNOSIS ──► WAITING_APPROVAL ──► IN_PROGRESS ⇄ WAITING_PARTS
(recibido)  (diagnóstico)  (presupuesto enviado) (en reparación) (esperando repuestos)
                                                       │
                                                       ▼
                                          READY ──► DELIVERED
                                (listo para recoger)  (entregado)

CANCELLED (cancelado): desde cualquier estado antes de DELIVERED.
```

Cada cambio de estado guarda fecha, usuario y una nota opcional, marcada como
**pública** (la ve el cliente) o **interna**.

## Módulos

| Grupo (`prisma/schema/`) | Módulo | Qué hace |
|---|---|---|
| `core` | `users` | Personal, de forma simple: alta y baja de usuarios, rol, cambio de contraseña. Carga de trabajo por mecánico (órdenes abiertas) |
| `customer` | `customers` | Cliente: nombre, DNI o RUC, teléfono, correo. Búsqueda por nombre, documento o teléfono |
| `customer` | `vehicles` | Vehículo: placa única, marca, modelo, año, color, VIN opcional. Historial de órdenes por vehículo |
| `workshop` | `service-catalog` | Catálogo de servicios con precio referencial de mano de obra (cambio de aceite, afinamiento…) |
| `workshop` | `work-orders` | La OT: ingreso (kilometraje, motivo, fecha prometida), diagnóstico, ítems (servicios y repuestos), estados, mecánico |
| `workshop` | `quotes` | Presupuestos versionados de una OT y la decisión del cliente, registrada por el administrador |
| `inventory` | `products` | Repuestos e insumos: código, unidad, stock, stock mínimo, costo, precio de venta. Alerta de stock bajo |
| `inventory` | `stock-movements` | Kardex simple: entrada (compra), salida (consumo en una OT, automática), ajuste |
| `inventory` | `tools` | Herramientas: código, estado (operativa, en reparación, de baja), mecánico que la tiene |
| `finance` | `payments` | Pagos por OT: efectivo, Yape/Plin, tarjeta, transferencia. Adelantos y saldo pendiente |
| `finance` | `reports` | Ingresos por período, por servicio y por mecánico; mano de obra frente a repuestos; margen de repuestos |
| `workshop` | `portal` | Portal del cliente (reemplaza a `tracking`): sus vehículos, sus órdenes y la respuesta a los presupuestos. Sin tablas propias |

**Inicio (dashboard):** órdenes abiertas por estado, listas para entregar,
vencidas (pasó la fecha prometida), ingresos del mes (solo ADMIN) y productos con
stock bajo.

## Seguimiento público

> **Cambió en 2026-10:** el seguimiento es con sesión, en el **portal del
> cliente** (planes `auth/01-login-compartido-y-contrasenas.md` y
> `portal/01-portal-del-cliente.md`). Lo que sigue es la decisión original, que
> queda como referencia.

- Cada OT nace con un **código de seguimiento** aleatorio y no secuencial
  (`AFM-7K3Q9X`). Va impreso en la constancia de ingreso y se comparte con un
  enlace `…/seguimiento/AFM-7K3Q9X` y un botón **Enviar por WhatsApp** (enlace
  `wa.me` con el texto prellenado: sin API ni costo).
- **Muestra:** marca y modelo, placa enmascarada, estado actual, línea de tiempo
  con las notas públicas, fecha prometida y el presupuesto vigente.
- **No muestra:** datos personales del cliente, notas internas, costos ni
  márgenes.
- Endpoints `@Public()` con límite de intentos (el `ThrottlerModule` que ya usa
  el login), para que nadie recorra códigos por fuerza bruta.

## Presupuesto

- En `DIAGNOSIS` el taller arma el presupuesto (servicios y repuestos) y lo
  **envía**: se congela como una versión con sus ítems y su total, y la OT pasa a
  `WAITING_APPROVAL`. El cliente lo ve, solo lectura, en su página de
  seguimiento.
- El cliente responde por teléfono, WhatsApp o en el taller, y **el
  administrador registra la decisión**: aprobado o rechazado, el canal por el que
  llegó y una nota opcional. Queda quién la registró y cuándo.
- Aprobar lleva la OT a `IN_PROGRESS`; rechazar la devuelve al taller, que ajusta
  el presupuesto o la cancela (cobrando el diagnóstico si corresponde).
- Si aparece otro problema a mitad de la reparación, el taller envía una **nueva
  versión** y se vuelve a registrar la decisión. Las versiones anteriores quedan
  en el historial.
- Todo o nada: no se aprueban ítems sueltos.

## Roles

| Rol | Puede |
|---|---|
| `ADMIN` | Todo, incluido registrar la aprobación o el rechazo de un presupuesto |
| `MECHANIC` | Ver sus órdenes asignadas, cambiar su estado, agregar notas y los repuestos consumidos; consultar stock y herramientas. No ve pagos, reportes, costos ni márgenes, ni gestiona usuarios |

## Fuera del alcance

- Facturación electrónica (SUNAT). Se puede imprimir una constancia, no un
  comprobante.
- Citas o reservas en línea.
- Notificaciones automáticas (SMS, correo, API de WhatsApp).
- Aplicación móvil.
- Varias sedes.
- Planillas, asistencia o sueldos del personal.
- Órdenes de compra a proveedores: una compra entra como movimiento de stock.
- Gastos del taller y utilidad neta.
- Fotos del vehículo: necesitan almacenamiento de archivos (S3). Primera
  candidata para después del MVP.

## Hoja de ruta

Cada fase tiene su propio plan detallado en `docs/planificacion/<módulo>/`
antes de implementar, y se trabaja en una rama `feature/...` con su PR en
**backend** y **frontend**.

- [x] **Fase 1 — Personal, clientes y vehículos.** `core/users`,
  `customer/customers`, `customer/vehicles`.
- [x] **Fase 2 — Servicios.** Catálogo de servicios, órdenes de trabajo con
  estados y línea de tiempo, presupuestos versionados.
- [x] **Fase 3 — Portal del cliente** (antes «Seguimiento público»). Acceso
  con cuenta, sus vehículos y órdenes, y la respuesta a los presupuestos.
  Validada el 2026-10-24.
- [x] **Fase 4 — Inventario.** Productos, movimientos, consumo desde la OT,
  herramientas.
- [ ] **Fase 5 — Ingresos.** Pagos por orden, reportes y dashboard de inicio.

El orden sigue las dependencias: no hay OT sin cliente y vehículo, no hay
seguimiento sin OT, y los reportes necesitan pagos y repuestos para decir algo.
