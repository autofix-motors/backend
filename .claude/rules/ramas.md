# Flujo de ramas

Cómo viaja un cambio desde tu máquina hasta producción. Si nunca trabajaste con
git en equipo, esta es la única página que necesitas.

## Las ramas

| Rama | Qué es | Quién la toca |
|---|---|---|
| `main` | **Producción.** Lo que está corriendo ahora mismo | Nadie directamente: se llega por Pull Request |
| `feature/...` | **Tu trabajo.** Una por cada cosa que estés haciendo | Solo tú. Se borra al terminar |

**No hay rama `staging`.** Todo Pull Request va **directo a `main`**, y ahí lo
revisa el equipo antes de mergear. Esa revisión es la única barrera antes de
producción, así que es donde hay que mirar de verdad.

## El ciclo completo

```
  feature/mi-cambio  ──PR──►  main  ──revisión + merge──►  producción
        (tú)                        (el equipo)
```

**1. Actualiza antes de empezar. Siempre.**

```bash
git checkout main
git pull
git checkout -b feature/reporte-de-cobranzas
```

**Esto no es opcional y no basta con hacerlo una vez al día.** Si somos varios
trabajando sobre los mismos archivos, entre que terminaste lo anterior y empiezas
esto alguien más ya mergeó lo suyo. Si partes de un `main` viejo, tu rama nace
desactualizada y el conflicto aparece al final, cuando ya no te acuerdas de por
qué escribiste cada línea.

Hazlo **cada vez que empieces algo**, aunque hayas hecho `pull` hace una hora.

El nombre describe **qué** hace, no quién lo hace: `feature/reporte-de-cobranzas`,
`fix/monto-duplicado-en-el-total`. Con `feature/` para algo nuevo y `fix/` para
un arreglo alcanza.

**2. Trabaja y ve guardando**

```bash
git add .
git commit -m "feat(cobranzas): agregar el resumen por vendedor"
```

Commits pequeños y seguidos, no uno gigante al final: si algo se rompe, es
mucho más fácil ver dónde. El formato del mensaje está en
[`commits.md`](commits.md).

**3. Anota el cambio en el CHANGELOG**

Antes de abrir el PR, agrega tu entrada en
[`docs/CHANGELOG.md`](../../docs/CHANGELOG.md). Son cuatro líneas y le ahorra a
quien revisa tener que reconstruir qué pasó a partir de los commits.

**Si tu cambio necesita una variable de entorno nueva, cambia un flujo o exige
configurar algo en un servicio externo, márcalo como IMPORTANTE.** Eso es lo que
hace que quien despliega no se entere del problema en producción.

**4. Súbelo y abre el Pull Request hacia `main`**

```bash
git push -u origin feature/reporte-de-cobranzas
```

El servidor te muestra un enlace para abrir el Pull Request. En la descripción,
dos cosas: **qué hace** y **cómo probarlo** (con qué usuario, qué endpoint, qué
deberías ver).

**5. El equipo lo revisa y lo mergea**

No mergees tu propio PR. Sube, avisa, y que otra persona lo mire: es lo que
protege lo que ya está en producción, y el único momento en que algo llega ahí.

**6. Borra tu rama**

```bash
git checkout main
git pull
git branch -d feature/reporte-de-cobranzas
```

Una rama ya mergeada solo estorba. En el servidor también se borra desde el PR.

## Reglas

1. **Nunca trabajes directo sobre `main`.** Siempre una rama tuya.
2. **`git pull` antes de cada cosa nueva.** No una vez al día: cada vez.
3. **Una rama, una cosa.** Si a mitad de camino aparece otro arreglo, va en otra
   rama. Mezclar dos temas hace imposible revisar y revertir.
4. **Toda rama entra por Pull Request a `main`**, y la mergea otra persona.
5. **Cada cambio deja su línea en el CHANGELOG**, con lo IMPORTANTE marcado.
6. **Si tu rama lleva días abierta**, tráete lo nuevo para no alejarte:
   ```bash
   git checkout feature/lo-mio
   git fetch origin
   git merge origin/main
   ```

## Cuidado con los servicios externos

Tu base de datos puede ser una copia, pero **un servicio externo suele ser uno
solo**: si no hay un entorno de pruebas aparte, tu máquina consulta el mismo que
producción.

Leer no tiene riesgo. **Escribir sí**: lo que crea, modifica o confirma algo en
un sistema de terceros lo hace de verdad, aunque lo lances desde tu laptop. Antes
de probar ese tipo de operación, se confirma contra qué entorno se está
apuntando y se coordina con quien lo administre.

## Si algo sale mal

**Te equivocaste de rama y ya commiteaste.** No pasa nada, no lo has publicado:

```bash
git log --oneline -3      # copia el id del commit
git reset --hard HEAD~1   # sácalo de esta rama
git checkout -b feature/la-rama-correcta
git cherry-pick <id>      # tráelo acá
```

**Un cambio rompió producción.** Se revierte el merge desde el PR (botón
*Revert*) y eso despliega solo. Primero se arregla producción, después se
investiga con calma. Anota la reversión en el CHANGELOG: quien venga después
tiene que saber que esa entrada ya no está vigente.

**No entiendes qué pasó.** `git log --oneline -10` muestra lo último que se hizo,
y el [CHANGELOG](../../docs/CHANGELOG.md) lo cuenta en castellano. Nada se pierde
mientras esté commiteado.
