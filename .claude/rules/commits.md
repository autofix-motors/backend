# Convenciones de commits

Variante de [Conventional Commits](https://www.conventionalcommits.org/) con un
scope que indica el **módulo** afectado, para que el historial se pueda filtrar
por dominio.

## Formato

```
tipo(modulo): descripción corta en imperativo
```

- **tipo**: qué clase de cambio es (lista abajo).
- **modulo**: el dominio afectado, escrito con la misma palabra que usan su
  carpeta y su prefijo HTTP (ver [`nomenclatura.md`](nomenclatura.md)). Si el
  cambio es transversal —configuración, dependencias, CI, scripts— se omite:
  `chore: ...`.
- **descripción**: minúscula, imperativo («agregar», no «agregado» ni «agrega»),
  sin punto final, bajo 72 caracteres.

**No hay una lista cerrada de módulos.** El scope es el dominio que exista en
este repositorio el día que se escribe el commit; si aparece uno nuevo, se usa su
nombre y ya.

**El scope es el módulo, no su grupo**: `feat(roles): …`, aunque viva en
`modules/core/roles/`. Un cambio que abarca todo un grupo usa el grupo:
`refactor(core): …`.

## Tipos

| Tipo | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva visible para el consumidor de la API |
| `fix` | Corrección de un bug |
| `refactor` | Cambio interno que no agrega funcionalidad ni corrige bugs |
| `perf` | Rendimiento |
| `docs` | Solo documentación |
| `test` | Tests, sin tocar código de producción |
| `style` | Formato, sin cambio de lógica |
| `chore` | Dependencias, configuración, scripts |
| `ci` | Workflows de CI/CD |
| `build` | Sistema de build o empaquetado |

## Ejemplos

```
feat(auth): agregar la renovación del token de acceso
fix(users): corregir el filtro por estado en el listado
refactor(payments): mover el cálculo de la mora a una función pura
chore: actualizar las dependencias del framework
docs: actualizar la guía de flujo de ramas
```

## Cuándo commitear

- **Un commit por ciclo cerrado.** Al terminar una unidad coherente —un
  endpoint, un fix, un refactor con sus tests— se commitea **en ese momento**. No
  se acumula trabajo para un commit gigante al final.
- **Un ciclo cerrado es un estado verificable**: compila y el build pasa para lo
  tocado. Si quedó a medias, se sigue hasta cerrarlo antes de commitear.
- **Commits en orden.** Siguen el orden del trabajo: primero el cambio, después
  sus tests, al final docs. El `git log` cuenta una historia, no es una bolsa de
  archivos.
- **En un refactor, separar el movimiento del arreglo.** Mover archivos y
  cambiar conducta en el mismo commit obliga a revisar las dos cosas a la vez, y
  en un diff grande eso no se hace.

## Cuerpo y referencias

Para cambios no triviales, una línea en blanco y el **porqué** (el diff ya
muestra el qué). **Máximo 4 o 5 líneas**: el detalle va en la descripción del PR.

```
fix(auth): corregir expiración incorrecta del token

El cálculo usaba minutos en vez de segundos al construir el
timestamp, así que los tokens expiraban 30 veces más rápido
de lo configurado.

Refs: PROJ-123
```

## Relación con la rama

El módulo del commit es el dominio del que habla la rama, para poder leer el
historial completo de un dominio de una sola pasada:

```
Rama:    feature/comprobante-de-pago
Commits: feat(payments): agregar la máquina de estados del envío
         test(payments): cubrir el caso de subida parcial

git log --oneline --grep="payments"
```

## Sin atribución

El mensaje **no lleva** `Co-Authored-By`, y la descripción del Pull Request
tampoco lleva «Generated with Claude Code». El trabajo lo firma quien lo sube
(ver [`proyecto.md`](proyecto.md)).
