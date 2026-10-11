# CONTROL-CORRECCIONES · Control M

**Fecha:** 2026-10-11 · **Rama:** claude/jolly-franklin-3j3eg4 · **HEAD de código previo:** main e686037 (origin).
Matriz de control del plan de corrección (PROMPT 00). Una fila por cada uno de los **79 hallazgos** de AUDITORIA-MILIMETRO-2026-10.md, reverificados contra el HEAD actual (solo lectura) y cruzados con el trabajo ya ejecutado y probado en esta rama.

**Estados:** `abierto` (defecto vigente) · `parcial` (mitigado, incompleto) · `parcial+probado` (mejora entregada con test, falta resto) · `corregido+probado` (arreglado, suite verde en local) · `diferido` (decisión consciente de no hacerlo ahora) · `descartado` (hallazgo incorrecto) · `no_confirmado` (requiere producción). La columna **Prod** es el estado de despliegue: por ahora **todo `no-desplegado`** — el despliegue a producción se agrupa en el Bloque 11 con sus comprobaciones (backup, rollback, versión verificada). No se cierra ningún hallazgo por deducción.

## Resumen de control

| Estado | Nº |
|---|---|
| abierto | 58 |
| corregido+probado | 8 |
| diferido | 1 |
| parcial | 10 |
| parcial+probado | 2 |
| **Total** | **79** |

_Verificación independiente (9 agentes, solo lectura): {"abierto":68,"parcial":9,"corregido":2} sobre la definición original de cada hallazgo; los `corregido+probado`/`parcial+probado` reflejan además el trabajo de esta rama._

## Tabla de hallazgos

| ID | Sev | Estado | Bloque | Commit | Prod | Prueba |
|---|---|---|---|---|---|---|
| dinero.1 | critico | abierto | 05 | — | no-desplegado | — |
| dinero.2 | alto | abierto | 05 | — | no-desplegado | tests/fixed-costs.unit.js |
| dinero.3 | alto | parcial | 05 | — | no-desplegado | tests/consistencia-pantallas.unit.js |
| dinero.4 | alto | abierto | 05 | — | no-desplegado | — |
| dinero.5 | alto | abierto | 05 | — | no-desplegado | — |
| dinero.6 | medio | abierto | 05 | — | no-desplegado | — |
| dinero.7 | medio | abierto | 05 | — | no-desplegado | — |
| dinero.8 | bajo | abierto | 05 | — | no-desplegado | — |
| dinero.9 | bajo | abierto | 05 | — | no-desplegado | tests/cuenta-resultados.unit.js:26 |
| dinero.10 | bajo | abierto | 06 | — | no-desplegado | — |
| seguridad.1 | alto | parcial | 02 | 389dfcf | no-desplegado | — |
| seguridad.2 | critico | corregido+probado | 02 | 389dfcf | no-desplegado | — |
| seguridad.3 | alto | parcial+probado | 02 | 389dfcf | no-desplegado | — |
| seguridad.4 | medio | corregido+probado | 02 | 389dfcf | no-desplegado | — |
| seguridad.5 | alto | corregido+probado | 02 | 389dfcf | no-desplegado | — |
| seguridad.6 | medio | corregido+probado | 02 | 389dfcf | no-desplegado | — |
| seguridad.7 | medio | parcial | 02 | — | no-desplegado | tests/economia-guard.unit.js |
| seguridad.8 | bajo | corregido+probado | 02 | 389dfcf | no-desplegado | — |
| seguridad.9 | medio | diferido | 02 | — | no-desplegado | — |
| datos.1 | alto | abierto | 03 | — | no-desplegado | ninguno |
| datos.2 | alto | abierto | 03 | — | no-desplegado | ninguno |
| datos.3 | alto | abierto | 03 | — | no-desplegado | ninguno |
| datos.4 | alto | abierto | 03 | — | no-desplegado | — |
| datos.5 | medio | abierto | 03 | — | no-desplegado | ninguno |
| datos.6 | alto | abierto | 11 | — | no-desplegado | — |
| datos.7 | medio | abierto | 03 | — | no-desplegado | — |
| datos.8 | alto | parcial+probado | 01 | 9a6784e | no-desplegado | — |
| datos.9 | medio | abierto | 03 | — | no-desplegado | tests/persistence.unit.js:97-110 |
| datos.10 | alto | abierto | 03 | — | no-desplegado | — |
| motor-fechas.1 | critico | abierto | 05 | — | no-desplegado | ninguno |
| motor-fechas.2 | alto | abierto | 05 | — | no-desplegado | ninguno |
| motor-fechas.3 | alto | abierto | 06 | — | no-desplegado | ninguno |
| motor-fechas.4 | medio | abierto | 06 | — | no-desplegado | ninguno |
| motor-fechas.5 | bajo | abierto | 06 | — | no-desplegado | — |
| motor-fechas.6 | medio | abierto | 05 | — | no-desplegado | tests/cuenta-resultados.unit.js «proyecta a mes completo |
| agora.1 | alto | parcial | 04 | — | no-desplegado | conciliacion-ventas.unit.js |
| agora.2 | alto | abierto | 04 | — | no-desplegado | conciliacion-ventas.unit.js |
| agora.3 | alto | abierto | 04 | — | no-desplegado | — |
| agora.4 | medio | abierto | 04 | — | no-desplegado | ninguno |
| agora.5 | medio | abierto | 04 | — | no-desplegado | — |
| agora.6 | alto | abierto | 04 | — | no-desplegado | — |
| agora.7 | medio | parcial | 04 | — | no-desplegado | migracion-ventas-dup.unit.js |
| frontend.1 | alto | abierto | 09 | — | no-desplegado | — |
| frontend.2 | medio | parcial | 09 | — | no-desplegado | tests/e2e.spec.js:567 |
| frontend.3 | medio | abierto | 09 | — | no-desplegado | — |
| frontend.4 | medio | corregido+probado | 02 | 389dfcf | no-desplegado | — |
| frontend.5 | medio | abierto | 09 | — | no-desplegado | — |
| frontend.6 | medio | abierto | 09 | — | no-desplegado | — |
| frontend.7 | bajo | abierto | 09 | — | no-desplegado | — |
| frontend.8 | bajo | abierto | 09 | — | no-desplegado | — |
| frontend.9 | medio | abierto | 10 | — | no-desplegado | — |
| frontend.10 | medio | abierto | 09 | — | no-desplegado | — |
| frontend.11 | medio | abierto | 09 | — | no-desplegado | — |
| pwa.1 | alto | parcial | 07 | — | no-desplegado | ninguno |
| pwa.2 | medio | abierto | 07 | — | no-desplegado | — |
| pwa.3 | medio | parcial | 09 | — | no-desplegado | — |
| pwa.4 | bajo | abierto | 09 | — | no-desplegado | — |
| pwa.5 | bajo | abierto | 07 | — | no-desplegado | — |
| pwa.6 | medio | abierto | 07 | — | no-desplegado | — |
| pwa.7 | bajo | abierto | 09 | — | no-desplegado | — |
| rendimiento.1 | alto | abierto | 08 | — | no-desplegado | — |
| rendimiento.2 | medio | abierto | 08 | — | no-desplegado | — |
| rendimiento.3 | alto | abierto | 08 | — | no-desplegado | — |
| rendimiento.4 | alto | abierto | 08 | — | no-desplegado | — |
| rendimiento.5 | medio | abierto | 08 | — | no-desplegado | — |
| rendimiento.6 | medio | abierto | 08 | — | no-desplegado | — |
| rendimiento.7 | medio | abierto | 08 | — | no-desplegado | — |
| rendimiento.8 | medio | abierto | 08 | — | no-desplegado | — |
| tests.1 | critico | abierto | 03 | — | no-desplegado | ninguno |
| tests.2 | alto | abierto | 03 | — | no-desplegado | — |
| tests.3 | medio | corregido+probado | 01 | 9a6784e | no-desplegado | tests/backup-restore.unit.js:53-54 asserta que las escrituras caen en dirB y no en SEED_DIR |
| tests.4 | alto | abierto | 03 | — | no-desplegado | — |
| tests.5 | bajo | parcial | 10 | — | no-desplegado | ninguno |
| tests.6 | bajo | abierto | 10 | — | no-desplegado | — |
| tests.7 | medio | parcial | 10 | — | no-desplegado | tests/e2e.spec.js:604 |
| tests.8 | medio | abierto | 03 | — | no-desplegado | — |
| tests.9 | bajo | corregido+probado | 01 | 9a6784e | no-desplegado | n/a |
| tests.10 | bajo | abierto | 10 | — | no-desplegado | n/a |
| tests.11 | medio | abierto | 03 | — | no-desplegado | tests/e2e.spec.js:20 |

## Detalle por hallazgo (evidencia en código actual)

### dinero.1 · abierto · [bloque 05] · sev critico

**Evidencia:** backend/cuenta-resultados.js:43 `const ebitda = tieneMateria ? eur(margen_bruto - personal - otros_fijos - variables) : null;` donde margen_bruto deriva de `ventas` NETAS (cuenta-resultados.js:139 `ventasBruto / (1 + IVA_VENTA)`) pero `otros_fijos`/`personal` salen de fixed-costs.costeEnRangoSegmentado, que usa `amount` CRUDO (fixed-costs.js:34 `const amount = Number(fc.amount) || 0;` y :120 `const c = costeDiario(f) * dias; if (pers) personal += c; else otros += c;`). Mismo patrón en financials.js:146-147 (`base = ventasNetas; operativo = eur(base - costeMateria - laboral - variables - fijos)` con `fijos = eur(seg.otros)`). El campo `vat` SÍ se captura (routes/fixed-costs.js:23 `c.vat = Number(body.vat) || 0;` y :83) pero el motor fixed-costs.js NUNCA lo lee: no hay neteo ni base explícita.

**Prueba existente:** ninguno

**Nota:** Asimetría estructural real: ventas explícitamente netas, costes fijos restados en bruto sin aplicar ninguna convención de IVA. El grado de distorsión depende de si cada `amount` se introdujo con IVA (luz, software, suministros) o sin él; el motor no distingue ni usa el campo `vat` que la ruta guarda. Prompt 05 pedía 'base explícita sin netear dos veces' y diferenciar IVA deducible/no deducible: no implementado.

### dinero.2 · abierto · [bloque 05] · sev alto

**Evidencia:** backend/break-even.js:76 `const ratio = contrib.ratio_contribucion > 0 ? contrib.ratio_contribucion : null;` toma el ratio de contribucion() que deriva de costing.margenMedioCarta (base PVP bruto con coste CON IVA). La base fija es cruda (break-even.js:67 `return fixedCosts.totales(now).diario + staff.costeDiarioTotal();`) y el margen de seguridad compara contra ventas BRUTAS (break-even.js:113 `const ventasMes = financials.ventasEnRango(rMes);`, que suma `v.importe` con IVA). No hay convención de IVA única: contribución en basis bruto-con-IVA-de-venta, fijos sin convención, ventas brutas.

**Prueba existente:** tests/fixed-costs.unit.js (test 'break-even: ingreso de equilibrio...') — pero EVITA el problema fijando iva:0 (línea 51 `precio_venta: 2, activo: true, iva: 0`), por lo que no cubre la convención de IVA

