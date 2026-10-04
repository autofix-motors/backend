# Documentación de cambios

Dos artefactos, uno para cada momento del trabajo:

| Artefacto | Momento | Qué guarda |
|---|---|---|
| `docs/planificacion/` | **Antes** de implementar | Lo que se va a hacer, cómo, y el avance |
| `docs/CHANGELOG.md` | **Antes de abrir el PR** | Lo que se hizo |

## `docs/planificacion/`

**Se escribe en el modo plan de Claude Code, antes de tocar código.** Se escribe,
se discute, y recién entonces se implementa. El procedimiento completo está en
[`trabajar-con-ia.md`](trabajar-con-ia.md).

### Agrupado por módulo, no en una lista plana

```
docs/planificacion/
├── auth/
│   ├── 01-login-por-correo.md
│   └── 02-renovacion-de-token.md
├── usuarios/
│   ├── 01-alta-de-un-usuario.md
│   └── 02-roles-y-permisos.md
└── pagos/
    └── 01-conciliacion-de-comprobantes.md
```

Una carpeta por módulo o dominio. Dentro, archivos `NN-descripcion.md` con el
correlativo **de esa carpeta**, que empieza en `01`.

**Antes de crear una carpeta nueva, se mira si el trabajo pertenece a una que ya
existe.** Una planificación de «renovar el token» es de `auth/`, no de una
carpeta propia. Cada carpeta suelta de más es un sitio más donde buscar.

> El agrupado no es estética: en una lista plana, dos trabajos que arrancan a la
> vez sin verse eligen el mismo número y el correlativo deja de significar algo.
> Con una carpeta por módulo, cada una lleva su propia cuenta.

### El plan lleva checklist, y marcarlo es obligatorio

Un trabajo casi nunca cabe en una sesión. Cada paso se escribe como casilla:

- `- [ ]` pendiente
- `- [x]` terminado

Al reanudar se relee el plan y se continúa por **la primera casilla sin marcar**;
al terminar la sesión se marcan las que se cerraron. Si un paso quedó a medias,
se deja en `[ ]` y se anota al lado qué falta.

**El avance vive en el documento, no en la memoria de la sesión.** Una sesión
larga pierde el contexto del principio y una sesión nueva empieza sin ninguno:
sin el checklist, lo que se hizo y lo que falta se vuelve a deducir cada vez —y a
veces se deduce mal, y se rehace algo que ya estaba.

## `docs/CHANGELOG.md`

Seguimiento conciso de lo ya implementado. La entrada más reciente va arriba, y
se escribe **antes de abrir el PR**, no después.

Cada entrada registra:

- **Fecha y hora**.
- **Quién** lo hizo.
- **Qué** se hizo, en dos o tres líneas.
- **Los commits enlazados.**
- **IMPORTANTE** (opcional, pero crítico): lo que quien despliega tiene que saber
  sí o sí — una variable de entorno nueva, un cambio de flujo, algo que
  configurar en un servicio externo, una migración pesada, una reversión.

Ese aviso es lo que evita que el problema se descubra en producción.

El formato exacto está en la cabecera del propio `docs/CHANGELOG.md`.

## Qué NO documentar

Lo que el repositorio ya dice por sí mismo: la estructura de carpetas, qué hace
una función, el historial de git. Un documento que lo repita solo añade un sitio
más donde quedar desactualizado — y un documento desactualizado es peor que
ninguno, porque se le cree.

Lo que sí merece escribirse es **el porqué**: la decisión que se tomó, la
alternativa que se descartó y el incidente que la motivó. Eso no está en el
código y se pierde en cuanto la persona que lo sabía cambia de tarea.
