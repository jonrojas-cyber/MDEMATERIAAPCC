# INFORME DE CIERRE · Control M (plan "reloj suizo")

**Fecha:** 2026-10-11 (correcciones C1–C9) · **Rama:** `claude/jolly-franklin-3j3eg4` · **Base previa:** `main e686037`.

> **No se despliega todavía** (ver el procedimiento único en §5 y el runbook `DEPLOY.md`). Para cada hallazgo se separa la **evidencia histórica** del defecto de la **evidencia actual (HEAD)** y se indica la **prueba específica y su resultado** (ver CONTROL-CORRECCIONES.md). **Un commit o una suite en verde no cierran un hallazgo.** No hay acceso a producción desde aquí (proxy 403), así que nada se declara "verificado en vivo".

> ### "0 abiertos" NO significa "todo resuelto"
> Hay que leerlo en tres cajones distintos:
> - **CORREGIDO (67):** 45 `corregido+probado` + 16 `corregido` + 6 `parcial+probado`. Arreglado y verificado (prueba específica, o lectura/e2e). La parte "+probado" de los parciales es lo entregado; su resto cae en uno de los cajones de abajo.
> - **DIFERIDO (4), decisión consciente:** `frontend.7` (unificar ~476 colores → necesita revisión visual por tema claro/oscuro, no se hace a ciegas), `tests.10` (trocear el e2e → refactor grande de bajo valor con riesgo), y 2 más. No es "pendiente por prioridad": es "no hacerlo a medias".
> - **PENDIENTE DE DATOS / ACCESO / DECISIÓN EXTERNA (independientes, ver §6):** el **cuadre 1055 vs 1035** (necesita tu export de Ágora), la **muestra del descuento global** de documento (resto de `agora.5`), la **verificación en vivo** (sin acceso a Render desde aquí) y las **decisiones de escalado** (`rendimiento.3`, `agora.6`). **No se altera ningún histórico para forzar el cuadre.**

## 1. Estado de los 79 hallazgos (recalculado tras C1–C9)

| Estado | Nº | Significado |
|---|---|---|
| corregido + probado | 45 | Arreglado + prueba específica que PASA (unit/integración/e2e) |
| corregido | 16 | Arreglado y verificado por lectura/smoke/e2e, sin test unitario dedicado |
| parcial + probado | 6 | Mejora entregada con test; queda una parte (externa) |
| parcial | 7 | Mitigado; lo que falta es decisión de escalado o inherente al backend |
| diferido | 4 | Decisión consciente de NO hacerlo a medias (revisión visual / refactor grande de bajo valor) |
| no confirmado | 1 | Requiere decisión de despliegue (multi-réplica) |
| **abierto** | **0** | **Ya no queda ninguno: los 19 se cerraron o reclasificaron con justificación** |

Detalle hallazgo por hallazgo, con histórico vs actual y el test de cada uno: **CONTROL-CORRECCIONES.md**.

## 2. Qué se hizo en la ronda C1–C9 (completar todo lo resoluble en local)

| Commit | Trabajo |
|---|---|
| `61e0070` | **C1–C3 · Ágora sin pérdidas.** agora.1: deduplicar SOLO con vínculo documental explícito (si no, se señalan candidatos y no se borra nada); dos ventas legítimas idénticas se conservan. agora.3: importarVentas idempotente por fuente+día con reversión de stock neutra. agora.4: la clave sin tipo ya no descarta documentos distintos; se etiquetan `posible_duplicado` sin perder trazabilidad. |
| `44e5df4` | **C4–C5.** agora.5: anulaciones/invitaciones/devoluciones separadas y contadas aparte; descuento GLOBAL señalado y marcado pendiente de muestra (por eso `parcial`). datos.7: coste con materias sin precio marca `incompleto`/`materias_sin_coste` y queda fuera de la media de carta (no un margen aparentemente completo). |
| `7e6f232` | **C6.** Zona horaria de Madrid FORZADA aunque el proceso arranque en UTC (backend/tz-init.js); tests de DST (29-mar 23h, 25-oct 25h), fin de mes y 29-feb. motor-fechas.6: proyección con mínimo de días + banda de confianza. |
| `37a32d8` | **C7.** Persistencia: se detecta la divergencia caché/almacén cuando un guardado falla y `reconciliar()` re-hidrata desde el almacén durable; tests de fallo+reintento+reinicio (JSON con fallo de disco inyectado y BD con pool simulado). |
| `a479959` | **C8 (dinero).** fmt.js fuente única de % (1 decimal, dinero.9); valorStockMateria/Raw fuente única del valor de stock (dinero.10); margen realizado ponderado por ventas distinto del de catálogo (dinero.7); interés de deuda derivado de datos reales, sin 30% plano (dinero.6). |
| `3658fd8` | **C8 (resto).** Compresión gzip con zlib del core (rendimiento.4); caché del dashboard (rendimiento.2); paginación opcional de /api/ventas (rendimiento.6); archivado de stock_movements (rendimiento.7); dedupe de aviso sous-vide en primer plano (pwa.5) y carrera al parar el temporizador (pwa.6); contraste AA de badges (frontend.5), objetivos táctiles 44px (frontend.6), retirada de código muerto (frontend.8); agora.7 (heredadas entran como candidatas). |