**Nota:** Coexiste con el break-even del P&L (cuenta-resultados.js:89-93 y financiero.js:102-108) que usa contribución NETA (1 - materia_neto/ventas_neto). Dos break-even con bases de IVA distintas. El test existente esquiva el defecto usando iva:0.

### dinero.3 · parcial · [bloque 05] · sev alto

**Evidencia:** Conviven dos convenciones de food cost/margen: (1) motor de carta/contribución CON IVA de venta — costing.js:90-96 `margenProducto`: `const coste = ...costeNeto * (1 + iva)...; const foodCost = precio > 0 ? coste / precio : 0;` (precio = PVP bruto), consumido por break-even.js:38 `const ratio = costing.margenMedioCarta(items, idx);`. (2) motor del P&L NETO/NETO ponderado — financials.js:160 `food_cost_pct: base > 0 ? Math.round((costeMateria / base) * 100) : null` con `base = ventasNetas`; cuenta-resultados.js:115 `const foodCostProd = ventasNetasProd > 0 ? materiaProd / ventasNetasProd : null;`; analisis-diario.js:102 `food_cost_pct: netoConCoste > 0 ? Math.round((coste / netoConCoste) * 100) : null`.

**Prueba existente:** tests/consistencia-pantallas.unit.js (reconcilia SOLO la familia P&L: beneficio vs analisis-diario vs cuenta-resultados, líneas 63-98)

**Nota:** Mitigado respecto al hallazgo original: la familia P&L (financials/analisis-diario/cuenta-resultados) ya está unificada en neto/neto y hay test que lo prueba. PERO el motor de carta/contribución (costing.margenProducto → break-even) sigue con convención divergente (CON IVA de venta, no ponderada), así que la divergencia persiste entre el motor de carta y el P&L. Por eso 'parcial' y no 'corregido'.

### dinero.4 · abierto · [bloque 05] · sev alto

**Evidencia:** backend/costing.js:93 `const coste = Math.round(costeNeto * (1 + iva) * 10000) / 10000; // coste CON IVA` y :100 `margen_euros: Math.round((precio - coste) * 100) / 100` (precio = precio_venta BRUTO). Ese margen en euros bruto se propaga a break-even.js:33 `contribucion_eur: m.margen_euros`. El P&L calcula el margen en neto: financials.js:146-147 `base = ventasNetas; operativo = eur(base - costeMateria - ...)`.

**Prueba existente:** ninguno

**Nota:** margen_euros = PVP_bruto − coste_neto×(1+IVA_venta) sobreestima el margen económico real (PVP_neto − coste_neto). Ej. precio 2, coste_neto 0,5: micro da 2−0,55=1,45 €; el neto real es 1,818−0,5=1,318 €. El micro (bruto) no cuadra con el macro (P&L neto). economia-guard.unit.js solo testea el FILTRADO por rol de margen_euros, no su valor.

### dinero.5 · abierto · [bloque 05] · sev alto

**Evidencia:** backend/costing.js:82-84 `function ivaDe(producto) { const v = producto && producto.iva != null ? Number(producto.iva) : IVA_DEF; return v >= 0 && v < 1 ? v : IVA_DEF; }` (IVA_DEF=0.10, es el IVA de VENTA en hostelería) y costing.js:91-93 `const iva = ivaDe(producto); const coste = Math.round(costeNeto * (1 + iva) * 10000) / 10000; // coste CON IVA`. El comentario de la línea 88-89 dice 'neto + IVA de compra' pero aplica el IVA de venta del producto.

**Prueba existente:** ninguno

**Nota:** Para muchas materias el IVA de compra (21% en no alimentario, 4%/10% en algunos alimentos) difiere del 10% de venta; grossar el coste con el IVA de venta es económicamente incorrecto. Defecto confirmado y vigente.

### dinero.6 · abierto · [bloque 05] · sev medio

**Evidencia:** backend/financials.js:152 `const interesesPeriodo = eur(cuotaMensual * (dias / (365 / 12)) * 0.3); // ~30% de la cuota como interés estimado` y :159 `beneficio_neto_estimado: neto` (neto = operativo − interesesPeriodo).

**Prueba existente:** ninguno

**Nota:** Interés hardcodeado al 30% de la cuota, sin usar calendario de amortización real ni separar principal/interés. Prompt 05 pedía usar datos reales y marcar estimaciones; sigue siendo una aproximación fija. Está etiquetado como estimado, lo que mitiga parcialmente, pero el 30% arbitrario persiste.

### dinero.7 · abierto · [bloque 05] · sev medio

**Evidencia:** backend/costing.js:119-124 `function margenMedioCarta(...) { ... const suma = items.reduce((s, x) => s + x.mm.margen_bruto, 0); return Math.round((suma / items.length) * 1000) / 1000; }` y :128-134 `foodCostMedioCarta` idéntico: `const suma = items.reduce((s, x) => s + x.mm.food_cost, 0); return Math.round((suma / items.length) * 1000) / 10;`. Son medias aritméticas por nº de productos, sin ponderar por unidades/importe vendidos. break-even.js:38 las usa como `ratio_contribucion`.

**Prueba existente:** ninguno

**Nota:** No se distingue el margen de carta (no ponderado) del margen realizado ponderado por ventas que pide el prompt 05. El P&L sí tiene food cost ponderado (materia/ventas), pero estas funciones de carta/break-even siguen sin ponderar.

### dinero.8 · abierto · [bloque 05] · sev bajo

**Evidencia:** Constante 0.10 definida por separado en 4 módulos: backend/costing.js:81 `const IVA_DEF = 0.10;`; backend/financials.js:35 `const IVA_VENTA_DEF = 0.10;`; backend/cuenta-resultados.js:132 `const IVA_VENTA = 0.10; // hostelería`; backend/analisis-mes.js:17 `const IVA_HOSTELERIA = 0.10;`. costing.js la exporta (línea 174) pero los demás no la consumen: redefinen la suya.

**Prueba existente:** ninguno

**Nota:** No es fuente única: cuatro definiciones independientes del 10% que pueden divergir. cuenta-resultados.js tiene incluso una const local en vez de importar IVA_DEF/IVA_VENTA_DEF ya existentes.

### dinero.9 · abierto · [bloque 05] · sev bajo

**Evidencia:** backend/cuenta-resultados.js:49 `food_cost_pct: food_cost_pct != null ? Math.round(food_cost_pct * 100) : null` (entero; existe pct1() en :15 pero NO se usa aquí). backend/financiero.js:17 `function pctDe(n, base) { return base > 0 ? Math.round((n / base) * 1000) / 10 : null; }` y :68 `food_cost_pct: materia != null ? pctDe(materia, V) : null` (1 decimal). financials.js:160 y analisis-diario.js:102 también usan entero (`Math.round(...*100)`).

**Prueba existente:** tests/cuenta-resultados.unit.js:26 (`assert.strictEqual(r.cuenta.food_cost_pct, 30)` entero) y tests/financiero.unit.js:30 (`near(c.ratios.food_cost_pct, 26, 0.3)` 1 decimal) — fijan las dos precisiones divergentes

**Nota:** Divergencia de precisión real y además 'congelada' en tests (cada uno afirma su propia precisión). Impacto visual menor pero el mismo ratio se muestra con distinta precisión según la pantalla.

### dinero.10 · abierto · [bloque 06] · sev bajo

**Evidencia:** Canónica en backend/costing.js:137-139 `function valorStock(materias) { return Math.round((materias || ...).reduce((s, m) => s + (Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0), 0) * 100) / 100; }`. Duplicada inline por línea en: backend/routes/reportes.js:119 `valor_stock: r2(m.disponibilidad_actual * m.coste_medio)`; backend/routes/inicio.js:140 `valor_stock_actual: Math.round(m.disponibilidad_actual * m.coste_medio * 100) / 100`; backend/routes/materias.js:54 `valor_stock_actual: Math.round((Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0) * 100) / 100`; backend/analitica.js:56 `const v = (Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0);`; backend/inventory-capital.js:25 `return (Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0);`.

**Prueba existente:** ninguno

**Nota:** Parcialmente centralizado para el AGREGADO: financials.js:115, decisiones.js:206, analitica.js:44 e inventory-capital.js:47 sí llaman a costing.valorStock. Pero la valoración POR MATERIA (disponibilidad × coste_medio) se reimplementa inline en varias rutas porque costing no exporta un helper por ítem. El prompt 06 pide 'Reutiliza costing para valor de stock' → bloque 06.

### seguridad.1 · parcial · [bloque 02] · sev alto

**Evidencia:** backend/auth.js:42 `SECRET = "control-m-secret-dev-solo-local";` (secreto de desarrollo AÚN embebido en el repo). backend/auth.js:30-35: en producción sin JWT_SECRET solo aborta si `process.env.REQUIRE_JWT_SECRET === "1"`; en caso contrario `SECRET = crypto.randomBytes(48).toString("hex")` y continúa. El selector de entorno es backend/auth.js:18 `const EN_PRODUCCION = process.env.NODE_ENV === "production";`

**Prueba existente:** ninguno

**Nota:** En producción ya se usa secreto aleatorio (no la clave de dev). Pendiente: definir JWT_SECRET externo estable (entorno).

**Commit:** 389dfcf

### seguridad.2 · corregido+probado · [bloque 02] · sev critico

**Evidencia:** backend/routes/fichaje.js:46-51 `const persona = auth.verificarPin(usuario, pin); ... if (!persona) return res.status(422).json({ error: "PIN incorrecto. Inténtalo de nuevo." });`. backend/auth.js:138-143 `function verificarPin(keyOrNombre, pin){ ... return verifyPin(pin, u.pin_hash) ? {...} : null; }` con el comentario (línea 136) 'SIN emitir token ni tocar el bloqueo'. Los admin están en personasFichables (backend/routes/fichaje.js:17 usa todos los `usuarios`).

**Prueba existente:** ninguno

**Nota:** Confirmado: /api/fichaje/fichar es un oráculo de PIN. verificarPin no incrementa intentos_fallidos ni respeta bloqueado_hasta (a diferencia de login() en auth.js:147), y no hay rate limiting (ver seguridad.5). PIN de 4 dígitos (10.000 combinaciones) -> un usuario 'equipo' con sesión en la tablet (fichaje está en EQUIPO_ALLOWED, auth.js:63) puede enumerar el PIN de un admin sin disparar el bloqueo de login. tests/e2e.spec.js:1731-1732 incluso asevera el comportamiento vulnerable (PIN 0000 -> 422 y se puede reintentar), de modo que no existe prueba de bloqueo; añadir lockout rompería ese test tal cual está.

**Commit:** 389dfcf

### seguridad.3 · parcial+probado · [bloque 02] · sev alto

**Evidencia:** Sin CSP: grep de 'Content-Security-Policy' en frontend/index.html y de 'helmet/CSP/HSTS' en backend/ y package.json no devuelve nada. Sinks con datos dinámicos sin esc(): frontend/index.html:12697 `<td>${l.descripcion||""}</td>`, :12716 `<h1>Albarán — ${r.proveedor_nombre||r.proveedor_id}</h1>` y :12722 `<img src="${r.foto_albaran_url}">` dentro de `verAlbaran` (window.open + document.write, a partir de línea 12690). También frontend/index.html:11301 `⚠ ${a.mensaje}` y :11304-11305 `${cot.pedido_codigo}` / `${a.mensaje}` sin escapar.

