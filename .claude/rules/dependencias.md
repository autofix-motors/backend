# Dependencias

Cada paquete que entra o sale del proyecto deja una línea en
`docs/DEPENDENCIES.md`, **en el mismo commit** que lo instala o lo quita.

> El `package.json` dice qué hay instalado, no **por qué**. A los seis meses
> nadie se acuerda de para qué entró un paquete, y como no se sabe qué rompe al
> sacarlo, se queda para siempre. Esto es lo que hace que un proyecto de un año
> arrastre dependencias que ya nadie usa.

## Al instalar

Una línea en la tabla **Instaladas**, con cuatro datos:

| Fecha | Paquete | Tipo | Para qué |
|---|---|---|---|
| 2026-09-19 | `@prisma/adapter-pg` | prod | Driver adapter de Postgres, obligatorio en Prisma 7 |

- **Fecha** en `AAAA-MM-DD`, la de la instalación.
- **Paquete**, uno por línea. Si un comando instaló cuatro, son cuatro líneas:
  cada uno se quita por su cuenta y cada uno necesita su motivo.
- **Tipo**: `prod` o `dev`.
- **Para qué**: una frase. Qué problema resuelve, no qué es el paquete. «Driver
  adapter de Postgres, obligatorio en Prisma 7» sirve; «cliente de Postgres» no,
  porque no dice por qué está.

**No se registran** las dependencias que vienen en el andamio de `nest new`: son
la línea base del framework, no una decisión del equipo. Se registra lo que
agregamos nosotros.

## Al quitar

La línea **se mueve** de Instaladas a **Retiradas** con la fecha y el motivo. No
se borra: el registro de que algo se probó y se descartó vale tanto como el de lo
que se quedó.

| Fecha | Paquete | Por qué |
|---|---|---|
| 2026-09-18 | `typeorm` | Reemplazado por Prisma antes de escribir código con él |

El motivo dice **cuál de estos casos es**:

- **Reemplazado por X.** Nombrando X, siempre.
- **Ya no se usa.** Porque se quitó la funcionalidad que lo necesitaba.
- **Descartado.** Se instaló para probarlo y no se quedó — y entonces conviene
  una palabra de por qué no.
- **Absorbido.** Lo que hacía ya lo cubre el framework o una dependencia que
  entró después.

> Sin el motivo, dentro de un año alguien reinstala lo que ya se había descartado
> y repite la evaluación completa. Por eso «se quitó» no es un motivo.

## Antes de instalar algo

- **Mirar si ya está resuelto.** El framework y lo que ya está instalado cubren
  más de lo que parece.
- **Una dependencia para una función de tres líneas no vale.** Lo que se agrega
  hay que actualizarlo, auditarlo y arrastrarlo en cada build.
- **Versión fijada.** Nada de rangos abiertos que cambien solos entre
  instalaciones.
- **Si el paquete acompaña al framework, se fija su major a mano.** `pnpm add X`
  sin versión instala la última, que puede ser la del major siguiente al que usa
  el proyecto. Se escribe `pnpm add X@<major del framework>`.

## Un aviso de peer dependency no se ignora

Cuando la instalación dice `unmet peer`, el paquete quedó instalado igual pero
**contra una versión del framework para la que no fue compilado**. pnpm avisa y
sigue; no es un error suyo, es su comportamiento por defecto.

Se resuelve en el momento —bajando el paquete o subiendo el framework—, no
después. Un `unmet peer` no es ruido: significa que ese paquete puede reventar en
la primera línea que lo importe, y el error que muestra no menciona versiones,
así que cuesta el doble de encontrar.

## Si el registro y el `package.json` no coinciden

Manda el `package.json`: es lo que se instala de verdad. El registro se corrige
para que lo refleje, anotando lo que falte con la fecha en que se detectó, no con
una inventada.