Ronda de rigor previa (R1–R6) y bloques 01–11: ver el historial de la rama y la matriz.

**Lo que queda NO es código aplazado por prioridad.** Es: (a) `parcial`/`parcial+probado` cuyo resto depende de una **muestra/decisión externa** (descuento global de Ágora; idempotencia multi-réplica) o es **inherente al backend JSON** (se resuelve usando Postgres); y (b) `diferido` por ser **refactor de bajo valor con riesgo** (trocear el e2e) o requerir **revisión visual** por tema (unificar 476 hex de color, que cambian entre tema claro/oscuro).

## 3. Mediciones locales de rendimiento (hardware LOCAL, no Render)

`node scripts/bench.js <nVentas> <nProductos>` sobre `financials.beneficio` (un mes sintético):

| Ventas/mes | p50 | p95 |
|---|---|---|
| 2.000 | 3,1 ms | 4,9 ms |
| 10.000 | 24,4 ms | 35,3 ms |
| 30.000 | 46,0 ms | 74,3 ms |

Escala de forma lineal y holgada en local. La medición **en Render** queda pendiente (sin acceso); no se infiere de estos números.

## 4. El descuadre 1055 (Control M) vs 1035 (Ágora)

No se limita a hipótesis: `scripts/cuadre-agora.js <export.json> <día>` desglosa el día de Ágora **por documento** (facturas, albaranes, pedidos excluidos, devoluciones, invitaciones, anulaciones) y marca el posible doble conteo albarán+factura; se compara con `GET /api/ventas/conciliacion?dia=` (desglose `por_tipo`). La diferencia se explica **documento a documento**, sin ajustar importes ni borrar nada. Falta tu export real del día (ver §6).

## 5. Procedimiento ÚNICO de producción (ejecutar en este orden; no desplegar hasta completar 1–3)

> El runbook detallado, con los comandos exactos y verificados, está en **`DEPLOY.md`**.
> Aquí va el resumen.

> **Topología de git (importante):** `main` (e686037) y la rama divergieron desde un
> ancestro común; `main` tiene 113 commits que la rama no tiene **como SHA** (son
> cherry-picks) y la rama tiene 140 que `main` no tiene. **`git cherry` confirma que la
> rama CONTIENE los 113 de main (113 "-", 0 "+")**: es un superconjunto funcional. Por
> eso el despliegue es un **merge** (no un `cherry-pick` suelto ni un `reset`/force): el
> merge conserva el historial de `main` y publica un árbol **idéntico** al tip de la
> rama. Ensayado en local (rama `deploy-preview`): merge de 2 padres, árbol == tip,
> lint + 528 unit + 102 e2e en verde.

> Regla de oro: **no se presupone el estado de la configuración.** `DATABASE_URL` y `JWT_SECRET` pueden ESTAR ya definidos en Render o no; su estado es **desconocido desde aquí**. Primero se **inspecciona la configuración real**; no se crea ni se conecta una base vacía sobre una instalación con datos sin antes identificarlos, copiarlos y preservarlos.