**Prueba existente:** ninguno

**Nota:** CSP activa + esc() en todos los sinks de error; trocear el inline para quitar 'unsafe-inline' queda para fase posterior.

**Commit:** 389dfcf

### seguridad.4 · corregido+probado · [bloque 02] · sev medio

**Evidencia:** backend/server.js:11-16 solo registra `app.use(cors())` y `app.use(express.json({limit:"25mb"}))`; no hay helmet ni setHeader de X-Frame-Options/X-Content-Type-Options/Strict-Transport-Security/Referrer-Policy/Content-Security-Policy. Los únicos setHeader (server.js:401-411) son Content-Type y Cache-Control para estáticos. grep 'helmet' en todo el repo (sin node_modules) = vacío; package.json no lista helmet.

**Prueba existente:** ninguno

**Nota:** Confirmado estructuralmente. No hay ninguna cabecera de seguridad en ninguna respuesta. Clickjacking (sin X-Frame-Options/frame-ancestors), sniffing (sin X-Content-Type-Options) y ausencia de HSTS. HSTS en producción depende además del proxy de Render; aquí se afirma solo sobre lo que emite la app, que no pone ninguna.

**Commit:** 389dfcf

### seguridad.5 · corregido+probado · [bloque 02] · sev alto

**Evidencia:** backend/server.js:16 `app.use(express.json({ limit: "25mb" }));` es GLOBAL y se registra ANTES de la autenticación `app.use("/api", auth.requerido);` (server.js:325). No hay rate limiting en ninguna parte (grep 'rate.limit|rateLimit|express-rate|slowDown' en backend/ = vacío; package.json no lo lista). El endpoint público server.js:270 `app.post("/facturas/ingesta", express.json({ limit: "25mb" }), ...)` también parsea 25MB antes de comprobar el token (server.js:273-274).

**Prueba existente:** ninguno

**Nota:** Confirmado. El parser de 25MB corre para toda petición (incluidas /api sin token y los webhooks públicos) antes de autenticar -> amplificador de DoS y habilitador de la fuerza bruta de seguridad.2 (login y fichaje sin límite por IP). El comentario del propio código (server.js:12-15) reconoce que el parser global 'corre antes que los de cada ruta'.

**Commit:** 389dfcf

### seguridad.6 · corregido+probado · [bloque 02] · sev medio

**Evidencia:** backend/server.js:11 `app.use(cors());` sin opciones. El paquete cors por defecto responde `Access-Control-Allow-Origin: *` a todas las rutas.

**Prueba existente:** ninguno

**Nota:** Confirmado: CORS totalmente abierto. Atenuante real (honesto): el token JWT viaja en cabecera Authorization desde localStorage (no en cookie), por lo que no hay envío automático de credenciales cross-site; el impacto directo de ACAO:* es menor que con cookies de sesión. Aun así el hallazgo como está descrito (CORS * sin restringir a cliente/PWA legítimos) es correcto y sigue abierto; el plan pide restringirlo a orígenes identificados.

**Commit:** 389dfcf

### seguridad.7 · parcial · [bloque 02] · sev medio

**Evidencia:** backend/economia-guard.js:48-53 `function filtrarRespuestas(req,res,next){ if (req.user && req.user.rol !== "admin"){ const original = res.json.bind(res); res.json = (body) => original(stripEconomia(body)); } next(); }` — solo intercepta res.json. backend/economia-guard.js:13-24 PATRONES es una lista de prefijos (deny-list por nombre de campo). Se monta solo en /api (server.js:329).

**Prueba existente:** tests/economia-guard.unit.js

**Nota:** Guard económico = defensa en profundidad; la autorización por rol la impone auth.requerido + checks por ruta.

### seguridad.8 · corregido+probado · [bloque 02] · sev bajo

**Evidencia:** backend/server.js:210 (/avisos/cron) `const got = req.headers["x-cron-token"] || req.query.token; if (got !== token) return res.status(401)...`. backend/server.js:273-274 (/facturas/ingesta) `const got = req.headers["x-ingesta-token"] || (req.query && req.query.token); if (got !== token) return res.status(401)...`. Comparación con `!==` (no constante). Contraste: backend/tpv-connector.js:64-65 sí usa `crypto.timingSafeEqual`.

**Prueba existente:** ninguno

**Nota:** Confirmado literalmente: los dos endpoints nombrados comparan el token con !== (no constante en tiempo), mientras que el conector TPV ya migró a timingSafeEqual. Honesto: un ataque de temporización por red contra un token aleatorio de alta entropía es, en la práctica, muy difícil de explotar (jitter de red >> diferencia de bytes); el hallazgo es correcto pero de severidad baja. También conviene notar que /avisos/cron y /facturas/ingesta aceptan el token por query string (?token=), que puede acabar en logs/historial — riesgo mayor que la no-constancia en sí.

**Commit:** 389dfcf

### seguridad.9 · diferido · [bloque 02] · sev medio

**Evidencia:** frontend/index.html:2291 `function setSession(u){ localStorage.setItem("cm_session", JSON.stringify(u)); }` y :2431 `setSession({ key:..., rol: data.usuario.rol, token: data.token });` guardan el JWT en localStorage. :2290 `function getToken(){ const u=getUser(); return u && u.token; }` y :2566 `headers["Authorization"] = "Bearer " + t;`. No hay cookie httpOnly ni endpoint de refresh/rotación; en 401 (index.html:2572) solo se borra la sesión. El token se firma con 12h (backend/auth.js:19 `EXPIRA = "12h"`).

**Prueba existente:** ninguno

**Nota:** Token en localStorage. No se migra a cookies httpOnly a medias (decisión consciente, el plan lo desaconseja).

### datos.1 · abierto · [bloque 03] · sev alto

**Evidencia:** backend/agora.js:293 genera el id dentro del bucle y lo acumula en un array local: `id: store.nextId("mov", "stock_movements"),` — pero no inserta hasta backend/agora.js:314 `movimientos.forEach((mv) => store.insert("stock_movements", mv));`. Como nada se inserta durante el bucle, nextId (backend/data-store.js:303 `const n = items.length + 1;` y :304 `return `${prefix}-${String(n).padStart(3, "0")}-${Date.now().toString().slice(-5)}`;`) devuelve el MISMO `n` para todos los movimientos de la sync y solo los diferencia el sufijo de milisegundos. Dos movimientos creados en el mismo ms (casi seguro en un bucle síncrono) obtienen id idéntico.

**Prueba existente:** ninguno (tests/agora.unit.js:38-39 solo comprueba `movs.length >= 1` y delta<0; nunca valida unicidad de id en un lote con varios movimientos)

**Nota:** Confirmado por lectura. Impacto real: en modo Postgres store.insert->persistUpsert->db.upsert usa INSERT ... ON CONFLICT (id) DO UPDATE (backend/db.js:71-72), así que el segundo movimiento con id repetido SOBREESCRIBE al primero y el libro de stock pierde un asiento, rompiendo la invariante 'el stock no cambia sin movimiento' (trazabilidad). En modo JSON coexisten ids duplicados. El número de stock en materias se persiste aparte (writeAll) y queda correcto; el daño es sobre el libro/auditoría. La certeza de colisión en el mismo ms es altísima pero teóricamente dependiente del timing; verificable con un test que importe un doc multi-línea.

### datos.2 · abierto · [bloque 03] · sev alto

**Evidencia:** Mismo patrón en dos sitios. Inventario físico: backend/routes/inventario.js:64 `id: store.nextId("mov", "stock_movements"),` dentro del forEach, insertados después en :88 `movimientos.forEach((mv) => store.insert("stock_movements", mv));`. Conciliación de duplicados: backend/conciliacion-ventas.js:248 `id: store.nextId("mov", "stock_movements"),` dentro del filter, insertados en :258 `movimientos.forEach((mv) => store.insert("stock_movements", mv));`. En ambos el array no se inserta durante el bucle, luego nextId repite `n` y colisiona por ms igual que datos.1.

**Prueba existente:** ninguno (tests/conciliacion-ventas.unit.js:28 MONKEYPATCHEA `store.nextId = (p, n) => p + "-" + ((db[n] || []).length + 1)` sin sufijo de tiempo, con lo que ni ejercita el nextId real ni asserta unicidad; inventario no tiene test de /conteo)

**Nota:** Confirmado por lectura. Misma raíz que datos.1 (nextId + inserción diferida). El propio mock del test de conciliación reproduce la colisión -daría mov-1 a todos- pero no la comprueba, así que pasa en verde pese al defecto.

### datos.3 · abierto · [bloque 03] · sev alto

**Evidencia:** backend/data-store.js:199 `const next = prev.then(op).catch((e) => console.error(`Error guardando '${name}':`, e.message));` — en modo Postgres la cola TRAGA el error de db.upsert/db.del (solo lo loguea). insert/update/remove (backend/data-store.js:250-254, :241-248) son síncronos y no esperan la escritura, y flush() (backend/data-store.js:204-205 `return Promise.allSettled(Object.values(colas));`) nunca rechaza. La ruta responde 200 aunque la fila jamás llegue a la BD.

**Prueba existente:** ninguno (tests/persistence.unit.js:27-33 usa un fakePool que SIEMPRE resuelve; no prueba la propagación de un fallo de escritura a la respuesta HTTP)

**Nota:** Confirmado por lectura. Solo afecta al modo Postgres (producción) y solo cuando la escritura falla; el fallo real no es reproducible sin una BD que rechace. El riesgo es pérdida silenciosa de datos con 200 OK.

### datos.4 · abierto · [bloque 03] · sev alto

**Evidencia:** Escritura NO atómica: backend/data-store.js:150 `fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");` escribe directo sobre el fichero destino (sin tmp+rename; no hay rename/fsync en el módulo). Lectura con catch que devuelve [] ante JSON inválido: backend/data-store.js:131-145; la rama de siembra solo cubre ENOENT en modo aislado (:139), y para un JSON CORRUPTO o en producción (DATA_DIR===SEED_DIR) cae en :144 `return [];` silenciosamente.

**Prueba existente:** ninguno

**Nota:** Confirmado por lectura. Solo modo JSON. Un corte a mitad de writeFileSync deja el fichero truncado; la próxima lectura lo parsea mal y devuelve [] -> la entidad entera aparece vacía sin aviso. El nuevo bloque de aislamiento (SEED_DIR/DATA_DIR) no toca esto.

### datos.5 · abierto · [bloque 03] · sev medio

**Evidencia:** backend/data-store.js:220-221 `function persistAll(name) { if (usingDb) return encolar(name, () => db.replaceAll(name, cache[name]));` y backend/db.js:112-129 replaceAll hace `DELETE FROM ${t}` + bucle de INSERT. El camino de sync sigue llamando writeAll (=persistAll): backend/agora.js:315-316 `store.writeAll("materias", materias); store.writeAll("ventas", ventas);` en CADA importarDocs; igual en backend/routes/inventario.js:89 y backend/conciliacion-ventas.js:259-260.

