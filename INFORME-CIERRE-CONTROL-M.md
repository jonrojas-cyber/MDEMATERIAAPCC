# INFORME DE CIERRE · Control M (plan "reloj suizo")

**Fecha:** 2026-10-11 (revisión de rigor) · **Rama:** `claude/jolly-franklin-3j3eg4` · **Base previa:** `main e686037`.

> **No se despliega.** Los informes anteriores eran contradictorios (estados "corregido" junto a evidencia que describía el defecto vigente). Esta revisión los hace consistentes: para cada hallazgo se separa la **evidencia histórica** de la **evidencia actual (HEAD)** y se indica la **prueba específica y su resultado** (ver CONTROL-CORRECCIONES.md). **Un commit o una suite en verde no cierran un hallazgo.** No hay acceso a producción (proxy 403), así que nada se declara "verificado en vivo".

## 1. Estado de los 79 hallazgos (recalculado)

| Estado | Nº | Significado |
|---|---|---|
| corregido + probado | 38 | Arreglado + prueba específica que PASA (unit/integración/e2e) |
| corregido | 9 | Arreglado y verificado por lectura/smoke/e2e, sin test unitario dedicado |
| parcial + probado | 4 | Mejora entregada con test; queda una parte |
| parcial | 6 | Mitigado; pendiente completar |
| abierto | 19 | Sin cambios (en su mayoría media/baja: rendimiento, UX, pulido) |
| diferido | 2 | Decisión consciente de NO hacerlo a medias |
| no confirmado | 1 | Requiere decisión de despliegue (multi-réplica) |

Detalle hallazgo por hallazgo, con histórico vs actual y el test de cada uno: **CONTROL-CORRECCIONES.md**.

## 2. Qué se reforzó en la revisión de rigor (sobre los bloques 01–11)

| Commit | Rigor |
|---|---|
| `519e4de` | **R2** · Ninguna prueba toca Postgres real (el modo aislado ignora DATABASE_URL; test). Backup con snapshot consistente (transacción REPEATABLE READ en Postgres; test con pool falso). |
| `f89a8cc` | **R4** · Tests reales para arranque/durabilidad: process-guards (tests.2) e integración HTTP que ARRANCA el servidor y comprueba /api/listo, X-Request-Id, 404 JSON y CSP en vivo (tests.4/8/11). |
| `fb1bd8a` | **R3** · Doble descuento de IVA REPRODUCIDO con fixtures (import→cierre→cuenta-resultados) y CORREGIDO: routes/analisis-mes.js guardaba el NETO en `ventas_mes_*` y la cuenta lo volvía a netear. Ahora guarda el BRUTO. No era dependiente de producción. |
| `6c6d2fc` | **R5** · Escrituras incrementales de ventas (insertMany, sin reescribir la tabla); anulaciones de Ágora no cuentan; break-even comparado en base neta. |

Bloques 01–11 originales: 00 matriz · 01 aislamiento+backup · 02 seguridad · 03 guardado durable · 04 Ágora sin borrar ventas · 05 motor financiero IVA neto/neto · 06 fechas en hora de Málaga · 07 sous-vide sin perder avisos · 08 memoización+medición · 09 UX/contraste/offline · 10 lint+tests · 11 cuadre+cierre.

## 3. Mediciones locales de rendimiento (hardware LOCAL, no Render)

`node scripts/bench.js <nVentas> <nProductos>` sobre `financials.beneficio` (un mes sintético):

| Ventas/mes | p50 | p95 |
|---|---|---|
| 2.000 | 3,1 ms | 4,9 ms |
| 10.000 | 24,4 ms | 35,3 ms |
| 30.000 | 46,0 ms | 74,3 ms |

Escala de forma lineal y holgada en local. La medición **en Render** queda pendiente (sin acceso); no se infiere de estos números.

## 4. El descuadre 1055 (Control M) vs 1035 (Ágora)

No se limita a hipótesis: la herramienta `scripts/cuadre-agora.js <export.json> <día>` desglosa el día de Ágora **por documento** (facturas, albaranes, pedidos excluidos, devoluciones) y marca el posible doble conteo albarán+factura; se compara con `GET /api/ventas/conciliacion?dia=` (desglose `por_tipo`). La diferencia se explica **documento a documento**, sin ajustar importes. Falta tu export real del día (ver §6, punto 5).

## 5. Despliegue

