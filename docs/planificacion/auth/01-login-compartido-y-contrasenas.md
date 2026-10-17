# Login compartido, acceso de clientes y contraseñas temporales

Módulo A del portal del cliente. Cambia una decisión del alcance del MVP: el
cliente **sí inicia sesión** (antes seguía su orden con un código, sin cuenta).
Este módulo arma el acceso; lo que el cliente ve y hace dentro (su portal) es el
módulo B y los inicios con gráficos, el C.

## Qué entra y qué no

- **Entra:** login del personal y del cliente con **número de documento o
  correo**; acceso al portal que el administrador habilita, restablece o quita
  por cliente; **contraseña temporal generada** (para clientes y para el
  personal) que vence y obliga a cambiarla en el primer ingreso; cambio de la
  propia contraseña para cualquiera; DNI del personal.
- **No entra:** el portal en sí (módulo B), registrarse solo, «olvidé mi
  contraseña» (el taller no envía correos ni SMS), segundo factor, enviar el
  WhatsApp desde la API (es un enlace `wa.me` que abre el administrador).

## Decisiones

| Decisión | Por qué |
|---|---|
| **`CustomerAccount`** (tabla `core_customer_account`) aparte, una por cliente como máximo (`customerId @unique`, Cascade). Existe solo si el administrador habilitó el portal; quitar el acceso es borrarla | El cliente no es un `User`: si fuera un rol más de `UserRole`, un `@Roles(...)` mal puesto o un cambio de rol lo mezclaría con el personal. La contraseña no va en `Customer` para que el hash no viaje en cada `include` del cliente |
| `Session` apunta a un usuario **o** a una cuenta de cliente (`userId` y `customerAccountId` opcionales, CHECK `num_nonnulls(...) = 1` escrito a mano) | La rotación del refresco y la detección de reuso siguen en un solo `SessionsService`. Prisma no modela el CHECK: lo documenta el `///` |
| `SessionsService` sale de `auth/` a su propio módulo `core/sessions/` | `auth` necesita las cuentas de clientes para el login y las cuentas necesitan las sesiones para revocarlas: con las sesiones dentro de `auth` sería un ciclo |
| El JWT lleva `{ sub, role, mustChangePassword }`. Para el cliente `role: 'CUSTOMER'` (fuera del enum `UserRole`) y `sub` es su `customerId`. El `AccessGuard` deja `request.user` (personal, igual que hoy) o `request.customer` | Los services del personal no cambian; el cliente nunca llega a ser un `SessionUser` |
| **El `RolesGuard` niega al cliente por defecto**: solo pasa por un endpoint marcado `@CustomerOnly()` o `@AnySession()`. `@CurrentUser()` responde 403 a un cliente | Hoy un endpoint sin `@Roles` solo pide sesión: con clientes dentro, olvidarse el decorador abriría datos del taller. Así el olvido cierra en vez de abrir |
| **Cambio obligatorio**: `mustChangePassword` en `User` y `CustomerAccount`, en el JWT, y un `PasswordChangeGuard` global que responde 403 «Cambia tu contraseña temporal para continuar» salvo en `@AllowPendingPasswordChange()` (`GET /auth/session` y `PUT /auth/password`) | El guard no consulta la base; al cambiarla se emiten tokens nuevos sin la marca |
| **Contraseña temporal** generada por la API: 12 caracteres con `crypto.randomInt` sobre un alfabeto sin ambiguos (sin 0/O/o, 1/l/I/i). Vence a los `TEMPORARY_PASSWORD_DAYS` (7 por omisión). Se devuelve una sola vez, con `Cache-Control: no-store` | El administrador ya no elige la contraseña de nadie: la comparte por WhatsApp y el dueño la cambia. Que venza limita lo que queda expuesto en el chat |
| **Identificador**: con `@` es un correo (en minúsculas); si no, un documento normalizado (`normalizeDocumentNumber`, que pasa a `shared/`). Personal: `email` y `documentNumber` únicos. Cliente: el documento puede repetirse entre tipos y el correo no es único, así que se buscan las cuentas candidatas y se verifica la contraseña contra cada una: una sola coincide → entra; varias → «Ese dato lo comparten varias cuentas: ingresa con tu número de documento» | Sin agregar unicidades que hoy el negocio no tiene. Con contraseñas aleatorias, dos coincidencias no ocurren en la práctica |
| Login separado: `POST /auth/login` (personal, «Soy interno») y `POST /auth/customer-login` (cliente, la vista por omisión) | Un mismo DNI puede ser de un mecánico y de un cliente: el botón dice a cuál de los dos se entra |
| Mensaje genérico «Usuario o contraseña incorrectos»; con cero candidatos se verifica contra el hash señuelo | No delatar qué documentos o correos tienen cuenta |
| Cliente **inactivo** no entra ni renueva su sesión; desactivarlo cierra sus sesiones | Igual que un usuario dado de baja |
| El throttle del login cuenta por IP, tipo de login e identificador normalizado: 5 por minuto y 20 por hora. El cambio de contraseña también se limita, por quien lo pide | Todas las peticiones llegan desde la IP del BFF; el límite por hora frena a quien prueba despacio |
| `PUT /auth/password` pide la actual, exige al menos 8 caracteres, distinta de la actual y del propio documento o correo; revoca todas las sesiones del dueño y abre una nueva | Que una contraseña filtrada deje de servir en todos lados |
| `POST /users` ya no recibe `password`: pide el DNI y responde la temporal. `PUT /users/:userId/password` se reemplaza por `POST /users/:userId/temporary-password` | El administrador no conoce la contraseña de nadie |
| El correo de los clientes se guarda en minúsculas (migración + DTO) | Es un identificador de login |