**Prueba existente:** ninguno (tests/persistence.unit.js:36-44 valida que el upsert POR FILA no hace DELETE, pero no cubre que writeAll siga reescribiendo la tabla entera en la sync)

**Nota:** Confirmado por lectura. replaceAll va dentro de BEGIN/COMMIT (backend/db.js:115-122), así que es atómico (no hay riesgo de corrupción); el problema es de RENDIMIENTO/escala: cada sync de Ágora hace DELETE+re-INSERT de toda la tabla ventas (que crece sin límite). Podría encajar también en bloque 08. La infra de CRUD por fila existe pero los caminos de sync no la usan.

### datos.6 · abierto · [bloque 11] · sev alto

**Evidencia:** No existe ningún manejador de apagado en todo backend/: grep de `SIGTERM|SIGINT|beforeExit|process.on|process.once` devuelve 0 coincidencias. backend/server.js:500 `app.listen(PORT, ...)` arranca sin registrar drain. Las escrituras de Postgres viven en colas en memoria (backend/data-store.js:196 `const colas = {};`) que solo se vacían con flush() si alguien lo llama.

**Prueba existente:** ninguno

**Nota:** Confirmado por lectura/grep. Al redeplegar Render envía SIGTERM; el proceso muere sin drenar `colas`, así que cualquier upsert/del encolado y aún no confirmado se pierde. La ruta TPV sí espera flush antes de responder (backend/server.js:247), pero la mayoría de inserts/updates no esperan flush y no hay red de seguridad global al apagar. El efecto exacto solo se observa en producción (Render) -> no_confirmable al 100% sin ese entorno, pero la ausencia del handler es un hecho verificable.

### datos.7 · abierto · [bloque 03] · sev medio

**Evidencia:** Consumo: backend/agora.js:288-289 `const m = idxMat[ing.materia_id]; if (!m) return;` — si el materia_id del escandallo no existe, no descuenta ni avisa. Cálculo de coste: backend/costing.js:30-31 `const m = idxMat[materiaId]; const costeDirecto = m ? Number(m.coste_medio) || 0 : 0;` — materia inexistente aporta 0 €. Sin validación al guardar: backend/routes/recetas.js:22-23 `const materia = materias.find((m) => m.id === ing.materia_id); return { ...ing, nombre: materia ? materia.nombre : ing.materia_id, ... }` usa el id como nombre en vez de rechazar.

**Prueba existente:** ninguno

**Nota:** Confirmado por lectura. Un materia_id colgado se ignora en silencio en los tres puntos (no se descuenta stock, el food cost queda a 0, la receta se guarda igual). No rompe la ejecución pero falsea stock y coste sin dejar rastro.

### datos.8 · parcial+probado · [bloque 01] · sev alto

**Evidencia:** backend/server.js:425-436: si `!db.isActive()` solo hace console.warn (:427-431) y SOLO aborta con `if (enProd && process.env.REQUIRE_DB === "1") { ...; process.exit(1); }` (:432-434). Sin REQUIRE_DB=1 el arranque continúa sobre JSON efímero. Además backend/data-store.js:158-166 ya detecta DATABASE_URL presente con conexión fallida (`dbConnectFailed`), pero server.js no usa ese flag para abortar.

**Prueba existente:** ninguno

**Nota:** Arranque valida persistencia (aborta si DATABASE_URL falla o se exige BD); backup/restore verificado. Activar BD durable = pendiente de entorno.

**Commit:** 9a6784e

### datos.9 · abierto · [bloque 03] · sev medio

**Evidencia:** backend/data-store.js:289-298: tras ejecutar fn, muta la caché en el bucle (:291-296) y luego `if (!usingDb) tocadas.forEach((name) => writeFile(name, cache[name]));` (:298). Si writeFile (no atómico, :150) falla en el 2.º de varios ficheros, el primero ya quedó escrito y la caché ya mutada, sin rollback a disco.

**Prueba existente:** tests/persistence.unit.js:97-110 ("transaction es atómica: si fn lanza, no aplica nada") cubre SOLO el caso de fn que lanza antes de escribir; NO prueba el fallo de writeFile a mitad ni el rollback a disco

**Nota:** Confirmado por lectura. En modo Postgres transaction usa db.tx con BEGIN/COMMIT/ROLLBACK reales (backend/data-store.js:281-288 y backend/db.js:91-109), que SÍ es atómico. El defecto -sin atomicidad a disco- queda solo en modo JSON (dev/tests); en producción (Postgres) no aplica, de ahí severidad media.

### datos.10 · abierto · [bloque 03] · sev alto

**Evidencia:** backend/data-store.js:301-304 `function nextId(prefix, name) { const items = readAll(name); const n = items.length + 1; return `${prefix}-${String(n).padStart(3, "0")}-${Date.now().toString().slice(-5)}`; }`. La parte numérica depende de length, así que tras un remove() (que hace splice, :262) el siguiente insert reutiliza el mismo `n`; y en inserciones del mismo ms (p. ej. los bucles de datos.1/datos.2) colisiona el id completo porque el sufijo Date.now() es idéntico.

**Prueba existente:** ninguno

**Nota:** Confirmado por lectura. Es la causa raíz común de datos.1 y datos.2. El sufijo de ms evita colisión del id completo entre instantes distintos (solo se reutiliza la parte numérica), pero NO protege dentro del mismo ms. En Postgres, un id reutilizado dispara INSERT ... ON CONFLICT DO UPDATE (backend/db.js:71-72) y sobreescribe una fila existente -> pérdida de datos. La colisión por concurrencia pura (peticiones separadas en el mismo ms) es menos probable por el modelo monohilo de Node; la de los bucles por lote es prácticamente segura.

### motor-fechas.1 · abierto · [bloque 05] · sev critico

**Evidencia:** backend/routes/analisis-mes.js:33-35 guarda el NETO del CSV como cierre: `const id = "ventas_mes_"+snap.mes; ... store.update("config", id, { valor: snap.neto })` (snap.neto = suma de columna Base, p.ej. analisis-mes.unit.js: `s.neto===150`). Luego backend/cuenta-resultados.js:135-139 lo relee como bruto: `const guardado = config.find(c=>c.id===`ventas_mes_${R.etiqueta}`); ... ventasBruto = ovGuardado; ... const ventas = ... : eur(ventasBruto / (1 + IVA_VENTA));` → divide por 1,10 un valor que ya es neto = doble IVA.

**Prueba existente:** ninguno (tests/cuenta-resultados.unit.js «un cierre mensual guardado…» asume valor BRUTO 7777→7070 y NO ejercita la vía CSV que guarda snap.neto)

**Nota:** Confirmado solo con código, no requiere producción. La vía CSV (/importar) guarda net y el P&L lo vuelve a netear: los ingresos del mes importado salen ~9% por debajo y arrastran margen/EBITDA. La vía manual /cierre (routes/cuenta-resultados.js:41-61) rotula el valor como «ventas netas» en el comentario pero el motor lo trata como bruto: misma incoherencia de base. No hay versionado de base en el snapshot.

### motor-fechas.2 · abierto · [bloque 05] · sev alto

**Evidencia:** backend/analisis-mes.js:136-138 (agregarDesdeVentas, vía conector): `const cant = Number(v.cantidad)||0, imp = Number(v.importe)||0; ... d.uds += cant; d.neto += imp; d.total += imp * (1 + IVA_HOSTELERIA);` — usa v.importe (bruto; cf. pyl-neto.unit.js fixtures `importe:11, importe_neto:10`) como `neto`, ignorando v.importe_neto, y calcula `total = bruto*1,10` (IVA duplicado).

**Prueba existente:** ninguno (tests/analisis-mes.unit.js solo cubre parseExportAgora/CSV, no agregarDesdeVentas)

**Nota:** Verificable sin producción. Blast radius acotado al snapshot «Análisis del mes» (POST /api/analisis-mes/desde-ventas); ese snapshot no alimenta la Cuenta de Resultados ni ventas_mes_*, pero muestra a dirección un «neto» que en realidad es bruto (~+10%) y un «total» con IVA duplicado. El campo correcto v.importe_neto existe y se descarta.

### motor-fechas.3 · abierto · [bloque 06] · sev alto

**Evidencia:** backend/periods.js:29-47 calcula fronteras en hora del servidor: `startOfDay` `d.setHours(0,0,0,0)`, `startOfMonth` `new Date(d.getFullYear(), d.getMonth(), 1)`, `startOfYear` `new Date(d.getFullYear(), 0, 1)`, `startOfWeek` sobre startOfDay; no hay require("./tz") en el fichero. Igual en backend/cuenta-resultados.js:23-24 `const desde = new Date(y, m, 1).getTime(); const finMes = new Date(y, m + 1, 1).getTime();`.

**Prueba existente:** ninguno (tests/tz.unit.js solo prueba partes()/formateo de visualización, no las fronteras de periodo)

**Nota:** Verificable sin producción. En Render (UTC) la medianoche civil de Málaga está +1/+2h: ventas 00:00-02:00 Málaga caen en el día/mes/año anterior. tz.js SÍ se usa para horaDecimal en los dashboards (fracción de jornada), pero NUNCA para las fronteras de día/semana/mes/año. Impacto real matizado: muchas ventas de Ágora llevan BusinessDay sólo-fecha (parseado a medianoche UTC) que coincide con la frontera UTC; el riesgo se concreta en ventas con timestamp junto a medianoche y en los bordes de mes/año. Las pantallas quedan internamente consistentes entre sí (misma frontera UTC), pero desplazadas respecto al día civil real.

### motor-fechas.4 · abierto · [bloque 06] · sev medio

**Evidencia:** backend/periods.js:89-101 `comparativoAnterior`: `const len = r.hasta - r.desde; ... case "mes": desde = addMonths(r.desde, -1); ... return { desde, hasta: desde + len, ... }`. `len` es el tramo transcurrido del mes en curso (largo); sumado al día 1 del mes anterior (corto) se desborda su fin de mes. Vivo en backend/routes/business-health.js:15 `const ant = periods.comparativoAnterior(preset, now)` y backend/executive-dashboard.js:92,98,222 vía periods.resolver.

**Prueba existente:** ninguno (tests/financials.unit.js solo prueba comparativoAnterior("hoy"); comparativa-mtd.unit.js prueba tramoHastaMismoDia, que es la ruta CORREGIDA y distinta)

**Nota:** Verificable sin producción. Ej.: 31-mar con ~31 días transcurridos → periodo anterior = 1-feb + 31 días = hasta ~4-mar, contando febrero entero + primeros días de marzo e inflando el «anterior». El titular del panel_direccion usa el comparador correcto tramoHastaMismoDia; comparativoAnterior alimenta el bloque secundario «comparativo», beneficioAnterior y business-health, así que el defecto distorsiona esos deltas %, no los importes absolutos.

### motor-fechas.5 · abierto · [bloque 06] · sev bajo

**Evidencia:** backend/periods.js:104-111 `comparativoAnioAnterior`: `desde: new Date(new Date(r.desde).getFullYear() - 1, new Date(r.desde).getMonth(), new Date(r.desde).getDate(), new Date(r.desde).getHours()).getTime()` (ídem hasta). Reconstruye por hora-pared local, conserva sólo la hora (minutos/segundos se pierden) y para 29-feb de año bisiesto → año-1 no bisiesto desborda a 1-mar. Expuesto en backend/executive-dashboard.js:222 `anio_anterior: res.anio_anterior`.

