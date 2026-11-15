# Glosario

Desde 2026-11 el dominio se escribe en español en el código, la base y la API
(ver `.claude/rules/nomenclatura.md`). Este glosario fija **cómo se escribe cada
término** y qué clase de NestJS lo maneja, que sigue en inglés porque es
estructura.

Un término nuevo se agrega aquí **antes** de usarlo, para que no aparezcan dos
nombres para lo mismo. Sin tildes ni ñ: `anio`, `contrasena`, `diagnostico`.

## Entidades

| Modelo | Qué es | Módulo (estructura) | Ruta de la API |
|---|---|---|---|
| `Usuario` | Personal del taller que inicia sesión: administrador o mecánico | `modules/core/users` | `/users` |
| `Sesion` | Sesión iniciada (token de refresco rotado) | `modules/core/sessions` | — |
| `CuentaCliente` | Acceso del cliente a su portal | `modules/core/customer-accounts` | `/customer-accounts` |
| `Cliente` | Persona o empresa dueña del vehículo | `modules/customer/customers` | `/customers` |
| `Vehiculo` | Lo que entra al taller; placa única | `modules/customer/vehicles` | `/vehicles` |
| `Servicio` | Servicio del catálogo con precio referencial de mano de obra | `modules/workshop/service-catalog` | `/service-catalog` |
| `Producto` | Repuesto o insumo con stock | `modules/inventory/products` | `/products` |
| `MovimientoStock` | Kardex: compra, consumo en una orden o ajuste | `modules/inventory/stock-movements` | `/stock-movements` |
| `OrdenTrabajo` | Orden de trabajo (OT): un ingreso del vehículo | `modules/workshop/work-orders` | `/work-orders` |
| `EventoOrden` | Cambio de estado o nota de la línea de tiempo | `modules/workshop/work-orders` | — |
| `DetalleOrden` | Lo que se cobra: un servicio o un repuesto | `modules/workshop/work-orders` | `/work-orders/:id/items` |
| `Presupuesto` | Propuesta al cliente, versionada | `modules/workshop/work-orders` | `/work-orders/:id/quotes` |
| `DetallePresupuesto` | Copia de los detalles al enviar el presupuesto | `modules/workshop/work-orders` | — |

## Campos que conviene conocer

| Campo | Significado |
|---|---|
| `kilometrajeIngreso` | Kilometraje al ingreso, en km |
| `fechaPrometida` | Cuándo se le dijo al cliente que estaría listo |
| `codigoSeguimiento` | Aleatorio, no secuencial (`AFM-7K3Q9X`) |
| `numero` | Correlativo interno de la orden (OT-000123); no se muestra al cliente |
| `motivo` | Lo que pide el cliente, con sus palabras |
| `esPublico` | El evento lo ve el cliente en su portal |
| `precioManoObra` | Precio referencial de un servicio |
| `stockMinimo`, `stockBajo` | Debajo de este valor se alerta (`stock <= stockMinimo`) |
| `costo`, `precio`, `margen` | En soles. El margen (`precio − costo`) solo lo ve el administrador |
| `canalDecision` | Por dónde respondió el cliente al presupuesto |
| `miembroDesde` | En «Mi perfil» (`GET /auth/profile`): el `creadoEn` del usuario o del cliente |

## Enums

| Enum | Valores |
|---|---|
| `RolUsuario` | `ADMINISTRADOR`, `MECANICO`. La sesión del cliente usa el rol `CLIENTE` |
| `TipoDocumento` | `DNI`, `RUC`, `CE` (carné de extranjería), `PASAPORTE` |
| `EstadoOrden` | `RECIBIDO`, `EN_DIAGNOSTICO`, `ESPERANDO_APROBACION`, `EN_REPARACION`, `ESPERANDO_REPUESTOS`, `LISTO`, `ENTREGADO`, `CANCELADO` |
| `TipoDetalle` | `SERVICIO`, `PRODUCTO` |
| `EstadoPresupuesto` | `PENDIENTE`, `APROBADO`, `RECHAZADO`, `REEMPLAZADO` |
| `CanalDecision` | `TELEFONO`, `WHATSAPP`, `EN_PERSONA`, `PORTAL` |
| `TipoProducto` | `REPUESTO`, `INSUMO` |
| `UnidadMedida` | `UNIDAD`, `LITRO`, `GALON`, `KIT`, `METRO` |
| `TipoMovimiento` | `COMPRA`, `ORDEN_TRABAJO`, `AJUSTE` |
| `TipoPerfil` | `PERSONAL`, `CLIENTE`: de quién es «Mi perfil». Solo en la API, no es un enum de la base |

## Términos que se quedan como están

`DNI`, `RUC`, `SUNAT`, `VIN`, `Yape`, `Plin`.

## Claves primarias

Cada modelo tiene su clave primaria como `<entidad>Id` (`clienteId`,
`ordenTrabajoId`), nunca `id`. La clave foránea se llama igual que la primaria a
la que apunta.