### A validar por quien dirige el proyecto

- Un cliente inactivo no entra al portal.
- El personal también recibe contraseña generada: el administrador ya no la elige.
- La temporal vence a los 7 días.
- El usuario que va en el WhatsApp es el **número de documento** (todo cliente lo tiene; el correo es opcional).
- El personal existente queda sin DNI hasta que se le cargue: entra por correo mientras tanto.
- El listado de clientes muestra si tiene acceso al portal, sin filtro nuevo.

### Búsqueda y filtros

Sin listados nuevos. El de usuarios busca también por DNI.

## Endpoints

| Método | Ruta | Quién | Respuesta |
|---|---|---|---|
| `POST` | `/auth/login` | público, con throttle | `CurrentSession`; 401 |
| `POST` | `/auth/customer-login` | público, con throttle | `CurrentSession`; 401 (incluye ambiguo, vencida, inactivo) |
| `POST` | `/auth/refresh`, `/auth/logout` | público | igual que hoy, para los dos |
| `GET` | `/auth/session` | cualquier sesión, aun con cambio pendiente | `CurrentSession` |
| `PUT` | `/auth/password` | cualquier sesión, aun con cambio pendiente, con throttle | `CurrentSession` y cookies nuevas; 400, 401 |
| `POST` | `/users` | `ADMIN` | `{ user, temporaryPassword, expiresAt }` (201); 409 correo o DNI repetido |
| `POST` | `/users/:userId/temporary-password` | `ADMIN` | `{ temporaryPassword, expiresAt }` |
| `POST` | `/customer-accounts/:customerId/temporary-password` | `ADMIN` | `{ temporaryPassword, loginIdentifier, expiresAt }`; 400 cliente inactivo, 404 |
| `DELETE` | `/customer-accounts/:customerId` | `ADMIN` | `null`; 404 sin acceso |

`CurrentSession`: `role` (`ADMIN` \| `MECHANIC` \| `CUSTOMER`), `name`,
`email` o null, `mustChangePassword`, `userId` o null, `customerId` o null.
`Customer` suma `portalAccess` (`createdAt`, `lastLoginAt`,
`mustChangePassword`) o null. `User` suma `documentNumber`.

## Avance

- [x] Schema y migración (`20261017041056_acceso_al_portal`): `User.documentNumber`,
  `mustChangePassword`, `passwordExpiresAt`; `CustomerAccount`; `Session` con
  `customerAccountId` y el CHECK `core_session_owner_check`; correos de
  clientes en minúsculas. SQL revisado: solo agrega.
- [x] `passwords.ts` (generar, hashear, verificar), `login-identifier.ts` y
  `TEMPORARY_PASSWORD_DAYS`.
- [x] `SessionsModule` aparte, para usuarios y cuentas de clientes.
- [x] JWT, `AccessGuard`, `RolesGuard` (niega al cliente por defecto),
  `PasswordChangeGuard`, decoradores y throttle (5/min y 20/h).
- [x] Login del personal y del cliente, sesión, cambio de contraseña.
- [x] Usuarios: DNI y contraseña temporal. Cuentas de clientes: habilitar,
  restablecer, quitar. Clientes: `portalAccess`, correo en minúsculas, cierre
  de sesiones al desactivar.
- [x] Tests: 643 del backend (tabla completa del RolesGuard, PasswordChangeGuard,
  logins por documento y correo, ambiguo, vencida, inactivo, refresh sin
  acceso, generador). Contra la API real: un token de cliente recibe 403 en
  los endpoints del personal y uno con la temporal, 403 hasta cambiarla.
- [x] Frontend (nota en `frontend/docs/planificacion/auth/`).
- [ ] Validación de quien dirige el proyecto desde el frontend: revisó el alta
  de personal con su contraseña temporal (2026-10-16); falta recorrer el
  acceso del cliente completo.