**Prueba existente:** ninguno

**Nota:** Verificable sin producción. El salto 29-feb→1-mar es real pero sólo aplica en año bisiesto (1/4); la deriva de 1h en cambios DST y el truncado de minutos son despreciables sobre agregados mensuales/diarios. Severidad baja por frecuencia/impacto, defecto presente.

### motor-fechas.6 · abierto · [bloque 05] · sev medio

**Evidencia:** backend/cuenta-resultados.js:65-73 proyección lineal sin amortiguación ni mínimo de días: `if (enCurso && diasTranscurridos > 0 && diasTranscurridos < diasMes) { const factor = diasMes / diasTranscurridos; const ventasP = ventas * factor; ...; const personalMes = personal * (diasMes / diasTranscurridos); ... }`. Mismo patrón en backend/executive-dashboard.js:115 `beneficioActual.proyeccion_mes = eur(benMes.beneficio_operativo * (diasDelMes / diasTranscurridos))`.

**Prueba existente:** tests/cuenta-resultados.unit.js «proyecta a mes completo (lineal por días)» (fija el comportamiento lineal pero NO comprueba ni mitiga la volatilidad de los primeros días)

**Nota:** Verificable sin producción. En día 1 el factor es diasMes/1 ≈ 30×, de modo que la proyección oscila fuertemente al principio del mes; no hay suavizado, mínimo de días ni banda de confianza. Es el método lineal tal y como está diseñado (etiquetado «proyección»), no un error de cálculo, pero la condición de volatilidad señalada por la auditoría sigue intacta.

### agora.1 · parcial · [bloque 04] · sev alto

**Evidencia:** backend/conciliacion-ventas.js:214 `if (grupo.length < 2 || tipos.size < 2) return;` y :216 `ordenado.slice(1).forEach((t) => clavesAEliminar.push(t.clave));`. La firma (backend/conciliacion-ventas.js:42-48 `firmaTicket`) es solo productos+cantidades+importe redondeado, SIN hora ni cliente. La eliminación heurística de limpiarDuplicados sigue existiendo y borra ventas reales.

**Prueba existente:** conciliacion-ventas.unit.js (tests 'duplicado SOLO cuando cruza tipos (albarán+factura), no por cafés iguales' y 'limpiar duplicados quita el albarán, baja el total y repone stock')

**Nota:** Mitigado el caso más común: dos tickets IDÉNTICOS del MISMO tipo (20 cafés) ya NO se colapsan (guard tipos.size<2). PERO el defecto de fondo persiste: dentro de un grupo de firma que cruza tipos, se queda 1 y se borra el resto. Si dos ventas reales DISTINTAS tienen por casualidad la misma firma (mismos productos/importe) bajo tipos distintos (p.ej. cada una como albarán+factura → 4 tickets, 2 tipos), colapsa a 1 y borra 3 ventas legítimas, porque la firma ignora hora y cliente. El plan del bloque 04 pedía DESHABILITAR esta eliminación heurística y sustituirla por análisis de solo lectura + reparación por documentos; sigue viva y es destructiva (writeAll ventas). No hay test que cubra el falso positivo de ventas distintas con firma coincidente.

### agora.2 · abierto · [bloque 04] · sev alto

**Evidencia:** backend/agora.js:214-216 `const bizKey = (s, n, f) => ... return "${s}|${num}|${f.slice(0,10)}"` (solo Serie+Número+día) y :243-244 `const bk = bizKey(serie, number, fecha); if (serie != null && number != null && ventasBiz.has(bk))`. No hay ningún campo que vincule el número de albarán con el de su factura; dos documentos con números distintos no se cruzan en la ingesta.

**Prueba existente:** conciliacion-ventas.unit.js (solo prueba la DETECCIÓN posterior del doble conteo cruzado, no la prevención en la importación)

**Nota:** A nivel de ingesta el doble conteo albarán+factura NO se previene: bizKey no relaciona albarán#55 con factura#100 (números distintos), así que ambos se registran como venta. Existe un control compensatorio SOLO de lectura (conciliacion-ventas.js conciliacionDia detecta la firma cruzada) y una remediación manual (limpiarDuplicados), pero es la misma heurística peligrosa de agora.1 y requiere acción del admin; no cierra el defecto en la importación. Cuánto afecta en real depende de si Ágora emite de verdad albarán Y factura para la misma venta en este negocio (café): verificable solo con muestras reales del export.

### agora.3 · abierto · [bloque 04] · sev alto

**Evidencia:** backend/agora.js:47-95 `function importarVentas(...)` hace `ventas.push({ id: store.nextId("ven","ventas"), ... })` sin doc_clave ni dedupe. Llamada viva en 3 vías: backend/agora.js:359 `const r = importarVentas(texto, "cron")` (invocado por server.js:539 `setInterval(() => agora.cronImport(), 60*60*1000)`), backend/routes/ventas.js:33 `agora.importarVentas(csv, "manual")`, backend/ventas-email.js:77 `agora.importarVentas(txt, "email")`.

**Prueba existente:** ninguno

**Nota:** importarVentas no tiene idempotencia: reimportar el mismo CSV duplica todas las ventas. El cron (server.js:539) la ejecuta cada hora releyendo AGORA_CSV_PATH entero → si esa variable está configurada, duplica todo el fichero cada hora (sería crítico). En manual/email solo cae a esta vía cuando el parser jerárquico devuelve 0 docs (CSV plano). Ningún test referencia importarVentas (grep en tests/ sin coincidencias). Que AGORA_CSV_PATH esté o no puesto en producción no es verificable desde el repo, pero el código no idempotente y sus 3 vías están presentes.

### agora.4 · abierto · [bloque 04] · sev medio

**Evidencia:** backend/agora.js:214-216 `const bizKey = (s, n, f) => ... return "${s}|${num}|${f.slice(0,10)}"` — la clave NO incluye el tipo de documento; y :244 `if (serie != null && number != null && ventasBiz.has(bk)) ... deduplicados.push(...); return;` deduplica por Serie+Número+día sin mirar el tipo.

**Prueba existente:** ninguno (agora.unit.js:63 prueba idempotencia por Serie+Number usando el MISMO tipo DeliveryNote dos veces; no cubre la colisión entre tipos)

**Nota:** El defecto de código está presente y es verificable: bizKey ignora el tipo, así que un DeliveryNote y un Invoice con la misma Serie+Número en el mismo día se tratan como el mismo documento y el segundo se descarta (deduplicados), aunque sean dos ventas reales distintas. Si esto ocurre de verdad depende del esquema de numeración de Ágora (si las series por tipo pueden coincidir en número el mismo día): no confirmable sin muestras reales. En tensión con agora.2 (son las dos caras: aquí colapsa de más, allí cuenta de más).

### agora.5 · abierto · [bloque 04] · sev medio

**Evidencia:** backend/agora.js:256-271: la resolución de línea solo lee nombre, `cantidad` (:257), `importeRaw` de `["TotalAmount","Amount",...,"GrossAmount","UnitPrice",...]` (:258) y `netoRaw` de `["Base","NetAmount",...]` (:261). No hay ninguna referencia a descuento/discount/invitación/cortesía en backend/agora.js ni backend/ventas-export.js (grep sin coincidencias salvo un comentario). No existe resta de descuentos de línea/documento ni tratamiento de invitaciones.

**Prueba existente:** ninguno

**Nota:** El código no trata descuentos ni invitaciones como concepto. El importe se toma tal cual del campo de la línea. Si el TotalAmount/Base que exporta Ágora YA viene neto del descuento aplicado, no habría error monetario; si el descuento viaja en un campo aparte (o a nivel de documento) o si el código toma GrossAmount (pre-descuento, está en la lista de :258), el ingreso queda inflado. Una invitación con importe 0 y cantidad>0 se registra como venta a 0 (correcto) y descuenta stock (correcto), pero una invitación expresada como descuento no se resta. El impacto real exige ver un export real con descuentos/invitaciones: esa parte es no confirmable sin datos de producción.

### agora.6 · abierto · [bloque 04] · sev alto

**Evidencia:** backend/agora.js:189 `const procesadosPrev = new Set(docsAgora.filter(d => d.status==="processed").map(d => d.id))` y :218-219 `const ventasBiz = new Set(); ventas.forEach(...)` se construyen de la caché en memoria. backend/data-store.js:168-183 (init) hidrata la caché UNA vez al arrancar; readAll (:226-229) devuelve la caché, nunca re-lee la BD en runtime. backend/db.js:48-54 `CREATE TABLE ... id TEXT PRIMARY KEY` — no hay UNIQUE sobre doc_clave ni sobre Serie+Número (grep unique/constraint sin coincidencias); la fila de venta usa un id aleatorio (nextId).

**Prueba existente:** ninguno

**Nota:** La idempotencia es de un solo proceso: cada réplica tiene su propia caché, poblada al arranque y sin invalidación entre procesos. En un único proceso es segura (importarDocs es síncrona y muta la caché compartida, así que las peticiones concurrentes se serializan). Con ≥2 réplicas sobre el mismo Postgres, la réplica B no ve en su caché los docs que importó A → reprocesa y duplica ventas, y NO hay restricción UNIQUE en la tabla ventas (PK = id aleatorio) que lo frene a nivel de BD (docs_agora sí es idempotente por su PK=clave, pero las filas de venta no). Si producción corre 1 o N réplicas no es verificable desde el repo; el defecto de código (dedupe en memoria, sin constraint de BD) sí está confirmado.

### agora.7 · parcial · [bloque 04] · sev medio

**Evidencia:** backend/conciliacion-ventas.js:200-201 `const key = v.doc_clave; if (!key) return;` — limpiarDuplicados EXCLUYE las ventas sin doc_clave. backend/agora.js:219 `ventas.forEach(v => { if (v.doc_serie != null || v.doc_number != null) ventasBiz.add(...) })` — el índice bizKey de la ingesta omite las heredadas. PERO backend/conciliacion-ventas.js:100 `const tkey = v.doc_clave || "(sin doc) "+v.id;` — conciliacionDia SÍ las suma en bruto/neto y las muestra como tickets. backend/migracion-ventas-dup.js:28 borra las heredadas en meses que ya tienen consumo.

**Prueba existente:** migracion-ventas-dup.unit.js (cubre la migración compensatoria; limpiarDuplicados/conciliacionDia con heredadas no tienen test propio)

**Nota:** El hallazgo es mixto. 'Fuera de la limpieza' es CORRECTO: limpiarDuplicados hace `if (!key) return` (línea 201), y la ingesta no las indexa en bizKey (agora.js:219), así que una heredada no bloquea una reimportación equivalente. 'Fuera del cuadre' es solo PARCIALMENTE cierto: conciliacionDia SÍ las cuenta en los totales (línea 100, agrupadas como tipo 'Otro'), no quedan fuera del cuadre de importes. Además existe la migración de arranque migracion-ventas-dup.js que elimina las heredadas duplicadas en meses con consumo (idempotente, con test). Riesgo mitigado pero no cerrado: quedan vías donde una venta heredada sin doc_clave ni se dedup en ingesta ni se puede remediar con limpiarDuplicados.

