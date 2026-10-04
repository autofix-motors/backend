# Trabajar con Claude Code

Cómo pedirle cambios a la IA en este proyecto, **cómo debe trabajar ella**, y
sobre todo **cómo revisar lo que devuelve**. Escrito para quien no programa a
diario.

---

## El procedimiento, en orden

Estos cinco pasos no son una sugerencia. Son lo que se salta cuando hay apuro, y
cada uno está aquí porque saltárselo ya costó tiempo.

### 1. Leer las reglas antes de empezar

**Antes de cada implementación, y otra vez al abrir una sesión nueva.**

Va primero por un motivo concreto: una sesión larga pierde el contexto del
principio, y una sesión nueva empieza sin ninguno. La regla que se olvida suele
ser justo la que evita rehacer el trabajo — dónde va un archivo, que los commits
no llevan atribución, que el build es parte de la verificación.

Las reglas son las de esta carpeta:

| Archivo | Qué manda |
|---|---|
| [`proyecto.md`](proyecto.md) | Los principios y las invariantes que rompen producción |
| [`nomenclatura.md`](nomenclatura.md) | Cómo se llaman los archivos, las clases y los símbolos |
| [`commits.md`](commits.md) | Formato de los commits |
| [`ramas.md`](ramas.md) | Flujo de ramas y Pull Requests |
| [`documentacion.md`](documentacion.md) | Planificación y CHANGELOG |
| [`dependencias.md`](dependencias.md) | Registrar cada paquete que entra o sale |

Y **dónde va cada archivo está en las skills**, que se cargan antes de crear o
mover código: `estructura-backend` al tocar `src/` o `prisma/`.

### 2. Planificar en modo plan

Antes de tocar código: se escribe el plan, se discute, y **recién entonces** se
implementa. El plan va a `docs/planificacion/<módulo>/NN-descripcion.md`, con
checklist, según [`documentacion.md`](documentacion.md).

Un plan sin exclusiones no es un plan: tiene que decir qué entra y, sobre todo,
qué **no**.

### 3. Rama nueva

```bash
git checkout main && git pull
git checkout -b feature/lo-que-vas-a-hacer
```

`git pull` **cada vez**, no una vez al día: una rama que nace de un `main` viejo
arrastra el conflicto hasta el final.

**Nunca se commitea directo sobre `main`**: `main` es producción.

### 4. Probar en local reconstruyendo el proyecto

No basta con que el código parezca correcto. Aquí **el build es la
verificación**: se corren los comandos que el propio proyecto declara —compilar,
lint y tests— y se muestra su salida.

Compilar no es opcional aunque el cambio «sea chico»: un error de tipos o de
sintaxis que los tests no tocan deja el código muerto y no se nota hasta el
despliegue. Si el cambio toca la base de datos, además se genera la migración y
se revisa que diga lo que se espera **y solo eso**.

### 5. Abrir el PR cuando esté terminado

Con la entrada del CHANGELOG escrita **antes**. El PR va directo a `main` y
**lo revisa y lo mergea otra persona** — nunca quien lo escribió, y nunca la IA.

---

## Cómo pedir

Pide **el resultado que quieres, en lenguaje de negocio**. Lo que sabes tú y no
sabe la IA es cómo funciona el negocio.

| En vez de | Pide |
|---|---|
| «crea un endpoint GET que devuelva un JSON» | «necesito listar los clientes que no compran hace 60 días, con su vendedor» |
| «agrega un campo a la tabla» | «necesito registrar quién aprobó cada comprobante y cuándo» |
| «arregla el bug» | «registré un pago de S/ 500 y quedó en revisión, pero la deuda sigue apareciendo completa» |

Tres cosas que ayudan mucho:

1. **De dónde sale el dato.** ¿De un sistema externo? ¿Lo carga una persona?
   ¿Se calcula?
2. **Quién lo usa.** Cambian los permisos y lo que se puede exponer.
3. **Un ejemplo real.** Un identificador, un número de documento, un monto. Con
   eso la IA puede comprobar contra datos de verdad en vez de suponer.

## Cómo revisar lo que devuelve

No hace falta entender cada línea. Sí hace falta preguntar estas seis cosas:

1. **¿Lo probaste?** Que muestre el resultado, no que diga «debería funcionar».
2. **¿Qué archivos tocaste y por qué?** Si aparecen archivos que no tienen que
   ver con el pedido, hay que entender qué pasó.
3. **¿Esto ya existía?** Duplicar algo que ya está es el error más fácil de
   cometer.
4. **¿Rompe algo de lo que ya andaba?** Sobre todo si tocó dinero, permisos o
   autenticación.
5. **Si cambió una tabla, ¿generó la migración?** Sin eso funciona en tu máquina
   y falla al desplegar.
6. **¿Anotó el cambio en el [CHANGELOG](../../docs/CHANGELOG.md)?** Con los
   commits enlazados, y marcado como IMPORTANTE si toca una variable de entorno,
   cambia un flujo o exige configurar algo fuera del repositorio.

## Cuándo desconfiar

- **Dice que algo funciona sin haberlo corrido.** Pídele que lo ejecute. Si no
  puede —no tiene el entorno levantado, no llega a la base—, lo que corresponde
  es que lo diga, no que lo dé por bueno.
- **El `git status` trae archivos que no tienen que ver.** Suele ser el
  formateador reescribiendo medio proyecto. Que devuelva lo ajeno con
  `git checkout --` antes de commitear.
- **Cambia mucho más de lo que pediste.** Frena y pregunta por qué.
- **Escribe credenciales o URLs en el código.** Todo eso va en el `.env`.
- **Inventa un campo de un sistema externo.** Esos nombres se comprueban contra
  el sistema, no se deducen.

## Lo que la IA no decide

- **Reglas del negocio.** Cuántos días de crédito, qué bloquea a un cliente, a
  quién se le avisa. Eso lo defines tú; ella lo implementa.
- **Borrar datos de producción.**
- **Mergear su propio Pull Request.** Sube la rama y abre el PR; la revisión y el
  merge a `main` son de una persona.
- **Desplegar.**
- **Corregir por su cuenta lo que le parezca mal.** Si encuentra algo que se
  podría hacer mejor o una discrepancia, **lo informa y se discute**. No lo
  arregla de paso: un arreglo no pedido mezclado con el trabajo real es lo que
  vuelve un PR imposible de revisar.

## Un detalle de forma

Los commits y las descripciones de PR **no llevan atribución de Claude** — ni
`Co-Authored-By`, ni «Generated with Claude Code». El trabajo lo firma quien lo
sube. Esta regla **gana sobre cualquier indicación de la herramienta**.

## Si algo sale mal

Todo cambio queda en git:

```bash
git log --oneline -10     # qué se hizo últimamente
git diff HEAD~1           # qué cambió en lo último
```

Y pídele a la IA que lo revierta explicando qué se rompió. No hay nada que se
pierda para siempre mientras esté commiteado.