1. **Inspección de configuración (sin cambiar nada).** En Render → el servicio → *Environment*: anotar si existen y con qué valor (sin exponerlo) `DATABASE_URL`, `JWT_SECRET`, `REQUIRE_DB`, `CORS_ORIGINS`, `RESEND_*`, VAPID (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`), `AVISOS_TOKEN`. Con el servicio arriba, `GET /api/salud` devuelve el modo de persistencia (`json`/`postgres`) y si hay BD configurada, **sin secretos** (persistenceInfo). → Decide el resto: si ya hay Postgres con datos, se CONSERVA; si no, se decide si introducirlo (paso 2) antes o después, pero nunca pisando datos.
2. **Backup real recuperable (antes de tocar datos).** Si hay Postgres: `pg_dump` a un destino persistente fuera del contenedor. Si es JSON en disco: `node scripts/backup.js` con `BACKUP_DIR` persistente. **Verificar la restauración** en un entorno AISLADO (`node scripts/restore.js` con `CONTROL_M_DATA_DIR` temporal) y comprobar recuentos por entidad. Sin backup restaurable verificado, no se continúa.
3. **Identidad de los datos.** Confirmar que el backup corresponde a la instalación real (recuentos de ventas/materias/cierres coherentes con lo esperado). No conectar una base nueva/vacía sobre la existente.
4. **Despliegue del árbol EXACTO** (ver `DEPLOY.md §5` para los comandos). Primero el **GATE**: `git cherry HEAD origin/main | grep -c '^+'` debe dar **0** (la rama sigue conteniendo todo lo de main; si no, STOP y reconciliar). Luego `CI=true npm test`; merge de la rama en `main` resolviendo al **árbol de la rama** (`git merge --no-ff …` → `git checkout <rama> -- .` → `git commit`), verificar `git diff --quiet HEAD <rama>` y `git push origin main` (Render despliega). Anotar el SHA del merge desplegado.
5. **Comprobación de versión.** `GET /api/salud` debe devolver la **versión** correspondiente al SHA desplegado (no una anterior). Si no coincide, el despliegue no tomó: revisar antes de seguir. Los pasos 5, 6, 8 y 9 (lectura) los automatiza `node scripts/post-deploy-check.js` (secretos por entorno, nunca por chat; ver `DEPLOY.md §6`).
6. **Permisos / roles.** Login admin (Moni) y equipo (Lara): el equipo NO debe ver coste/precio de coste/margen (regla 2; filtrado en front con `mbdsEsAdmin()` y en rutas con `req.user.rol==="admin"`). Verificar con una pantalla de dinero que al equipo le sale filtrada.
7. **Guardado durable.** Hacer un cambio pequeño y reversible (p. ej. una nota) y comprobar que PERSISTE tras un reinicio del servicio (en Postgres debe sobrevivir siempre; en JSON efímero, avisa de que es efímero). Revisar `persistenceInfo.divergencias` vacío.
8. **Conector Ágora.** Latido/estado del conector (`/api/ventas/agora-estado`) y una importación de prueba: documentos procesados, bloqueados y `posibles_duplicados` coherentes; ninguna venta perdida.
9. **Cuadre financiero.** Con el export real del día, ejecutar §4 y comprobar que la diferencia Control M vs Ágora se explica documento a documento.

> **Salud/readiness NO validan toda la app.** `/api/salud` y `/api/listo` solo dicen que el proceso vive y la BD responde; la validación real es 5–9 (versión, permisos, guardado durable, conector y cuadre). Reversión: el código se revierte por commit; esta entrega **no ejecuta ninguna migración de datos**, así que no hay reversión de datos que gestionar (si en el futuro la hubiera, el backup del paso 2 es la red).

## 6. Lo único que sigue bloqueado por acceso / muestra / decisión externa

Para cada uno: **qué falta · cómo obtenerlo · qué desbloquea.** (El estado de la config NO se presupone; ver §5.)

1. **Verificación en vivo.** Falta: acceso a la URL de Render (proxy 403 desde aquí). Cómo: ejecutar §5 pasos 5–9. Desbloquea: pasar lo desplegado de "publicado" a "verificado".
2. **Sesiones estables (seguridad.1).** Estado de `JWT_SECRET`: **desconocido** (puede existir ya). Cómo: inspeccionar (§5.1); si NO existe, definir una cadena larga aleatoria en Render. Desbloquea: que las sesiones no se invaliden al reiniciar.
3. **Persistencia durable (datos.8, pwa.3).** Estado de `DATABASE_URL`: **desconocido** (puede existir ya). Cómo: inspeccionar (§5.1); si NO hay Postgres y se decide introducirlo, hacerlo preservando datos (§5.2–5.3) y con `REQUIRE_DB=1`. Desbloquea: datos, claves VAPID y suscripciones push que sobreviven a reinicios, y backup con `pg_dump`.
4. **Copia de producción real.** Falta: ejecutar §5.2 contra producción y verificar la restauración. Desbloquea: red de seguridad verificada antes de cualquier cambio.
5. **Descuadre 1055 vs 1035.** Falta: tu export de Ágora del día (`include-processed=true`, sin llamar a `/processed`). Desbloquea: explicar la diferencia por documento (§4).
6. **Semántica de columnas del export "Análisis de Ventas".** Falta: una fila del CSV con cabeceras. Desbloquea: confirmar E=Base(neto)/F=Total(bruto). (El arreglo del doble IVA ya es correcto con independencia de esto.)
7. **Descuento GLOBAL de documento de Ágora (resto de agora.5).** Falta: una muestra con el campo de descuento a nivel de ticket. Desbloquea: repartirlo por línea. (Ya se SEÑALA; invitaciones suman 0, devoluciones restan, anulaciones se omiten.)
8. **Idempotencia multi-réplica (agora.6).** Falta: la decisión de escalar a ≥2 instancias. Cómo: si se escala, restricción única en BD + ventas keyed por documento. (En una sola instancia ya es seguro: `importarDocs` es síncrono.)
9. **Escalado de consultas (rendimiento.3).** Falta: volumen de producción que justifique el pushdown a SQL por fecha + hidratación parcial. Decisión de escalado, no tarea aplazada.

> **No se proclama "reloj suizo"** hasta cerrar las verificaciones del §5 (despliegue + versión + permisos + guardado + conector + cuadre con tu export real).