### frontend.1 · abierto · [bloque 09] · sev alto

**Evidencia:** frontend/index.html:1561-1564 — la regla que efectivamente gana (con !important) es `.btn-primary, .btn-warn { background: var(--olive) !important; ... color: #23281E !important; }`. --olive = #45443D (:45). Contraste #23281E sobre #45443D ≈ 1.54:1.

**Prueba existente:** ninguno

**Nota:** El hallazgo describe EXACTAMENTE la regla de :1562-1564. El token --olive hoy es #45443D (grafito), y #23281E sobre ese fondo da ~1.54:1 por fórmula WCAG. En :hover el fondo pasa a #B7C77E (:1569) con buen contraste, pero el estado de reposo del botón primario (acción principal de toda la app) sigue casi ilegible. No requiere producción: es medible por fórmula.

### frontend.2 · parcial · [bloque 09] · sev medio

**Evidencia:** Siguen como div/span con onclick SIN role/tabindex: frontend/index.html:7016 `<div class="apstep..." onclick="toggleApertura(...)">` (checklist de apertura APPCC), :12609 `<div class="cja-cal-d..." ... onclick="cjaAbrir('${c.id}')">`, :12653 `<div onclick="toggleAlb('${listId}')" style="cursor:pointer...">`, :13208 `<span class="alerg-chip..." ... onclick="this.classList.toggle('on')">`. Mitigación presente: delegación global de teclado en :2271-2276 (Enter/Espacio sobre `[role="button"]`) + role=button/tabindex en logo (:2163, con onkeydown propio), tarjeta de lote (:8769) y de materia (:8934).

**Prueba existente:** tests/e2e.spec.js:567 ("acceso por teclado: Enter abre un dominio desde la barra inferior") — solo cubre #tabbar .tab, no los div/span señalados

**Nota:** Corrección incompleta: controles de flujos diarios (apertura APPCC, día del calendario de cierre, chip de alérgenos, toggle de albaranes) siguen sin semántica ni foco, no operables por teclado ni anunciados por lector. La delegación global de :2272 solo activa elementos con role="button", que estos cuatro no tienen. El grueso de controles sí usa <button> (521 onclick, la mayoría en <button>).

### frontend.3 · abierto · [bloque 09] · sev medio

**Evidencia:** frontend/index.html:2563-2581 función api(): `const r = await fetch(API + path, ...)` sin try/catch alrededor; el fallo de red lanza TypeError nativo ('Failed to fetch') que no se traduce. grep de 'navigator.onLine' y de UI 'offline/sin conexión' en todo el fichero: sin resultados (solo aparecen 'conexión' de Bluetooth/impresora y de Ágora).

**Prueba existente:** ninguno

**Nota:** No hay detección de online/offline ni reintento. El mensaje crudo del navegador llega a los catch que pintan ${e.message} (p. ej. :2885, :3920). El texto exacto depende del navegador ('Failed to fetch' en Chrome); confirmar la cadena literal mostrada al usuario en un dispositivo real sin red sería 'no_confirmable' sin producción, pero la ausencia de manejo/traducción está confirmada en el código.

### frontend.4 · corregido+probado · [bloque 02] · sev medio

**Evidencia:** Pintan ${e.message} SIN esc(): frontend/index.html:2885,2919,2939,3000,3042 `setInner(`<div class="err">${e.message}</div>`)`; :3920,4052,4102,6793,6804,6879,6916,6959,6974,6995 igual. Frente a los que SÍ escapan: :3121 `${esc(e.message)}`, :3851 `${esc(e.message)}`, :5294 `${esc(e.message||String(e))}`.

**Prueba existente:** ninguno

**Nota:** esc() se aplica de forma inconsistente a los mensajes de error, como dice el hallazgo. Riesgo XSS acotado: e.message procede de e.error del backend o de statusText (api():2574-2578); sería explotable solo si el servidor refleja entrada controlada en el mensaje. La inconsistencia es un hecho literal del código.

**Commit:** 389dfcf

### frontend.5 · abierto · [bloque 09] · sev medio

**Evidencia:** frontend/index.html:1829 `.lab-estado { font-size:9px; ...; color:#1a1f16; ... }` pintado sobre fondo inline `background:${est.c}` (:5487). LAB_ESTADOS (:5316-5319): prueba c:'#c79a3a' (~6.4:1 OK), aprobado c:'var(--olive)'=#45443D (~1.7:1), carta c:'#3f6079' (~2.5:1), archivado c:'var(--muted)'=#86847A (~4.47:1).

**Prueba existente:** ninguno

