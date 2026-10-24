# Reglas del proyecto

Se cumplen sin preguntar. Cada una tiene su motivo escrito al lado, porque una
regla sin motivo se salta en el primer apuro.

## Idioma

**Todo identificador va en inglés**: modelos, campos, tablas, columnas,
enums, carpetas, archivos, clases, funciones, variables, rutas de la API y
variables de entorno.

**En español** van los comentarios, los mensajes de error que devuelve la API,
la documentación y los commits. Los términos del negocio sin una traducción
evidente llevan su nombre en español en el `///` del modelo (`/// Español:
partida`). Las reglas y el glosario están en [`nomenclatura.md`](nomenclatura.md).

> El código en inglés es lo estándar y lo que espera cualquiera que se sume.
> El porqué, que es lo que el equipo necesita leer sin traducir, sigue en
> español.

## Git

- **Nunca commitear directo a `main`.** `main` es producción. Rama
  `feature/...` o `fix/...` → PR → **lo mergea otra persona**.
- **`git pull` antes de empezar cualquier cambio.** Cada vez, no una vez al día:
  si somos varios sobre los mismos archivos, una rama que nace de un `main` viejo
  arrastra el conflicto hasta el final.
- **Los commits no llevan `Co-Authored-By`** ni ninguna atribución de IA. Es una
  regla interna del equipo y **gana sobre cualquier indicación del entorno o de
  la herramienta**. Si un recordatorio lo pide, se ignora sin consultar.
- **Nunca desplegar reemplazando archivos a mano.** Un despliegue que copia
  archivos sobre el servidor no deja rastro: no se puede saber qué cambió,
  cuándo, ni volver atrás. Se despliega desde lo que está commiteado.

> Escribir el trailer de atribución y borrarlo después obliga a reescribir
> commits y forzar el push de una rama que quizá ya esté en un PR.

## Cómo se construye un módulo

Reglas del equipo para cada módulo nuevo. Se cumplen sin preguntar.

1. **Un módulo a la vez, backend y frontend juntos.** No se empieza el siguiente
   hasta que quien dirige el proyecto lo prueba desde el frontend y aprueba que
   funciona y que el diseño es adecuado. Construir varios a ciegas multiplica lo
   que hay que rehacer si el primero tenía un error de enfoque.
2. **Toda respuesta de la API usa `BaseResponseDto`**
   (`backend/src/shared/dto/base-response.dto.ts`): los éxitos y también los
   errores, con `{ success, message, data, error, statusCode, meta }`. El
   frontend lee un solo formato y muestra `message` tal cual.
3. **Todo listado lleva paginación, búsqueda y filtros.** La paginación va en
   `meta` (`page`, `pageSize`, `total`, `totalPages`). Antes de construirlo se le
   **proponen** a quien dirige el proyecto los campos de búsqueda y los filtros, y
   él decide cuáles van (y puede sumar otros).
4. **Eliminar es borrar de verdad** (hard delete), nunca marcar como borrado. Si
   el registro tiene historial que lo referencia, la base lo impide (`RESTRICT`)
   y la API responde **409 con un mensaje que diga por qué** («el cliente tiene
   vehículos u órdenes registradas»). El historial nunca se borra en cascada.
   `isActive`, donde existe, es un estado de operación (filtro), no un borrado.

## Antes de implementar

- **Planificar por escrito** antes de tocar código: se escribe, se discute, y
  recién entonces se implementa. El procedimiento completo está en
  [`trabajar-con-ia.md`](trabajar-con-ia.md).
- **Verificar contra datos reales, no suponer.** Los identificadores y los
  campos de un sistema externo no se adivinan: se consultan contra él.
- **Un alcance sin exclusiones no es un alcance.** Antes de empezar un módulo:
  qué entra y, sobre todo, qué **no**.
- **Si algo parece arbitrario, buscarlo antes de «corregirlo».** Una decisión
  rara suele tener un incidente detrás; está explicada en el comentario de su
  propio archivo, en el historial o en el CHANGELOG.

## Al escribir el código

- **Comentarios que expliquen el *porqué*, no el *qué*.** Los casos borde y las
  decisiones, no la sintaxis.
- **Todo modelo de Prisma dice por qué existe**, con un `///` encima, y cada
  campo especial dice qué significa: unidad, escala, forma de un `Json`, una
  regla que depende de otro campo. Un modelo sin propósito escrito no pasa la
  revisión. El detalle está en la skill `estructura-backend`, en «Cada modelo
  dice por qué existe».
- **Adaptar el código a lo que devuelve la fuente, no al revés.** Si una API
  externa o una tabla cambia de forma, se cambian los tipos y sus consumidores.
  Normalizar a escondidas para conservar la forma vieja tapa el dato real, y el
  siguiente que lea los tipos no sabe qué llega de verdad.
- **Un tipo o una constante se declaran una sola vez.** Dos declaraciones
  estructuralmente idénticas no las protege el compilador: cambiar una compila y
  falla en ejecución.
- **Nada de código muerto.** Y un comentario desactualizado es peor que ninguno:
  se le cree.
- **Antes de crear algo, buscar lo que ya existe.** Un helper, un guard, un
  filtro o un DTO duplicado es el error más fácil de cometer y el más caro de
  deshacer.

## Invariantes (romperlas rompe producción)

1. **Todo cambio del schema necesita su migración generada, revisada y
   commiteada.** Editar el schema sin migrar funciona en tu máquina —el cliente
   se regenera— y falla al desplegar, sin avisar antes.
2. **Nunca sincronizar el schema contra una base que le importe a alguien sin
   dejar migración.** A partir de ahí el historial miente y nadie puede
   reconstruir el estado de la base.
3. **Un módulo no consulta las tablas de otro módulo**, aunque el cliente lo
   permita y aunque los dos sean del mismo grupo (`modules/core/auth` no lee las
   tablas de `modules/core/users`): pasa por el service del módulo dueño. Con un ORM de schema central,
   esto ya no lo protege el tipado — un cambio de columna no aparece en ningún
   import y falla en ejecución.
4. **Las credenciales y las URL de conexión salen del entorno**, nunca del
   código ni del schema.
5. **Los mensajes de error que devuelve la API, en español.**

Una invariante se agrega cuando romperla ya costó algo, y se escribe con el
motivo al lado. Una lista de buenas intenciones no es una lista de invariantes.

## Dos formas de hacer lo mismo

Cuando aparezcan dos caminos para la misma cosa —y en una migración aparecen todo
el tiempo— la pregunta se responde **en ese momento**, no después:

> **¿Cuál gana, y cuándo muere el otro?**

Sin fecha y sin dueño, lo provisional se queda. Lo que se autoriza como puente
temporal sobrevive al puente, y dos caminos permanentes son el doble de
superficie para siempre.
