# Modelo en español, tablas sin prefijo y sin flujo contable

Quien dirige el proyecto pidió simplificarlo para la exposición del curso
(2026-11-05): que el modelo se explique sin traducir nombres, que las tablas no
lleven prefijo y que quede fuera el flujo contable. Va en tres pasos, cada uno
validado antes del siguiente.

## Decisiones

| Decisión | Por qué |
|---|---|
| Dominio en español: modelos, campos, enums y valores, columnas y **el JSON de la API** | Decisión de quien dirige el proyecto: el diagrama de clases, las tablas y la API dicen lo mismo |
| Estructura en inglés: carpetas, archivos, clases, métodos, rutas HTTP | Así la genera el CLI de NestJS; cambiarla no ayuda a explicar el modelo |
| `ordenarPor` y `sentido` en los listados; `page`, `pageSize` y `search` quedan | Los dos primeros nombran campos del dominio; los otros son infraestructura compartida |
| Placeholders de ruta en inglés (`:workOrderId`) | Son parte de la ruta HTTP, que no cambia |
| La base se recrea desde cero con una sola migración `init` | La base no tenía datos que conservar (autorizado); evita una cadena de renombrados |
| Sale `Payment` (pagos) y los reportes de ingresos; quedan costo y margen del repuesto | Decisión de quien dirige el proyecto: solo flujo operativo y de seguimiento |
| Sale `Herramienta` (préstamo de herramientas) | Decisión de quien dirige el proyecto: no aporta al flujo de la orden |

## Avance

- [x] Paso 1 · Schema en español (modelos, campos, relaciones, enums, columnas).
- [x] Paso 1 · Backend adaptado: entidades, DTO, filtros, guards, sesión
  (`rol: 'CLIENTE'`), seeds y specs. 661 pruebas, lint y build en verde.
- [x] Paso 1 · Migración `init` única y base local recreada con la semilla.
- [x] Paso 1 · Reglas (`nomenclatura.md`, `proyecto.md`), skill y glosario.
- [x] Paso 1 · Frontend adaptado a la API en español (typecheck, lint, 335
  pruebas y build). Punta a punta contra la API: 24 de 24, con limpieza.
- [x] Paso 1 · Validado por quien dirige el proyecto (2026-11-15).
- [x] Paso 2 · Tablas sin prefijo (`usuario`, `orden_trabajo`…), CHECK
  `sesion_dueno_check`, regla de tablas en `nomenclatura.md` y la skill;
  migración `init` regenerada. Punta a punta 24/24.
- [x] Paso 3 · Sin pagos ni reportes: `finance.prisma` fuera (14 tablas),
  historial de usuarios y de órdenes sin pagos, alcance del MVP en los dos
  repos y migración `init` final. 661 pruebas, lint, build; punta a punta 24/24.
- [x] Sin herramientas (2026-11-15): `Herramienta` y `EstadoHerramienta` fuera,
  módulo `tools`, pantalla y menú; 13 tablas.
- [x] Pasos 2 y 3 · Validados por quien dirige el proyecto (2026-11-15).
- [ ] Producción: base de Railway recreada y semilla.