**No ejecutado.** Está preparado (lint + unitarios + 102 e2e en verde; backup/restore probado en aislamiento; sin migración de datos reales; reversión por commit), pero: (a) los informes eran contradictorios y había que hacerlos consistentes —hecho—; (b) no puedo verificarlo en vivo; (c) es tu sistema de dinero en producción. Cuando lo autorices, el flujo es el del proyecto (cherry-pick a `main` → push → Render) y se marcará **publicado / no verificado en vivo** hasta que alguien con acceso compruebe `/api/salud` y `/api/listo`. Reversión: el código se revierte por commit; **no se ejecuta ninguna migración de datos** en esta entrega, así que no hay reversión de datos que gestionar.

## 6. Pendientes reales (solo lo que requiere acceso, datos o una decisión externa)

Para cada uno: **qué falta · cómo obtenerlo · qué desbloquea.**

1. **Verificación en vivo.** Falta: acceso a `controlm-mdemateria.onrender.com` (proxy 403 desde aquí). Cómo: tras desplegar, abrir `/api/salud` (da la versión) y `/api/listo`. Desbloquea: confirmar versión efectiva y readiness → pasar lo desplegado de "publicado/no verificado" a "verificado".
2. **JWT_SECRET externo (seguridad.1).** Falta: la variable `JWT_SECRET`. Cómo: Render → Environment → `JWT_SECRET` = cadena larga aleatoria. Desbloquea: sesiones estables (no se cierran al reiniciar) y cierra seguridad.1.
3. **Persistencia durable (datos.8, pwa.3).** Falta: `DATABASE_URL` (PostgreSQL). Cómo: crear Postgres en Render, definir `DATABASE_URL` y `REQUIRE_DB=1`. Desbloquea: que los datos, las claves VAPID y las suscripciones push sobrevivan a reinicios; y el backup con `pg_dump`.
4. **Copia de producción real (item 6).** Falta: ejecutar `scripts/backup.js` contra producción y restaurarla en aislamiento. Cómo: con acceso a prod + un destino persistente (`BACKUP_DIR` fuera del contenedor o `pg_dump`). Desbloquea: red de seguridad verificada antes de cualquier migración futura.
5. **Descuadre 1055 vs 1035.** Falta: tu export de Ágora del día (`include-processed=true`, sin llamar a `/processed`). Cómo: `scripts/cuadre-agora.js <export.json> <día>` + `/api/ventas/conciliacion?dia=`. Desbloquea: explicar la diferencia por documento.
6. **Semántica de columnas del export "Análisis de Ventas" (motor-fechas col E/F).** Falta: una fila del CSV con cabeceras. Desbloquea: confirmar E=Base(neto)/F=Total(bruto). (El arreglo del doble IVA ya es correcto con independencia de esto.)
7. **Idempotencia multi-réplica (agora.6).** Falta: la decisión de escalar a ≥2 instancias. Cómo: si se escala, añadir restricción única en BD y ventas keyed por documento. Desbloquea: idempotencia con réplicas. (En una sola instancia ya es seguro: `importarDocs` es síncrono.)
8. **Descuento a nivel documento de Ágora (resto de agora.5).** Falta: una muestra con el campo de descuento global. Desbloquea: restar descuentos de documento (las invitaciones ya suman 0, las devoluciones ya restan, las anulaciones ya se omiten).

## 7. Pendientes de CÓDIGO (resolubles en local, priorizables — no bloqueados)

No ocultos: quedan 19 `abierto` de severidad media/baja, trabajo de código que se puede hacer sin acceso externo pero se priorizó por debajo de lo crítico/alto ya resuelto:
- **Dinero (medio/bajo):** dinero.6 (interés real con cuadro de amortización), dinero.7 (margen de carta ponderado por ventas), dinero.9 (redondeo uniforme del food cost), dinero.10 (valor de stock inline).
- **Rendimiento (medio/bajo):** rendimiento.2 (caché del dashboard por rol), .3 (consulta por fecha en SQL), .4 (compresión), .6 (paginación de /api/ventas), .7 (archivado de stock_movements).
- **UX (bajo):** frontend.5 (contraste de algunos badges), .6 (tamaño táctil de la barra), .7 (unificar tokens de color), .8 (retirar labPanel muerto).
- **PWA (bajo):** pwa.5 (duplicado en primer plano), pwa.6 (carrera al parar el temporizador).
- **Otros:** agora.7 (ventas heredadas sin doc_clave), tests.10 (trocear el e2e), motor-fechas.6 (proyección volátil los primeros días).

> **No se proclama "reloj suizo"** hasta cerrar las verificaciones del §6 (cuadre con tu export + comprobación en vivo tras desplegar).