**Nota:** Texto casi negro (#1a1f16) en 9px mayúsculas sobre fondos oscuros/medios. 'Aprobado' (olivo, ~1.7:1) y 'En carta' (azul, ~2.5:1) quedan muy por debajo de 4.5:1; 'Archivado' justo por debajo (~4.47:1). Medible por fórmula WCAG; confirmado abierto.

### frontend.6 · abierto · [bloque 09] · sev medio

**Evidencia:** frontend/index.html:1019-1021 `.topbar-inicio { font-size:12px; ...; padding:7px 18px; ... }` (alto ≈30px con borde); :1025-1027 `.topbar-aj { font-size:12px; ...; padding:7px 15px; }` (≈30px); :1044-1045 `.topbar-back { ...; font-size:17px; ...; padding:0 4px 0 0; }` (~20px). La barra mide 94px (:1003) pero estos controles no llenan el alto.

**Prueba existente:** ninguno

**Nota:** Objetivos táctiles de ~28-31px (inicio/ajustes) y aún menores en el botón atrás, por debajo del mínimo recomendado 44x44px en una app móvil-primero. El imagotipo central sí mide 44px (:1032). La cifra '~28px' del hallazgo es aproximadamente correcta.

### frontend.7 · abierto · [bloque 09] · sev bajo

**Evidencia:** grep -oiE '#[0-9a-f]{6}|#[0-9a-f]{3}' frontend/index.html = 476 ocurrencias (135 únicas). En :root (:31-83) hay 30 custom properties, de las cuales ~17 son colores hex. Ejemplos de hex inline sueltos: #23281E (:1564), #B7C77E (:1569), #262B1E (:1035), #1a1f16 (:1829), #c79a3a/#3f6079 (:5316-5318).

**Prueba existente:** ninguno

**Nota:** Cifra confirmada al dígito: 476 hex inline frente a ~20 tokens (hallazgo exacto). Deriva de color / mantenibilidad: numerosos hex duplican o se desvían de los tokens definidos en :root.

### frontend.8 · abierto · [bloque 09] · sev bajo

**Evidencia:** frontend/index.html:3946 `function labPanel(titulo, lista, onclick){` es la ÚNICA aparición de 'labPanel' en el fichero (nunca se invoca). Su CSS `.lab-panel` (:1195, :1198, :1207) solo se emite dentro de esa función (:3947 `<button class="lab-panel" ...>`), por lo que también queda inalcanzable.

**Prueba existente:** ninguno

**Nota:** Código muerto confirmado por grep: labPanel() definido y sin ninguna llamada; .lab-panel referenciado solo dentro de labPanel(). (Nota: usa <button>, de modo que si se usara sería accesible por teclado; es irrelevante porque está muerto.)

### frontend.9 · abierto · [bloque 10] · sev medio

**Evidencia:** `wc -l frontend/index.html` = 13852 líneas. Sin configuración de linter: no hay .eslintrc*/eslint.config*/.prettierrc*/.stylelintrc*/biome.json; package.json no tiene script 'lint' ni eslint/prettier en devDependencies (solo @playwright/test); node_modules/.bin no contiene binarios de lint.

**Prueba existente:** ninguno

**Nota:** Confirmado: 13.852 líneas (coincide exactamente con el hallazgo) y cero linters. Listado como frontend.9 (el plan mapea los frontend.* al bloque 09), pero la introducción de lint es actividad explícita del bloque 10 ('Introduce lint útil de forma incremental'); por eso 'donde se arregla' = 10.

### frontend.10 · abierto · [bloque 09] · sev medio

**Evidencia:** frontend/index.html:1369 `.apstep.done .apstep-check { background: var(--ink); border-color: var(--ink); color: var(--ink); }`. El contenido del span es el ✓: :7017 `<span class="apstep-check">${done?'✓':''}</span>`. Con el paso 'done', el ✓ queda var(--ink) sobre fondo var(--ink) = invisible.

**Prueba existente:** ninguno

**Nota:** El ✓ es ink sobre ink: invisible, tal como describe el hallazgo. Matiz honesto: el círculo relleno oscuro sí se ve y el texto del paso recibe line-through + color muted (:1370), así que la finalización no queda totalmente sin señal; pero el check en sí es imperceptible. Afecta a la checklist de apertura/cierre (APPCC).

### frontend.11 · abierto · [bloque 09] · sev medio

**Evidencia:** frontend/index.html:355-357 `.btn-primary { background: var(--ink); color: var(--ink); border: none; ... }` — color idéntico al fondo (ambos var(--ink) = #1B1B16, :44).

**Prueba existente:** ninguno

**Nota:** La declaración base descrita sigue literal en :356-357 (abierto como defecto de código). Pero está TOTALMENTE anulada por la regla posterior con !important de :1561-1564 (background var(--olive), color #23281E), así que NO produce un botón invisible: el defecto visible real es el bajo contraste de frontend.1. Es, en la práctica, una declaración muerta/engañosa, no un fallo de render; se resuelve junto con frontend.1 unificando el color del botón primario.

### pwa.1 · parcial · [bloque 07] · sev alto

**Evidencia:** backend/sv-timers.js:60-64 init(): `const vivos = leer().filter((t) => t.fireAt > now); guardar(vivos); vivos.forEach(agendar);` — al arrancar DESCARTA los ya vencidos (no los dispara). El disparo vive en un setTimeout (línea 37: `const to = setTimeout(() => disparar(t), Math.min(ms, 2147483000));`), que muere con el proceso. /avisos/cron (backend/server.js:214) solo despierta para el resumen diario (avisos.cronTick), no reprocesa temporizadores.

**Prueba existente:** ninguno (tests/e2e.spec.js:1058 ejecuta svtStart pero solo comprueba la barra visual #cronos-bar y el estado RETIRA; no verifica el push ni la persistencia servidor)

**Nota:** Hay persistencia real en config (sv_timers) y init() REPROGRAMA en el arranque, así que un reinicio limpio que termine ANTES de fireAt sí conserva el aviso. Pero el caso del hallazgo (el server duerme/reinicia y el intervalo cubre fireAt) sigue abierto: al despertar, el temporizador vencido se filtra con `fireAt > now` y nunca se dispara, por lo que el push 'retira' se pierde. Crítico en Render free-tier (que duerme sin tráfico); mitigado en instancia siempre-activa.

### pwa.2 · abierto · [bloque 07] · sev medio

**Evidencia:** backend/push.js:80 `await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data);` — se llama SIN tercer argumento de opciones. La librería web-push aplica por defecto TTL=2419200 s (4 semanas) y no envía cabecera Urgency (el servicio push la trata como 'normal'). No hay ningún `TTL`/`urgency`/`headers` en backend/ (grep sin resultados relevantes).

**Prueba existente:** ninguno

**Nota:** El defecto está intacto: sin TTL corto ni urgency 'high', un 'retira' retenido (dispositivo apagado, ahorro de batería, cola del servicio push) puede entregarse mucho después o conservarse hasta 4 semanas, llegando caduco. La ventana real de retraso solo se confirma con dispositivos/servicios push reales (no verificable del todo sin producción), pero la ausencia de opciones en el código es inequívoca.

### pwa.3 · parcial · [bloque 09] · sev medio

**Evidencia:** backend/push.js:21-35: cuando no hay VAPID_PUBLIC_KEY/PRIVATE_KEY ni doc 'vapid' guardado, `const g = webpush.generateVAPIDKeys();` genera claves nuevas; se añadió `console.warn("Push: generadas claves VAPID nuevas...")` (líneas 31-34). En frontend/index.html:4913 `if(await reg.pushManager.getSubscription()) return;` — si el navegador conserva su suscripción (firmada con la clave vieja) corta y NO re-suscribe, así que tras regenerar la clave el cliente nunca se recupera.

**Prueba existente:** ninguno

**Nota:** El console.warn mitiga el 'sin avisar' solo para el operador (log de servidor), no para el usuario. El defecto de fondo persiste: al regenerar VAPID las suscripciones existentes quedan inservibles y svtEnsurePush no las renueva (getSubscription corta). Solo ocurre en modo efímero (sin Postgres y sin env VAPID_*); CLAUDE.md indica que producción usa DATABASE_URL (Postgres), donde config y push_subs persisten y no se regenera. No verificable el impacto exacto sin saber el modo de despliegue real.

### pwa.4 · abierto · [bloque 09] · sev bajo

**Evidencia:** frontend/sw.js:13 `self.addEventListener("fetch", () => {});` — handler fetch vacío (passthrough puro). El comentario (líneas 8-12) declara explícitamente 'NO cachea nada'. No hay uso de caches/Cache API ni precache en sw.js ni en el proyecto (grep de 'precache'/'caches' sin resultados).

**Prueba existente:** ninguno

**Nota:** Factualmente cierto: no hay app-shell precacheado, la app es inservible sin red. Pero es una decisión de diseño DELIBERADA (cargar siempre la última versión en vivo), documentada en el propio SW. Si el funcionamiento offline no es un requisito del negocio, podría reclasificarse como 'descartado'; tal como está redactado el hallazgo, el defecto (ausencia de precache) existe.

### pwa.5 · abierto · [bloque 07] · sev bajo

**Evidencia:** frontend/index.html:4968 svtAlarma dispara en primer plano `new Notification("⏰ Retira: "+c.label, { ... tag:c.id ...})` con c.id = 'sv'+n (línea 4893). El servidor dispara en paralelo el push a la misma hora y el SW lo muestra en frontend/sw.js:30 `self.registration.showNotification(title, options)` con tag = t.id = 'svp'+Date.now()+random (backend/sv-timers.js:42). Los tags DIFIEREN, así que no se colapsan: aparecen dos notificaciones. El handler push de sw.js (líneas 15-31) no comprueba clientes enfocados antes de mostrar.

**Prueba existente:** ninguno

**Nota:** El duplicado requiere que el push del servidor llegue efectivamente (avisos activados y suscripción válida). No hay deduplicación por cliente enfocado ni tag común entre el aviso local y el del servidor. Confirmado por lectura; el solapamiento visual exacto solo se ve en dispositivo real.

### pwa.6 · abierto · [bloque 07] · sev medio

**Evidencia:** frontend/index.html:4900-4901 svtStart lanza el POST y asigna el id de forma asíncrona: `api("/avisos/temporizador",{...}).then(r=>{ t.pushId = r.id; }).catch(()=>{});`. frontend/index.html:4905 svtStop: `if(t && t.pushId){ api("/avisos/temporizador/"+t.pushId,{method:"DELETE"}).catch(()=>{}); }` — si se para antes de que llegue la respuesta, t.pushId es null (inicializado en línea 4893) y NO se envía el DELETE, así que el temporizador del servidor nunca se cancela y disparará su push.

**Prueba existente:** ninguno

**Nota:** Carrera real e intacta: parar un temporizador en los ~milisegundos/segundo previos a recibir el id del servidor deja vivo el aviso 'retira' en el backend. No hay cola de cancelaciones pendientes ni reintento. Daño bajo (aviso espurio), pero el defecto persiste.

### pwa.7 · abierto · [bloque 09] · sev bajo

**Evidencia:** frontend/manifest.webmanifest (completo, 17 líneas): claves presentes name, short_name, description, start_url, scope, display, orientation, background_color, theme_color, lang, icons. NO existe la clave "id".

**Prueba existente:** ninguno

**Nota:** Confirmado por lectura íntegra del manifest: no declara 'id' de aplicación. Los navegadores usan start_url como id implícito, por lo que el impacto es menor (buena práctica de identidad/instalación estable), pero el hallazgo es correcto: el campo no está.

### rendimiento.1 · abierto · [bloque 08] · sev alto

**Evidencia:** backend/agora.js:316 `store.writeAll("ventas", ventas);` (y :315 materias) en CADA importarDocs → data-store.js:221 `if (usingDb) return encolar(name, () => db.replaceAll(name, cache[name]));` → db.js:112-120 `replaceAll` hace `await client.query(`DELETE FROM ${t}`);` seguido de un bucle de INSERT. También ventas-export.js:86-87 `store.writeAll("ventas", ...)` al reemplazar meses. En modo JSON equivale a reescribir el fichero entero (data-store.js:211/150).

**Prueba existente:** ninguno

**Nota:** El conector empuja cada ~15 min y cada ingesta reescribe toda la tabla ventas+materias, O(n) por sync. Existen primitivos por fila (db.upsert/store.insert, probados en persistence.unit.js) pero el sync NO los usa para ventas/materias. El coste real en producción crece con el histórico; estructuralmente el patrón DELETE+re-INSERT está vigente.

### rendimiento.2 · abierto · [bloque 08] · sev medio

**Evidencia:** backend/routes/dashboard.js:12 `res.json(dashboard.calcular({ now: Date.now() }));` sin caché ni cabecera de cacheo. dashboard-ceo.js recorre `ventas` muchas veces: mediaMismoDiaSemana (líneas 155-165) llama a analisisDiario.ventaDia 8 veces, serieMes (línea 450) recorre todas las ventas, más ventaDia de hoy (207) y de la semana pasada (321); ventaDia filtra el array completo cada vez. frontend/index.html:3862 `_dashTimer=setInterval(()=>{...loadHomeCEO()...}, 180000);` = 3 min.

**Prueba existente:** ninguno

**Nota:** El número exacto "30-40 pasadas" no es verificable al milímetro, pero el orden de magnitud (docenas de recorridos completos del array ventas por llamada, sin memoización ni caché de respuesta) sí se confirma leyendo el código.

### rendimiento.3 · abierto · [bloque 08] · sev alto

**Evidencia:** backend/data-store.js:168-183 init() hace para cada entidad `let rows = await db.loadAll(name)` (:171) o `cache[name] = readFile(name)` (:181). backend/db.js:63-67 `loadAll` = `SELECT data FROM ${t} ORDER BY seq ASC` (todas las filas). readAll (data-store.js:226-229) devuelve el array completo de la caché. db.js solo expone count/loadAll/upsert/del/tx/replaceAll: no hay ninguna consulta con WHERE por fecha ni índice.

**Prueba existente:** ninguno

**Nota:** Relacionado con bloques 03/06. El techo real de memoria/arranque solo se confirma en producción con volumen (p. ej. 1-2 años de ventas); estructuralmente es cierto que toda la BD se hidrata en memoria y la selección por fecha se hace recorriendo arrays en JS, nunca por SQL.

### rendimiento.4 · abierto · [bloque 08] · sev alto

**Evidencia:** frontend/index.html = 974475 bytes (~950 KB). No existe middleware `compression()` en ningún .js del repo (grep sin coincidencias). backend/server.js:415-417 sirve .html y sw.js con `res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")`. frontend/sw.js:13 `self.addEventListener("fetch", () => {});` — passthrough puro, no cachea nada.

**Prueba existente:** ninguno

**Nota:** La parte de SW corresponde también a bloque 09 (PWA). A nivel de app no hay gzip/deflate y el HTML va con no-store (se re-descarga en cada carga). Render podría aplicar compresión en el edge: eso NO es verificable sin acceso a producción, pero el defecto a nivel de aplicación (sin compresión, no-store, SW sin caché) es real.

### rendimiento.5 · abierto · [bloque 08] · sev medio

**Evidencia:** backend/analisis-diario.js:55 `const cu = p ? costing.costeProducto(p, idxMat) : 0;` dentro de `lineas.forEach` (:50). backend/costing.js:74-78 costeProducto → costeEscandallo (:51-57) → costeMateriaEfectivo (:29-47, recursivo con guardia anti-ciclos). No hay memo/caché por producto en costing.js.

**Prueba existente:** ninguno

**Nota:** Para productos con `coste_materia` directo hay short-circuit O(1) (costing.js:76), así que la recursión real solo afecta a elaboraciones con ingredientes; pero el coste se recalcula por cada línea y en cada pasada (ventaDia se invoca ~11 veces por render del dashboard). Sin memoización, vigente.

### rendimiento.6 · abierto · [bloque 08] · sev medio

**Evidencia:** backend/routes/ventas.js:63-65 `router.get("/", (req, res) => { res.json(store.readAll("ventas").slice().reverse()); });` — devuelve el array completo invertido, sin parámetros de límite/offset ni paginación.

**Prueba existente:** ninguno

**Nota:** Devuelve todas las ventas en cada petición; el impacto crece linealmente con el histórico. No hay ruta paginada alternativa.

### rendimiento.7 · abierto · [bloque 08] · sev medio

**Evidencia:** backend/data-store.js:59 `"stock_movements"` está en ENTITIES (se hidrata entero en init). Inserción (nunca purga): agora.js:314 `movimientos.forEach((mv) => store.insert("stock_movements", mv));`, inventario.js:88 y conciliacion-ventas.js:258 (mismo patrón). Lectura completa en memoria: conciliacion.js:73 `(store.readAll("stock_movements") || []).forEach(...)`, inventory-capital.js:42, time-machine.js:54. No hay política de retención/archivado (solo limpieza-demo.js para datos de demo).

**Prueba existente:** ninguno

**Nota:** Relacionado con bloque 06. Es la tabla que más crece (1+ movimiento por ingrediente por línea de venta). El crecimiento sin límite y el impacto en memoria solo se cuantifican en producción con histórico, pero la ausencia de corte temporal/archivado es verificable y está vigente.

### rendimiento.8 · abierto · [bloque 08] · sev medio

**Evidencia:** backend/data-store.js:209-213 `persistUpsert`: en modo JSON (`!usingDb`) ejecuta `writeFile(name, cache[name])`. writeFile (:148-151) hace `fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8")` — fichero completo y síncrono. insert (:250-255) y update (:241-248) llaman a persistUpsert, de modo que cada alta/edición reescribe el array entero.

**Prueba existente:** ninguno

**Nota:** Relacionado con bloque 03. Inherente al backend JSON (un array en un único fichero no admite escritura por fila). En producción con DATABASE_URL NO aplica (usa db.upsert por fila, data-store.js:210). El riesgo real es dev y cualquier despliegue sin Postgres.

### tests.1 · abierto · [bloque 03] · sev critico

**Evidencia:** backend/data-store.js:199 `const next = prev.then(op).catch((e) => console.error("Error guardando '"+name+"':", e.message));` (la cola traga el error) y :205 `return Promise.allSettled(Object.values(colas));` (flush nunca rechaza). La ruta de dinero (TPV/Ágora) escribe por esta vía: backend/server.js:254 `await store.flush();` seguido de :255 `res.json(r);` → confirma éxito aunque el upsert de PostgreSQL haya fallado. backend/tpv-connector.js y backend/agora.js:314-316 usan store.insert/update/writeAll (persistUpsert/persistAll → encolar), no transaction().

**Prueba existente:** ninguno (tests/persistence.unit.js prueba durabilidad en modo JSON y la atomicidad de transaction()/db.tx —líneas 81-122—, pero NINGUNA inyecta un pool que rechace en la vía encolar/flush para comprobar que el fallo se propaga)

**Nota:** El defecto sigue vivo en la vía single-row + flush, que es la del camino crítico de ventas/stock. Existe una mitigación parcial opt-in: data-store.transaction() usa db.tx (BEGIN/COMMIT/ROLLBACK, db.js:91-109) y SÍ propaga el error, pero no se emplea en la ingesta de Ágora/TPV. flush() con allSettled + encolar con catch garantizan que un fallo de BD se registre solo en consola y la API responda OK. No requiere producción para confirmarse: es lógica de código.

### tests.2 · abierto · [bloque 03] · sev alto

**Evidencia:** grep repo-wide (backend/**, scripts/**) de `process.on|uncaughtException|unhandledRejection|SIGTERM|SIGINT|beforeExit` → sin resultados. backend/server.js solo tiene el .catch del arranque: :548 `.catch((e) => {` … :550 `process.exit(1);` que cubre únicamente el fallo de store.init(). No hay handler de proceso ni cierre ordenado.

**Prueba existente:** ninguno

**Nota:** Literalmente cierto: no hay red de seguridad a nivel de proceso ni apagado ordenado (SIGTERM/SIGINT) como pide el bloque 03. Matiz honesto: capturar unhandledRejection y seguir vivo puede ser peor que caer; lo que falta de forma inequívoca es (a) logging+salida ordenada ante error fatal y (b) drenaje en SIGTERM para no perder escrituras en vuelo.

### tests.3 · corregido+probado · [bloque 01] · sev medio

**Evidencia:** scripts/test-unit.js:38 `const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-unit-"));` + :39 `env = { ...process.env, CONTROL_M_DATA_DIR: dataDir }` + :52-54 `finally { ... fs.rmSync(dataDir, { recursive: true, force: true }); }`. playwright.config.js:13 `const E2E_DATA_DIR = process.env.CONTROL_M_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "cm-e2e-"));` + :32 `env: { PORT: String(PORT), CONTROL_M_DATA_DIR: E2E_DATA_DIR }`. data-store.js:26-32 resolveDataDir y :139-143 siembra transparente desde SEED_DIR cuando falta el fichero runtime, sin mutar los fixtures.

**Prueba existente:** tests/backup-restore.unit.js:53-54 asserta que las escrituras caen en dirB y no en SEED_DIR (`no tocó SEED_DIR`)

**Nota:** El mecanismo frágil (reset manual con `git checkout backend/data` antes/después) queda eliminado: unit y e2e escriben en un DATA_DIR temporal aislado sembrado desde las semillas, los fixtures versionados nunca se tocan. Dos matices menores: (1) el temp del e2e no se borra con un globalTeardown (queda un dir en os.tmpdir, inocuo); (2) CLAUDE.md sigue documentando el ritual viejo de `git checkout HEAD -- backend/data/`, ya innecesario.

**Commit:** 9a6784e

### tests.4 · abierto · [bloque 03] · sev alto

**Evidencia:** backend/server.js: tras montar todas las rutas /api (hasta :400) y el estático (:406-423) el fichero pasa directo a `store.init()` (:426); no existe ningún `app.use((err, req, res, next) => …)` ni un 404 catch-all de /api. grep de `app.use((err` y `app.use((req, res, next` → sin resultados. Cada handler async se apoya en su propio try/catch; un throw async no capturado no lo recoge Express 4 (ligado también a tests.2).

**Prueba existente:** ninguno

**Nota:** No hay manejador de errores homogéneo ni 404 JSON uniforme para /api como exige el bloque 03. Una ruta /api inexistente cae al estático (index.html) en vez de devolver 404 JSON.

### tests.5 · parcial · [bloque 10] · sev bajo

**Evidencia:** scripts/test-unit.js:17-35 define `const FILES = [ ... ].map((n) => "tests/"+n+".unit.js")` y :43-51 un bucle `for (const file of FILES) { ... spawnSync(process.execPath, [file], ...); if (r.status !== 0) { failed = file; break; } }`. La cadena `&&` de package.json ya no existe (package.json:10 `"test": "npm run test:unit && npm run test:e2e"`). package.json:14-16 devDependencies = solo `@playwright/test`; grep de lint/coverage/nyc/c8 → sin resultados.

**Prueba existente:** ninguno (es el propio runner)

**Nota:** Mitigado el punto frágil principal (encadenado con && sustituido por lista ordenada + DATA_DIR aislado; comm de ficheros en disco vs referenciados en el runner = vacío, no hay huecos silenciosos). Persiste la parte de 'sin framework ni cobertura': runner casero sin node:test/jest/vitest ni herramienta de cobertura, y es fail-fast (break al primer fallo: los tests posteriores no corren).

### tests.6 · abierto · [bloque 10] · sev bajo

**Evidencia:** find de `.eslintrc*`, `eslint.config.*`, `.prettierrc*` en la raíz → sin resultados. grep `lint|prettier|eslint|nyc|c8|coverage` en package.json y backend/package.json → 'NO lint/coverage'. .github/workflows/ci.yml no tiene paso de análisis estático (solo npm ci + playwright install + npm test).

**Prueba existente:** ninguno

**Nota:** Sin cambios respecto al hallazgo: no hay ESLint/Prettier ni análisis estático en repo ni en CI.

### tests.7 · parcial · [bloque 10] · sev medio

**Evidencia:** tests/e2e.spec.js:610 `const RUTAS = ["/api/inicio", "/api/materias", "/api/carta", "/api/recetas", "/api/mbds/ingredientes", "/api/mbds/bebidas", "/api/mermas"];` y :620 `expect(comprobadas, ...).toBeGreaterThanOrEqual(4);` → sigue siendo una lista fija con umbral de solo 4 respuestas. Mitigación en producción: backend/server.js:337 `app.use("/api", require("./economia-guard").filtrarRespuestas);` aplica el filtro a TODA respuesta /api (también futuras), y tests/economia-guard.unit.js prueba stripEconomia en profundidad.

**Prueba existente:** tests/e2e.spec.js:604 ("regla nº2: el equipo NO recibe coste/precio/margen...") y tests/economia-guard.unit.js

**Nota:** El riesgo real de fuga está muy mitigado por el guardián global (defensa en profundidad a nivel de middleware, no lista fija), pero la parte literal del hallazgo —que la verificación HTTP se hace sobre una lista fija de rutas y no descubre rutas money-adjacent nuevas— sigue vigente: la e2e recorre 7 rutas fijas y exige solo >=4, sin autodescubrir todos los segmentos accesibles al equipo (bloque 10: 'una lista parcial de cuatro respuestas no basta').

### tests.8 · abierto · [bloque 03] · sev medio

**Evidencia:** grep de `morgan|app.use((req, res, next|requestId|x-request-id` → sin resultados; no hay middleware de logging de peticiones ni request-id. Seeds con catch vacío en backend/server.js:473 `require("./seed-cafe").seedCafe().catch(() => {});` y análogos en :475,478,479,480,481,482,492,494,496,499,501,504,506, más :488 `.then(() => { try { require("./seed-productos-facturas").aplicar(store); } catch (e) {} })`.

**Prueba existente:** ninguno

**Nota:** Ambas partes del hallazgo siguen presentes: sin trazabilidad de peticiones HTTP (auditoria.js registra acciones de negocio, no peticiones) y las semillas siguen tragando errores en silencio. Las limpiezas de arranque (server.js:511-530) sí loguean su catch; las semillas no.

### tests.9 · corregido+probado · [bloque 01] · sev bajo

**Evidencia:** .github/workflows/ci.yml: paso 'Instalar dependencias del backend (reproducible)' → `run: npm ci --prefix backend`; paso 'Instalar dependencias de test (reproducible)' → `run: npm ci`. No queda ningún `npm install` en el workflow.

**Prueba existente:** n/a (configuración de CI)

**Nota:** Corregido: CI usa instalación determinista con lockfiles. Ambos lockfiles existen (package-lock.json raíz 2249 B y backend/package-lock.json 87 KB), requisito de npm ci. No verificable en vivo que la Action corra verde sin ejecutar el pipeline, pero la configuración ya no usa npm install.

**Commit:** 9a6784e

### tests.10 · abierto · [bloque 10] · sev bajo

**Evidencia:** tests/e2e.spec.js es un único fichero de 119.073 bytes con ~109 llamadas `test(` (grep -c 'test(' = 109) y grep `test.describe` → sin resultados (sin agrupación por área). playwright.config.js: `fullyParallel: false` y un solo project chromium con un webServer compartido → ejecución serial con estado compartido.

**Prueba existente:** n/a

**Nota:** Sigue monolítico y serial. El aislamiento de DATOS mejoró (DATA_DIR temporal por run, tests.3), pero el estado del servidor y de la BD de pruebas se comparte entre todos los tests del fichero y no hay separación por áreas ni paralelismo. Severidad baja: es mantenibilidad/robustez de la suite, no un bug de correctitud del producto.

### tests.11 · abierto · [bloque 03] · sev medio

**Evidencia:** backend/server.js:22 `const persistente = db.isActive();` y :33 `persistencia: persistente ? "persistente" : "efimera"`. backend/db.js:131-133 `function isActive() { return pool != null; }` → solo comprueba que el objeto pool existe (creado una vez al arrancar si `SELECT 1` pasó en connect(), db.js:41), no ejecuta ninguna consulta viva en el healthcheck. No hay endpoint de readiness que verifique BD ni estado de hidratación/inicialización.

**Prueba existente:** tests/e2e.spec.js:20 ('la API de salud responde y reporta el modo de persistencia') solo comprueba r.ok() y que persistencia ∈ {persistente, efimera}; no valida que se consulte la BD

**Nota:** El hallazgo sigue vigente: /api/salud informa 'persistente' basándose en un flag de arranque, no en una comprobación viva de la BD; si PostgreSQL cae tras el arranque el endpoint seguiría diciendo 'persistente'. No se puede confirmar el comportamiento exacto en caída real sin producción, pero la lógica (pool != null, sin ping) es evidente en el código.

