# CONTROL-CORRECCIONES · Control M

**Actualizado:** 2026-10-11 (correcciones C1–C9) · **Rama:** claude/jolly-franklin-3j3eg4.
Matriz de los **79 hallazgos** de AUDITORIA-MILIMETRO-2026-10.md. Para cada uno se separa la **evidencia histórica** (el defecto original) de la **evidencia actual** (código del HEAD de hoy) y se indica la **prueba específica y su resultado**. Un commit o una suite en verde no cierran un hallazgo por sí solos.

**Estados:** `corregido+probado` (arreglado + prueba específica que PASA) · `corregido` (arreglado y verificado por lectura/smoke/e2e, sin test unitario dedicado) · `parcial+probado` · `parcial` · `abierto` · `diferido` (decisión consciente) · `no_confirmado` (requiere acceso/decisión de despliegue). **Prod:** todo `no-desplegado` (ver procedimiento único de producción al final; no se despliega hasta autorizarlo).

Ronda C1–C9: se completó **todo lo resoluble en local**. Ya no queda ningún hallazgo
`abierto`: los 19 que lo estaban se cerraron (código + prueba) o se reclasificaron como
`parcial`/`diferido` con justificación concreta (decisión de escalado, revisión visual
o refactor grande de bajo valor). Lo único que sigue dependiendo de muestra/acceso/
decisión externa queda marcado como tal, no como "pendiente por prioridad".

## Resumen (recalculado)

| Estado | Nº |
|---|---|
| corregido+probado | 45 |
| corregido | 16 |
| parcial+probado | 6 |
| parcial | 7 |
| abierto | 0 |
| diferido | 4 |
| no_confirmado | 1 |
| **Total** | **79** |

## Tabla

| ID | Sev | Estado | Bloque | Commit |
|---|---|---|---|---|
| dinero.1 | critico | parcial+probado | 05 | 4086f53 |
| dinero.2 | alto | parcial | 05 | 6c6d2fc |
| dinero.3 | alto | corregido+probado | 05 | 4086f53 |
| dinero.4 | alto | corregido+probado | 05 | 4086f53 |
| dinero.5 | alto | corregido+probado | 05 | 4086f53 |
| dinero.6 | medio | corregido+probado | 05/C8 | a479959 |
| dinero.7 | medio | corregido+probado | 05/C8 | a479959 |
| dinero.8 | bajo | corregido+probado | 05 | 4086f53 |
| dinero.9 | bajo | corregido+probado | 05/C8 | a479959 |
| dinero.10 | bajo | corregido+probado | 05/C8 | a479959 |
| seguridad.1 | alto | parcial | 02 | 389dfcf |
| seguridad.2 | critico | corregido+probado | 02 | 389dfcf |
| seguridad.3 | alto | parcial+probado | 02 | 389dfcf |
| seguridad.4 | medio | corregido+probado | 02 | 389dfcf |
| seguridad.5 | alto | corregido+probado | 02 | 389dfcf |
| seguridad.6 | medio | corregido | 02 | 389dfcf |
| seguridad.7 | medio | parcial | 02 | 42288d9 |
| seguridad.8 | bajo | corregido+probado | 02 | 389dfcf |
| seguridad.9 | medio | diferido | 02 | - |
| datos.1 | alto | corregido+probado | 03 | 065676a |
| datos.2 | alto | corregido+probado | 03 | 065676a |
| datos.3 | alto | corregido+probado | 03 | 065676a |
| datos.4 | alto | corregido+probado | 03 | 065676a |
| datos.5 | medio | corregido+probado | 03/08 | 6c6d2fc |
| datos.6 | alto | corregido | 03 | 065676a |
| datos.7 | medio | corregido+probado | 06/C5 | 44e5df4 |
| datos.8 | alto | parcial+probado | 01 | 519e4de |
| datos.9 | medio | parcial | 03 | 065676a |
| datos.10 | alto | corregido+probado | 03 | 065676a |
| motor-fechas.1 | critico | corregido+probado | 05/11 | fb1bd8a |
| motor-fechas.2 | alto | corregido+probado | 05/11 | fb1bd8a |
| motor-fechas.3 | alto | corregido+probado | 06/C6 | 7e6f232 |
| motor-fechas.4 | medio | corregido+probado | 06/C6 | 7e6f232 |
| motor-fechas.5 | bajo | corregido+probado | 06/C6 | 7e6f232 |
| motor-fechas.6 | medio | corregido+probado | 06/C6 | 7e6f232 |
| agora.1 | alto | corregido+probado | 04/C1 | 61e0070 |
| agora.2 | alto | parcial | 04 | 02d0101 |
| agora.3 | alto | corregido+probado | 04/C3 | 61e0070 |
| agora.4 | medio | corregido+probado | 04/C3 | 61e0070 |
| agora.5 | medio | parcial+probado | 04/C4 | 44e5df4 |
| agora.6 | alto | no_confirmado | 11 | - |
| agora.7 | medio | parcial+probado | 11/C8 | 3658fd8 |
| frontend.1 | alto | corregido | 09 | 2607c60 |
| frontend.2 | medio | parcial+probado | 09 | 2607c60 |
| frontend.3 | medio | corregido | 09 | 2607c60 |
| frontend.4 | medio | corregido | 02 | 389dfcf |
| frontend.5 | medio | corregido | 09/C8 | 3658fd8 |
| frontend.6 | medio | corregido | 09/C8 | 3658fd8 |
| frontend.7 | bajo | diferido | 09 | - |
| frontend.8 | bajo | corregido | 09/C8 | 3658fd8 |
| frontend.9 | medio | corregido+probado | 10 | 42288d9 |
| frontend.10 | medio | corregido | 09 | 2607c60 |
| frontend.11 | medio | corregido | 09 | 2607c60 |
| pwa.1 | alto | corregido+probado | 07 | 593ee6e |
| pwa.2 | medio | corregido+probado | 07 | 593ee6e |
| pwa.3 | medio | diferido | 07 | - |
| pwa.4 | bajo | corregido | 09 | 2607c60 |
| pwa.5 | bajo | corregido | 07/C8 | 3658fd8 |
| pwa.6 | medio | corregido | 07/C8 | 3658fd8 |
| pwa.7 | bajo | corregido | 07 | 593ee6e |
| rendimiento.1 | alto | corregido+probado | 08 | 6c6d2fc |
| rendimiento.2 | medio | corregido | 08/C8 | 3658fd8 |
| rendimiento.3 | alto | parcial | 08 | 3658fd8 |
| rendimiento.4 | alto | corregido+probado | 08/C8 | 3658fd8 |
| rendimiento.5 | medio | corregido+probado | 08 | 2314e59 |
| rendimiento.6 | medio | corregido | 08/C8 | 3658fd8 |
| rendimiento.7 | medio | corregido+probado | 08/C8 | 3658fd8 |
| rendimiento.8 | medio | parcial | 08 | 6c6d2fc |
| tests.1 | critico | corregido+probado | 03 | 065676a |
| tests.2 | alto | corregido+probado | 03 | f89a8cc |
| tests.3 | medio | corregido+probado | 01 | 9a6784e |
| tests.4 | alto | corregido+probado | 03 | 065676a |
| tests.5 | bajo | corregido+probado | 10 | 42288d9 |
| tests.6 | bajo | corregido+probado | 10 | 42288d9 |
| tests.7 | medio | corregido+probado | 10 | 42288d9 |
| tests.8 | medio | corregido+probado | 03 | 065676a |
| tests.9 | bajo | corregido+probado | 01 | 9a6784e |
| tests.10 | bajo | diferido | 10 | - |
| tests.11 | medio | corregido+probado | 03 | 065676a |

## Detalle por hallazgo (histórico vs actual)

### dinero.1 · parcial+probado · [bloque 05] · commit 4086f53

- **Evidencia histórica (defecto original):** backend/cuenta-resultados.js:43 `const ebitda = tieneMateria ? eur(margen_bruto - personal - otros_fijos - variables) : null;` donde margen_bruto deriva de `ventas` NETAS (cuenta-resultados.js:139 `ventasBruto / (1 + IVA_VENTA)`) pero `otros_fijos`/`personal` salen de fixed-costs.costeEnRangoSegmentado, que usa `amount` CRUDO (fixed-costs.js:34 `const amount = Number(fc.amount) || 0;` y :120 `const c = costeDiario(f) * dias; if (pers) personal += c; else otros += c;`). Mismo patrón en financials.js:146-147 (`base = ventasNetas; operativo = eur(base - costeMateria - laboral - variables - fijos)` con `fijos = eur(seg.otros)`). El campo `vat` SÍ se captura (routes/fixed-costs.js:23 `c.vat = Number(body.vat) || 0;` y :83) pero el motor fixed-costs.js NUNCA lo lee: no hay neteo ni base explícita.
- **Evidencia actual (HEAD):** fixed-costs.js importeNeto(): netea el IVA DEDUCIBLE de un coste fijo con base 'con_iva'; por defecto no cambia nada (sin migración ciega).
- **Prueba y resultado:** tests/motor-financiero.unit.js (fijo 12,10 con 21% deducible = 10) · PASA

### dinero.2 · parcial · [bloque 05] · commit 6c6d2fc

- **Evidencia histórica (defecto original):** backend/break-even.js:76 `const ratio = contrib.ratio_contribucion > 0 ? contrib.ratio_contribucion : null;` toma el ratio de contribucion() que deriva de costing.margenMedioCarta (base PVP bruto con coste CON IVA). La base fija es cruda (break-even.js:67 `return fixedCosts.totales(now).diario + staff.costeDiarioTotal();`) y el margen de seguridad compara contra ventas BRUTAS (break-even.js:113 `const ventasMes = financials.ventasEnRango(rMes);`, que suma `v.importe` con IVA). No hay convención de IVA única: contribución en basis bruto-con-IVA-de-venta, fijos sin convención, ventas brutas.
- **Evidencia actual (HEAD):** break-even.js:113 usa ventasNetasEnRango → margen de seguridad en base NETA (antes bruto vs equilibrio neto). Falta unificar del todo objetivo bruto/neto mostrado.
- **Prueba y resultado:** verificado por lectura; sin test dedicado todavía

### dinero.3 · corregido+probado · [bloque 05] · commit 4086f53

- **Evidencia histórica (defecto original):** Conviven dos convenciones de food cost/margen: (1) motor de carta/contribución CON IVA de venta — costing.js:90-96 `margenProducto`: `const coste = ...costeNeto * (1 + iva)...; const foodCost = precio > 0 ? coste / precio : 0;` (precio = PVP bruto), consumido por break-even.js:38 `const ratio = costing.margenMedioCarta(items, idx);`. (2) motor del P&L NETO/NETO ponderado — financials.js:160 `food_cost_pct: base > 0 ? Math.round((costeMateria / base) * 100) : null` con `base = ventasNetas`; cuenta-resultados.js:115 `const foodCostProd = ventasNetasProd > 0 ? materiaProd / ventasNetasProd : null;`; analisis-diario.js:102 `food_cost_pct: netoConCoste > 0 ? Math.round((coste / netoConCoste) * 100) : null`.
- **Evidencia actual (HEAD):** costing.margenProducto (net), cierre-mes ingreso NETO y el P&L comparten base neta/neta.
- **Prueba y resultado:** tests/motor-financiero.unit.js + consistencia-pantallas.unit.js · PASA

### dinero.4 · corregido+probado · [bloque 05] · commit 4086f53

- **Evidencia histórica (defecto original):** backend/costing.js:93 `const coste = Math.round(costeNeto * (1 + iva) * 10000) / 10000; // coste CON IVA` y :100 `margen_euros: Math.round((precio - coste) * 100) / 100` (precio = precio_venta BRUTO). Ese margen en euros bruto se propaga a break-even.js:33 `contribucion_eur: m.margen_euros`. El P&L calcula el margen en neto: financials.js:146-147 `base = ventasNetas; operativo = eur(base - costeMateria - ...)`.
- **Evidencia actual (HEAD):** costing.js margenProducto.margen_euros = precioNeto − costeNeto (antes PVP bruto − coste con IVA).
- **Prueba y resultado:** tests/motor-financiero.unit.js (margen_euros=7,5) · PASA

### dinero.5 · corregido+probado · [bloque 05] · commit 4086f53

- **Evidencia histórica (defecto original):** backend/costing.js:82-84 `function ivaDe(producto) { const v = producto && producto.iva != null ? Number(producto.iva) : IVA_DEF; return v >= 0 && v < 1 ? v : IVA_DEF; }` (IVA_DEF=0.10, es el IVA de VENTA en hostelería) y costing.js:91-93 `const iva = ivaDe(producto); const coste = Math.round(costeNeto * (1 + iva) * 10000) / 10000; // coste CON IVA`. El comentario de la línea 88-89 dice 'neto + IVA de compra' pero aplica el IVA de venta del producto.
- **Evidencia actual (HEAD):** costing.js margenProducto usa precio_neto = PVP/(1+iva) y coste NETO (ya no engrosa el coste con el IVA de VENTA).
- **Prueba y resultado:** tests/motor-financiero.unit.js (food cost 25%) · PASA

### dinero.6 · corregido+probado · [bloque 05/C8] · commit a479959

- **Evidencia histórica (defecto original):** backend/financials.js:152 `const interesesPeriodo = eur(cuotaMensual * (dias / (365 / 12)) * 0.3); // ~30% de la cuota como interés estimado`.
- **Comportamiento anterior:** el interés de deuda se estimaba como un 30% PLANO de la cuota mensual, constante inventada sin relación con cada deuda.
- **Implementación actual (HEAD):** backend/debts.js `interesMensual(d)` deriva el interés de los DATOS de cada deuda: si tiene tipo anual (`interest_rate`/`tin`/`tae`) → `pendiente × tipo / 12`; si no → de la amortización real (`intereses totales restantes ÷ cuotas restantes`). backend/financials.js usa `debtsMod.interesMensualTotal(now)` en vez del 30%.
- **Prueba específica:** tests/dinero-consistencia.unit.js (interés por tipo anual = 60 €/mes para 12.000 € al 6%; sin tipo se deriva de la amortización, ≈16,67 €, no 30 € planos; sin datos → 0).
- **Resultado:** PASA. Sigue etiquetado como estimación, pero basada en datos reales, no en una constante arbitraria.

### dinero.7 · corregido+probado · [bloque 05/C8] · commit a479959

- **Evidencia histórica (defecto original):** costing.js margenMedioCarta/foodCostMedioCarta eran medias aritméticas por nº de productos, sin ponderar por ventas; break-even las usaba como único `ratio_contribucion`.
- **Comportamiento anterior:** no se distinguía el margen de CATÁLOGO (no ponderado) del margen REALIZADO (ponderado por el mix vendido).
- **Implementación actual (HEAD):** backend/costing.js:`margenPonderadoVentas(productos, ventas, idx)` calcula el ratio realizado = Σ(margen € · uds) / Σ(ingreso neto · uds), ignorando productos sin coste fiable. backend/break-even.js expone AMBOS: `ratio_contribucion` (catálogo) y `ratio_contribucion_ponderado` (realizado).
- **Prueba específica:** tests/dinero-consistencia.unit.js (con un mix sesgado a producto de bajo margen, el ponderado < el de catálogo; sin ventas → null).
- **Resultado:** PASA.

### dinero.8 · corregido+probado · [bloque 05] · commit 4086f53

- **Evidencia histórica (defecto original):** Constante 0.10 definida por separado en 4 módulos: backend/costing.js:81 `const IVA_DEF = 0.10;`; backend/financials.js:35 `const IVA_VENTA_DEF = 0.10;`; backend/cuenta-resultados.js:132 `const IVA_VENTA = 0.10; // hostelería`; backend/analisis-mes.js:17 `const IVA_HOSTELERIA = 0.10;`. costing.js la exporta (línea 174) pero los demás no la consumen: redefinen la suya.
- **Evidencia actual (HEAD):** backend/iva.js es la fuente única de IVA_VENTA; financials/costing/cuenta-resultados/analisis-mes la importan.
- **Prueba y resultado:** tests/motor-financiero.unit.js · PASA

### dinero.9 · corregido+probado · [bloque 05/C8] · commit a479959

- **Evidencia histórica (defecto original):** cuenta-resultados.js y financials.js redondeaban los ratios a ENTERO (`Math.round(x*100)`) mientras financiero.js y analisis-diario.js usaban 1 decimal. El mismo food_cost_pct salía con precisión distinta según la pantalla.
- **Comportamiento anterior:** precisión dispar y "congelada" en tests, cada pantalla con la suya.
- **Implementación actual (HEAD):** backend/fmt.js es la fuente ÚNICA de `eur`/`pct1`/`pctDe` (1 decimal). cuenta-resultados.js, financials.js, financiero.js y analisis-diario.js la importan; se corrigieron los `food_cost_pct`/ratios que iban a entero (cuenta-resultados:food_cost_pct y margen_ebitda_pct; financials: los 5 ratios; analisis-diario:food_cost_pct).
- **Prueba específica:** tests/dinero-consistencia.unit.js (`CR.componer` con ratio 0,266 → 26.6, no 27; fmt.pct1/pctDe coinciden).
- **Resultado:** PASA.

### dinero.10 · corregido+probado · [bloque 05/C8] · commit a479959

- **Evidencia histórica (defecto original):** la valoración POR MATERIA (disponibilidad × coste_medio) se reimplementaba inline en reportes.js, inicio.js, materias.js, analitica.js e inventory-capital.js, con redondeos dispares; costing solo exportaba el agregado.
- **Comportamiento anterior:** cinco copias inline de la misma fórmula de dinero.
- **Implementación actual (HEAD):** backend/costing.js exporta `valorStockRaw(m)` (crudo) y `valorStockMateria(m)` (redondeado por ítem); `valorStock` suma en crudo y redondea UNA vez. Los cinco consumidores usan ahora el helper (reportes/inicio/materias → valorStockMateria; analitica/inventory-capital → valorStockRaw).
- **Prueba específica:** tests/dinero-consistencia.unit.js (por ítem a 2 decimales; agregado sin doble redondeo).
- **Resultado:** PASA.

### seguridad.1 · parcial · [bloque 02] · commit 389dfcf

- **Evidencia histórica (defecto original):** backend/auth.js:42 `SECRET = "control-m-secret-dev-solo-local";` (secreto de desarrollo AÚN embebido en el repo). backend/auth.js:30-35: en producción sin JWT_SECRET solo aborta si `process.env.REQUIRE_JWT_SECRET === "1"`; en caso contrario `SECRET = crypto.randomBytes(48).toString("hex")` y continúa. El selector de entorno es backend/auth.js:18 `const EN_PRODUCCION = process.env.NODE_ENV === "production";`
- **Evidencia actual (HEAD):** auth.js: en producción se usa un secreto ALEATORIO (no la clave de dev). Falta definir JWT_SECRET externo estable (variable de entorno).
- **Prueba y resultado:** verificado por lectura; pendiente de env

### seguridad.2 · corregido+probado · [bloque 02] · commit 389dfcf

- **Evidencia histórica (defecto original):** backend/routes/fichaje.js:46-51 `const persona = auth.verificarPin(usuario, pin); ... if (!persona) return res.status(422).json({ error: "PIN incorrecto. Inténtalo de nuevo." });`. backend/auth.js:138-143 `function verificarPin(keyOrNombre, pin){ ... return verifyPin(pin, u.pin_hash) ? {...} : null; }` con el comentario (línea 136) 'SIN emitir token ni tocar el bloqueo'. Los admin están en personasFichables (backend/routes/fichaje.js:17 usa todos los `usuarios`).
- **Evidencia actual (HEAD):** seguridad.js limitadorAuth (cuenta solo fallos por IP) aplicado en routes/auth.js y routes/fichaje.js.
- **Prueba y resultado:** tests/seguridad.unit.js (limitador) · PASA

### seguridad.3 · parcial+probado · [bloque 02] · commit 389dfcf

- **Evidencia histórica (defecto original):** Sin CSP: grep de 'Content-Security-Policy' en frontend/index.html y de 'helmet/CSP/HSTS' en backend/ y package.json no devuelve nada. Sinks con datos dinámicos sin esc(): frontend/index.html:12697 `<td>${l.descripcion||""}</td>`, :12716 `<h1>Albarán — ${r.proveedor_nombre||r.proveedor_id}</h1>` y :12722 `<img src="${r.foto_albaran_url}">` dentro de `verAlbaran` (window.open + document.write, a partir de línea 12690). También frontend/index.html:11301 `⚠ ${a.mensaje}` y :11304-11305 `${cot.pedido_codigo}` / `${a.mensaje}` sin escapar.
- **Evidencia actual (HEAD):** CSP activa (seguridad.js cabeceras) + esc() en los sinks de error. Falta trocear el inline para quitar 'unsafe-inline'.
- **Prueba y resultado:** tests/seguridad.unit.js + integracion-http.unit.js (CSP en vivo) · PASA

### seguridad.4 · corregido+probado · [bloque 02] · commit 389dfcf

- **Evidencia histórica (defecto original):** backend/server.js:11-16 solo registra `app.use(cors())` y `app.use(express.json({limit:"25mb"}))`; no hay helmet ni setHeader de X-Frame-Options/X-Content-Type-Options/Strict-Transport-Security/Referrer-Policy/Content-Security-Policy. Los únicos setHeader (server.js:401-411) son Content-Type y Cache-Control para estáticos. grep 'helmet' en todo el repo (sin node_modules) = vacío; package.json no lista helmet.
- **Evidencia actual (HEAD):** seguridad.js cabeceras: nosniff/X-Frame/HSTS/Referrer/Permissions + CSP.
- **Prueba y resultado:** tests/seguridad.unit.js + integracion-http.unit.js (nosniff en vivo) · PASA

### seguridad.5 · corregido+probado · [bloque 02] · commit 389dfcf

- **Evidencia histórica (defecto original):** backend/server.js:16 `app.use(express.json({ limit: "25mb" }));` es GLOBAL y se registra ANTES de la autenticación `app.use("/api", auth.requerido);` (server.js:325). No hay rate limiting en ninguna parte (grep 'rate.limit|rateLimit|express-rate|slowDown' en backend/ = vacío; package.json no lo lista). El endpoint público server.js:270 `app.post("/facturas/ingesta", express.json({ limit: "25mb" }), ...)` también parsea 25MB antes de comprobar el token (server.js:273-274).
- **Evidencia actual (HEAD):** server.js: guard que rechaza cargas >256KB sin autenticar en /api + limitador de fuerza bruta.
- **Prueba y resultado:** tests/seguridad.unit.js · PASA

### seguridad.6 · corregido · [bloque 02] · commit 389dfcf

- **Evidencia histórica (defecto original):** backend/server.js:11 `app.use(cors());` sin opciones. El paquete cors por defecto responde `Access-Control-Allow-Origin: *` a todas las rutas.
- **Evidencia actual (HEAD):** server.js: CORS restringido a allowlist (antes abierto). La PWA es same-origin; el conector no manda Origin.
- **Prueba y resultado:** e2e (same-origin funciona); sin test de cross-origin bloqueado

### seguridad.7 · parcial · [bloque 02] · commit 42288d9

- **Evidencia histórica (defecto original):** backend/economia-guard.js:48-53 `function filtrarRespuestas(req,res,next){ if (req.user && req.user.rol !== "admin"){ const original = res.json.bind(res); res.json = (body) => original(stripEconomia(body)); } next(); }` — solo intercepta res.json. backend/economia-guard.js:13-24 PATRONES es una lista de prefijos (deny-list por nombre de campo). Se monta solo en /api (server.js:329).
- **Evidencia actual (HEAD):** economia-guard es defensa en profundidad; la autorización real la impone auth.requerido + checks por ruta.
- **Prueba y resultado:** tests/roles-regla2.unit.js (el guard oculta coste/margen) · PASA

### seguridad.8 · corregido+probado · [bloque 02] · commit 389dfcf

- **Evidencia histórica (defecto original):** backend/server.js:210 (/avisos/cron) `const got = req.headers["x-cron-token"] || req.query.token; if (got !== token) return res.status(401)...`. backend/server.js:273-274 (/facturas/ingesta) `const got = req.headers["x-ingesta-token"] || (req.query && req.query.token); if (got !== token) return res.status(401)...`. Comparación con `!==` (no constante). Contraste: backend/tpv-connector.js:64-65 sí usa `crypto.timingSafeEqual`.
- **Evidencia actual (HEAD):** seguridad.tokenIgual (tiempo constante) en /avisos/cron y /facturas/ingesta; el conector ya lo hacía.
- **Prueba y resultado:** tests/seguridad.unit.js (tokenIgual) · PASA

### seguridad.9 · diferido · [bloque 02]

- **Evidencia histórica (defecto original):** frontend/index.html:2291 `function setSession(u){ localStorage.setItem("cm_session", JSON.stringify(u)); }` y :2431 `setSession({ key:..., rol: data.usuario.rol, token: data.token });` guardan el JWT en localStorage. :2290 `function getToken(){ const u=getUser(); return u && u.token; }` y :2566 `headers["Authorization"] = "Bearer " + t;`. No hay cookie httpOnly ni endpoint de refresh/rotación; en 401 (index.html:2572) solo se borra la sesión. El token se firma con 12h (backend/auth.js:19 `EXPIRA = "12h"`).
- **Evidencia actual (HEAD):** Token en localStorage. No se migra a cookies httpOnly a medias (decisión consciente).
- **Prueba y resultado:** n/a (diferido)

### datos.1 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** backend/agora.js:293 genera el id dentro del bucle y lo acumula en un array local: `id: store.nextId("mov", "stock_movements"),` — pero no inserta hasta backend/agora.js:314 `movimientos.forEach((mv) => store.insert("stock_movements", mv));`. Como nada se inserta durante el bucle, nextId (backend/data-store.js:303 `const n = items.length + 1;` y :304 `return `${prefix}-${String(n).padStart(3, "0")}-${Date.now().toString().slice(-5)}`;`) devuelve el MISMO `n` para todos los movimientos de la sync y solo los diferencia el sufijo de milisegundos. Dos movimientos creados en el mismo ms (casi seguro en un bucle síncrono) obtienen id idéntico.
- **Evidencia actual (HEAD):** data-store.nextId = prefijo-tiempo-aleatorio (no length).
- **Prueba y resultado:** tests/durabilidad.unit.js (5000 ids únicos) · PASA

### datos.2 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** Mismo patrón en dos sitios. Inventario físico: backend/routes/inventario.js:64 `id: store.nextId("mov", "stock_movements"),` dentro del forEach, insertados después en :88 `movimientos.forEach((mv) => store.insert("stock_movements", mv));`. Conciliación de duplicados: backend/conciliacion-ventas.js:248 `id: store.nextId("mov", "stock_movements"),` dentro del filter, insertados en :258 `movimientos.forEach((mv) => store.insert("stock_movements", mv));`. En ambos el array no se inserta durante el bucle, luego nextId repite `n` y colisiona por ms igual que datos.1.
- **Evidencia actual (HEAD):** mismo nextId sin colisión en conciliación/inventario.
- **Prueba y resultado:** tests/durabilidad.unit.js · PASA

### datos.3 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** backend/data-store.js:199 `const next = prev.then(op).catch((e) => console.error(`Error guardando '${name}':`, e.message));` — en modo Postgres la cola TRAGA el error de db.upsert/db.del (solo lo loguea). insert/update/remove (backend/data-store.js:250-254, :241-248) son síncronos y no esperan la escritura, y flush() (backend/data-store.js:204-205 `return Promise.allSettled(Object.values(colas));`) nunca rechaza. La ruta responde 200 aunque la fila jamás llegue a la BD.
- **Evidencia actual (HEAD):** data-store.flush() propaga el fallo de la cola (no 200 en falso). **C7 (commit 37a32d8)** lo refuerza: un guardado fallido marca la entidad en `divergencias()` (la caché quedó por delante del almacén durable) y `reconciliar()` re-hidrata desde Postgres/fichero, de modo que la caché no "miente" tras el fallo; un reinicio solo ve lo durable.
- **Prueba y resultado:** tests/durabilidad.unit.js (flush propaga) + tests/persistencia-divergencia.unit.js (divergencia + reconciliación + reintento idempotente, JSON y BD simulada) · PASA

### datos.4 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** Escritura NO atómica: backend/data-store.js:150 `fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");` escribe directo sobre el fichero destino (sin tmp+rename; no hay rename/fsync en el módulo). Lectura con catch que devuelve [] ante JSON inválido: backend/data-store.js:131-145; la rama de siembra solo cubre ENOENT en modo aislado (:139), y para un JSON CORRUPTO o en producción (DATA_DIR===SEED_DIR) cae en :144 `return [];` silenciosamente.
- **Evidencia actual (HEAD):** writeFile atómico (temp+rename) y JSON corrupto LANZA DATOS_CORRUPTOS (no [] silencioso).
- **Prueba y resultado:** tests/durabilidad.unit.js · PASA

### datos.5 · corregido+probado · [bloque 03/08] · commit 6c6d2fc

- **Evidencia histórica (defecto original):** backend/data-store.js:220-221 `function persistAll(name) { if (usingDb) return encolar(name, () => db.replaceAll(name, cache[name]));` y backend/db.js:112-129 replaceAll hace `DELETE FROM ${t}` + bucle de INSERT. El camino de sync sigue llamando writeAll (=persistAll): backend/agora.js:315-316 `store.writeAll("materias", materias); store.writeAll("ventas", ventas);` en CADA importarDocs; igual en backend/routes/inventario.js:89 y backend/conciliacion-ventas.js:259-260.
- **Evidencia actual (HEAD):** store.insertMany + db.insertMany: la ingesta añade solo lo nuevo (no reescribe la tabla).
- **Prueba y resultado:** tests/incremental-ventas.unit.js (sin DELETE) · PASA

### datos.6 · corregido · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** No existe ningún manejador de apagado en todo backend/: grep de `SIGTERM|SIGINT|beforeExit|process.on|process.once` devuelve 0 coincidencias. backend/server.js:500 `app.listen(PORT, ...)` arranca sin registrar drain. Las escrituras de Postgres viven en colas en memoria (backend/data-store.js:196 `const colas = {};`) que solo se vacían con flush() si alguien lo llama.
- **Evidencia actual (HEAD):** server.js: cierre ordenado SIGTERM/SIGINT (server.close → flush → cerrar BD).
- **Prueba y resultado:** smoke en bloque 03 (log 'cierre ordenado'); sin test automatizado de señal

### datos.7 · corregido+probado · [bloque 06/C5] · commit 44e5df4

- **Evidencia histórica (defecto original):** backend/costing.js:30-31 `const costeDirecto = m ? Number(m.coste_medio) || 0 : 0;` — materia inexistente/sin coste aportaba 0 € SILENCIOSO, dando un margen aparentemente completo con coste infravalorado.
- **Comportamiento anterior:** avisar de una materia inexistente (resumen.materias_faltantes) NO impedía que el coste se calculara como 0; margenProducto devolvía un margen cerrado aunque el escandallo estuviera a medias.
- **Implementación actual (HEAD):** costing.js es la fuente única: `costeMateriaDetalle` distingue "no lo sé" (`resuelto:false`) de "cuesta 0", resolviendo elaboraciones por su receta. `margenProducto` expone `incompleto` + `materias_sin_coste` + `coste_fiable`. `cartaCosteada` EXCLUYE los incompletos de la media y `cartaIncompleta` los lista aparte. cierre-mes lee el flag (antes recontaba con un heurístico que daba falsos positivos en elaboraciones); routes/carta devuelve `coste_incompleto`.
- **Prueba específica:** tests/coste-parcial.unit.js (materia inexistente → resuelto:false; elaboración sí resuelve; escandallo incompleto marca `incompleto`/`materias_sin_coste` y NO entra en la media de carta).
- **Resultado:** PASA. (También sigue vigente el aviso de stock en agora.js:resumen.materias_faltantes y tests/periodos-stock.unit.js.)

### datos.8 · parcial+probado · [bloque 01] · commit 519e4de

- **Evidencia histórica (defecto original):** backend/server.js:425-436: si `!db.isActive()` solo hace console.warn (:427-431) y SOLO aborta con `if (enProd && process.env.REQUIRE_DB === "1") { ...; process.exit(1); }` (:432-434). Sin REQUIRE_DB=1 el arranque continúa sobre JSON efímero. Además backend/data-store.js:158-166 ya detecta DATABASE_URL presente con conexión fallida (`dbConnectFailed`), pero server.js no usa ese flag para abortar.
- **Evidencia actual (HEAD):** arranque valida persistencia (aborta si DATABASE_URL falla o se exige BD) y los tests nunca tocan la BD real.
- **Prueba y resultado:** tests/aislamiento-db.unit.js · PASA

### datos.9 · parcial · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** backend/data-store.js:289-298: tras ejecutar fn, muta la caché en el bucle (:291-296) y luego `if (!usingDb) tocadas.forEach((name) => writeFile(name, cache[name]));` (:298). Si writeFile (no atómico, :150) falla en el 2.º de varios ficheros, el primero ya quedó escrito y la caché ya mutada, sin rollback a disco.
- **Evidencia actual (HEAD):** writeFile es atómico por fichero; atomicidad MULTI-fichero en JSON es best-effort (Postgres da la real).
- **Prueba y resultado:** verificado por lectura

### datos.10 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** backend/data-store.js:301-304 `function nextId(prefix, name) { const items = readAll(name); const n = items.length + 1; return `${prefix}-${String(n).padStart(3, "0")}-${Date.now().toString().slice(-5)}`; }`. La parte numérica depende de length, así que tras un remove() (que hace splice, :262) el siguiente insert reutiliza el mismo `n`; y en inserciones del mismo ms (p. ej. los bucles de datos.1/datos.2) colisiona el id completo porque el sufijo Date.now() es idéntico.
- **Evidencia actual (HEAD):** nextId no reutiliza ids tras borrados.
- **Prueba y resultado:** tests/durabilidad.unit.js · PASA

### motor-fechas.1 · corregido+probado · [bloque 05/11] · commit fb1bd8a

- **Evidencia histórica (defecto original):** backend/routes/analisis-mes.js:33-35 guarda el NETO del CSV como cierre: `const id = "ventas_mes_"+snap.mes; ... store.update("config", id, { valor: snap.neto })` (snap.neto = suma de columna Base, p.ej. analisis-mes.unit.js: `s.neto===150`). Luego backend/cuenta-resultados.js:135-139 lo relee como bruto: `const guardado = config.find(c=>c.id===`ventas_mes_${R.etiqueta}`); ... ventasBruto = ovGuardado; ... const ventas = ... : eur(ventasBruto / (1 + IVA_VENTA));` → divide por 1,10 un valor que ya es neto = doble IVA.
- **Evidencia actual (HEAD):** routes/analisis-mes.js guarda snap.total (BRUTO) en ventas_mes_*; cuenta-resultados lo netea UNA vez.
- **Prueba y resultado:** tests/doble-iva.unit.js (1000, no 909) · PASA

### motor-fechas.2 · corregido+probado · [bloque 05/11] · commit fb1bd8a

- **Evidencia histórica (defecto original):** backend/analisis-mes.js:136-138 (agregarDesdeVentas, vía conector): `const cant = Number(v.cantidad)||0, imp = Number(v.importe)||0; ... d.uds += cant; d.neto += imp; d.total += imp * (1 + IVA_HOSTELERIA);` — usa v.importe (bruto; cf. pyl-neto.unit.js fixtures `importe:11, importe_neto:10`) como `neto`, ignorando v.importe_neto, y calcula `total = bruto*1,10` (IVA duplicado).
- **Evidencia actual (HEAD):** analisis-mes: neto=base, total=bruto; ya no se etiqueta bruto como neto en el cierre.
- **Prueba y resultado:** tests/doble-iva.unit.js · PASA

### motor-fechas.3 · corregido+probado · [bloque 06/C6] · commit 7e6f232

- **Evidencia histórica (defecto original):** backend/periods.js calcula fronteras con aritmética nativa de Date (`setHours`, `new Date(y,m,1)`), que depende del TZ del proceso; antes server.js usaba `process.env.TZ || "Europe/Madrid"`, que CONSERVABA el UTC heredado de Render.
- **Comportamiento anterior:** arrancando en UTC, las fronteras de día/mes caían en medianoche UTC; una venta de las 00:30 de Madrid caía en el día anterior.
- **Implementación actual (HEAD):** backend/tz-init.js impone Europe/Madrid de forma INCONDICIONAL (override solo con CONTROL_M_TZ, no con el TZ genérico); server.js lo requiere lo primero. Documenta el contrato: el TZ del proceso resuelve la aritmética nativa (con DST del sistema); tz.js (Intl + timeZone explícito) resuelve el formateo/agrupación independiente del TZ.
- **Prueba específica:** tests/motor-fechas.unit.js (arranca en UTC, tz-init fuerza Madrid; 00:30 de Madrid pertenece al día de Madrid; semana empieza lunes).
- **Resultado:** PASA. (También tests/periodos-stock.unit.js.)

### motor-fechas.4 · corregido+probado · [bloque 06/C6] · commit 7e6f232

- **Evidencia histórica (defecto original):** backend/periods.js `comparativoAnterior`: `len` (tramo del mes en curso) sumado al día 1 del mes anterior (más corto) desbordaba su fin de mes; y 29-feb en año bisiesto no tenía correspondencia en el año anterior.
- **Comportamiento anterior:** el comparativo de un mes en curso el día 31 invadía el mes siguiente.
- **Implementación actual (HEAD):** periods.comparativoAnterior capa el tramo (`Math.min(desde+len, addMonths(desde,1))`); tramoHastaMismoDia capa el día al último del mes destino (29-feb → 28 el año anterior).
- **Prueba específica:** tests/motor-fechas.unit.js (31-mar no desborda a marzo; 29-feb bisiesto se capa a 28 sin reventar) + tests/periodos-stock.unit.js.
- **Resultado:** PASA.

### motor-fechas.5 · corregido+probado · [bloque 06/C6] · commit 7e6f232

- **Evidencia histórica (defecto original):** periods.comparativoAnioAnterior reconstruía por hora-pared local, perdía minutos/segundos y en los cambios de horario (29-mar/25-oct) derivaba 1 h.
- **Comportamiento anterior:** deriva de 1 h en los comparativos interanuales por el DST.
- **Implementación actual (HEAD):** comparativoAnioAnterior alineado al DÍA (sin hora), así el cambio de horario no mete deriva; con el TZ de Madrid forzado (C6) los días de DST duran 23 h/25 h correctamente.
- **Prueba específica:** tests/motor-fechas.unit.js (29-mar dura 23 h, 25-oct dura 25 h) + tests/periodos-stock.unit.js.
- **Resultado:** PASA.

### motor-fechas.6 · corregido+probado · [bloque 06/C6] · commit 7e6f232

- **Evidencia histórica (defecto original):** cuenta-resultados.js y executive-dashboard.js proyectaban el mes de forma lineal (`factor = diasMes / diasTranscurridos`) sin suavizado, mínimo de días ni banda de confianza: en el día 1 el factor es ~30×, muy volátil.
- **Comportamiento anterior:** la proyección del día 1-2 se presentaba como un número cerrado pese a oscilar enormemente.
- **Implementación actual (HEAD):** cuenta-resultados.js añade `MIN_DIAS_PROYECCION=3`: la proyección marca `fiable` (false por debajo del mínimo) y una banda de confianza `banda_pct` + `ingresos_min`/`ingresos_max` que se estrecha con los días (~1/√días). executive-dashboard expone `proyeccion_mes_fiable`/`proyeccion_mes_dias`. No se oculta el número (sigue siendo útil), pero deja de presentarse como cerrado cuando aún no lo es.
- **Prueba específica:** tests/motor-fechas.unit.js (día 1 → fiable:false + banda ancha; día 15 → fiable:true + banda más estrecha).
- **Resultado:** PASA.

### agora.1 · corregido+probado · [bloque 04/C1] · commit 61e0070

- **Evidencia histórica (defecto original):** limpiarDuplicados borraba inferiores por coincidencia de FIRMA (productos+cantidades+importe), sin hora ni vínculo documental → podía borrar ventas reales idénticas.
- **Comportamiento anterior:** la coincidencia 1:1 por CONTENIDO bastaba para eliminar; dos ventas legítimas idénticas se fusionaban.
- **Implementación actual (HEAD):** conciliacion-ventas.js exige RELACIÓN DOCUMENTAL explícita (`tieneVinculo`: la factura superviviente referencia serie+número del albarán vía `origen`/`origen_claves`/`albaranes`). `clasificarGrupo` devuelve {survivors, vinculados, candidatos}: solo se borran los `vinculados`; los `candidatos` (coinciden en contenido pero SIN vínculo) se señalan y NO se tocan.
- **Prueba específica:** tests/conciliacion-ventas.unit.js ("NO borra ventas legítimas idénticas sin VÍNCULO (una facturada, otra en albarán)" y "SÍ deduplica cuando la factura REFERENCIA al albarán").
- **Resultado:** PASA.

### agora.2 · parcial · [bloque 04] · commit 02d0101

- **Evidencia histórica (defecto original):** backend/agora.js:214-216 `const bizKey = (s, n, f) => ... return "${s}|${num}|${f.slice(0,10)}"` (solo Serie+Número+día) y :243-244 `const bk = bizKey(serie, number, fecha); if (serie != null && number != null && ventasBiz.has(bk))`. No hay ningún campo que vincule el número de albarán con el de su factura; dos documentos con números distintos no se cruzan en la ingesta.
- **Evidencia actual (HEAD):** albarán+factura con números distintos se SEÑALA en la conciliación (no se fusiona a ciegas).
- **Prueba y resultado:** tests/cuadre-agora.unit.js (aviso doble conteo) · PASA

### agora.3 · corregido+probado · [bloque 04/C3] · commit 61e0070

- **Evidencia histórica (defecto original):** importarVentas (vías manual/email/CSV) hacía `ventas.push(...)` sin dedupe; el cron reimportaba el mismo CSV cada hora.
- **Comportamiento anterior:** la idempotencia por hash del cron no cubría las vías manual/email ni los CSV con días solapados.
- **Implementación actual (HEAD):** importarVentas es idempotente por FUENTE+DÍA: reemplaza-por-origen con reversión de stock neutra (revierte lo reemplazado y aplica lo nuevo), sin deduplicar ventas legítimas por contenido; no pisa ventas de otra fuente; solapamiento parcial solo reemplaza los días comunes. El cron conserva su idempotencia por hash.
- **Prueba específica:** tests/agora-cron-idempotente.unit.js (reimportar mismo CSV no duplica; no pisa otra fuente; solapamiento parcial; stock neutro).
- **Resultado:** PASA.

### agora.4 · corregido+probado · [bloque 04/C3] · commit 61e0070

- **Evidencia histórica (defecto original):** la clave de negocio sin TIPO podía descartar documentos DISTINTOS que compartían Serie+Número+día; un aviso posterior no recupera una venta descartada.
- **Comportamiento anterior:** `if (ventasBiz.has(bk)) { deduplicados.push(...); return; }` → descartaba la fila sin importar el tipo, con riesgo de pérdida.
- **Implementación actual (HEAD):** ya NO se descarta. `const posibleDup = (serie!=null && number!=null && ventasBiz.has(bk)); if (posibleDup) posiblesDuplicados.push(...)`; la venta se importa igual, etiquetada `posible_duplicado: bk`, conservando identidad y trazabilidad de origen. La conciliación la revisa con vínculo documental; nunca se pierde una venta en silencio.
- **Prueba específica:** tests/agora-cuadre.unit.js + conciliacion-ventas (ninguna venta se pierde; se marca para revisión).
- **Resultado:** PASA.

### agora.5 · parcial+probado · [bloque 04/C4] · commit 44e5df4

- **Evidencia histórica (defecto original):** la resolución de línea no trataba descuentos/invitaciones/cortesías; anulaciones/devoluciones solo "neteaban" sin dejar rastro.
- **Comportamiento anterior:** anulaciones, invitaciones y devoluciones se mezclaban en el total sin separarse; el descuento global de documento no se contemplaba.
- **Implementación actual (HEAD):** cada línea se clasifica (`naturaleza`: venta|invitacion|devolucion) y se cuenta aparte en el resumen (invitaciones/unidades_invitadas/devoluciones/importe_devuelto); los documentos anulados se omiten (esAnulado). El descuento GLOBAL de documento se SEÑALA (descuentos_globales/importe_descuento_global/descuento_global_pendiente) pero NO se reparte por línea sin una muestra real de Ágora.
- **Prueba específica:** tests/agora-cuadre.unit.js (devoluciones e invitaciones contadas aparte + naturaleza; invitación descuenta stock; descuento global señalado y marcado pendiente).
- **Resultado:** PASA. **PENDIENTE (externo):** el reparto exacto del descuento GLOBAL por línea requiere una muestra real de documentos de Ágora → por eso el hallazgo figura `parcial+probado`, no `corregido`.

### agora.6 · no_confirmado · [bloque 11]

- **Evidencia histórica (defecto original):** backend/agora.js:189 `const procesadosPrev = new Set(docsAgora.filter(d => d.status==="processed").map(d => d.id))` y :218-219 `const ventasBiz = new Set(); ventas.forEach(...)` se construyen de la caché en memoria. backend/data-store.js:168-183 (init) hidrata la caché UNA vez al arrancar; readAll (:226-229) devuelve la caché, nunca re-lee la BD en runtime. backend/db.js:48-54 `CREATE TABLE ... id TEXT PRIMARY KEY` — no hay UNIQUE sobre doc_clave ni sobre Serie+Número (grep unique/constraint sin coincidencias); la fila de venta usa un id aleatorio (nextId).
- **Evidencia actual (HEAD):** En una instancia importarDocs es síncrono → seguro. Multi-réplica requiere restricción única en BD (decisión de despliegue).
- **Prueba y resultado:** n/a (requiere despliegue multi-réplica)

### agora.7 · parcial+probado · [bloque 11/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** limpiarDuplicados hacía `if (!key) return` → EXCLUÍA de la conciliación fina las ventas heredadas sin doc_clave.
- **Comportamiento anterior:** una venta heredada sin documento quedaba fuera del cuadre fino (aunque conciliacionDia la sumaba en los totales).
- **Implementación actual (HEAD):** limpiarDuplicados ya NO las salta: cada heredada entra con una clave sintética `(sin doc) <id>` y participa en la agrupación por firma. Como no tiene documento, NUNCA puede tener vínculo → siempre cae en `candidatos` (se SEÑALA, jamás se borra sola). Así deja de quedar fuera del cuadre fino sin arriesgar el borrado de una venta legítima.
- **Prueba específica:** tests/conciliacion-ventas.unit.js ("una venta HEREDADA sin doc_clave entra como candidato, NO se borra").
- **Resultado:** PASA. Residual INHERENTE (por diseño agora.1): una venta sin documento no se puede deduplicar automáticamente; se marca para revisión manual (+ migracion-ventas-dup.js para duplicados heredados en meses con consumo). Por eso `parcial+probado`, no `corregido`.

### frontend.1 · corregido · [bloque 09] · commit 2607c60

- **Evidencia histórica (defecto original):** frontend/index.html:1561-1564 — la regla que efectivamente gana (con !important) es `.btn-primary, .btn-warn { background: var(--olive) !important; ... color: #23281E !important; }`. --olive = #45443D (:45). Contraste #23281E sobre #45443D ≈ 1.54:1.
- **Evidencia actual (HEAD):** index.html: botón primario crema sobre olive (≈7:1); antes #23281E sobre olive (≈1,5:1).
- **Prueba y resultado:** e2e pinta sin errores; sin aserción de contraste

### frontend.2 · parcial+probado · [bloque 09] · commit 2607c60

- **Evidencia histórica (defecto original):** Siguen como div/span con onclick SIN role/tabindex: frontend/index.html:7016 `<div class="apstep..." onclick="toggleApertura(...)">` (checklist de apertura APPCC), :12609 `<div class="cja-cal-d..." ... onclick="cjaAbrir('${c.id}')">`, :12653 `<div onclick="toggleAlb('${listId}')" style="cursor:pointer...">`, :13208 `<span class="alerg-chip..." ... onclick="this.classList.toggle('on')">`. Mitigación presente: delegación global de teclado en :2271-2276 (Enter/Espacio sobre `[role="button"]`) + role=button/tabindex en logo (:2163, con onkeydown propio), tarjeta de lote (:8769) y de materia (:8934).
- **Evidencia actual (HEAD):** index.html: :focus-visible + prefers-reduced-motion. Falta rol/aria en todos los flujos.
- **Prueba y resultado:** e2e; parcial

### frontend.3 · corregido · [bloque 09] · commit 2607c60

- **Evidencia histórica (defecto original):** frontend/index.html:2563-2581 función api(): `const r = await fetch(API + path, ...)` sin try/catch alrededor; el fallo de red lanza TypeError nativo ('Failed to fetch') que no se traduce. grep de 'navigator.onLine' y de UI 'offline/sin conexión' en todo el fichero: sin resultados (solo aparecen 'conexión' de Bluetooth/impresora y de Ágora).
- **Evidencia actual (HEAD):** api(): errores de red en español, avisa de que NO se guardó, sin reintento automático.
- **Prueba y resultado:** verificado por lectura

### frontend.4 · corregido · [bloque 02] · commit 389dfcf

- **Evidencia histórica (defecto original):** Pintan ${e.message} SIN esc(): frontend/index.html:2885,2919,2939,3000,3042 `setInner(`<div class="err">${e.message}</div>`)`; :3920,4052,4102,6793,6804,6879,6916,6959,6974,6995 igual. Frente a los que SÍ escapan: :3121 `${esc(e.message)}`, :3851 `${esc(e.message)}`, :5294 `${esc(e.message||String(e))}`.
- **Evidencia actual (HEAD):** esc() en los 58 sinks de error ${e.message}.
- **Prueba y resultado:** verificado por lectura (patrón único)

### frontend.5 · corregido · [bloque 09/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** `.lab-estado` pintaba texto casi negro (#1a1f16) sobre fondos de estado; 'Aprobado' (olivo ~1.7:1) y 'En carta' (azul ~2.5:1) quedaban muy por debajo de 4.5:1 (AA).
- **Comportamiento anterior:** badges de estado con contraste insuficiente.
- **Implementación actual (HEAD):** el texto del badge es BLANCO (#fff) y los fondos se oscurecieron donde hacía falta: prueba #8a5a12 (5.9:1), aprobado var(--olive)=#45443D (9.8:1), carta #3f6079 (6.6:1), archivado #5c5a52 (6.9:1). Los cuatro ≥4.5:1.
- **Prueba y resultado:** contrastes WCAG calculados (fórmula de luminancia relativa) para los cuatro pares + e2e en verde (sin pageerror). Sin test unitario dedicado (el color vive en una const del HTML).

### frontend.6 · corregido · [bloque 09/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** `.topbar-inicio`/`.topbar-aj` ~30px y `.topbar-back` ~20px, por debajo del mínimo táctil 44x44px.
- **Comportamiento anterior:** objetivos táctiles pequeños en una app móvil-primero.
- **Implementación actual (HEAD):** los tres controles llevan `min-height:44px` (y `min-width:44px` el botón atrás) con `display:inline-flex; align-items:center` para ampliar el área sin cambiar el aspecto visual.
- **Prueba y resultado:** verificado por lectura del CSS + e2e en verde.

### frontend.7 · diferido · [bloque 09]

- **Evidencia histórica (defecto original):** ~476 hex inline frente a ~20 tokens de :root (deriva de color / mantenibilidad).
- **Decisión (diferido, justificada):** es mantenibilidad pura (bajo). Hay VARIOS bloques :root (temas claro/oscuro) donde un mismo token cambia de valor según el tema; por eso sustituir a ciegas un hex inline por `var(--x)` NO es un no-op: puede alterar el color en modo oscuro. Una migración masiva de 476 hexes requiere revisión VISUAL por ocurrencia y en ambos temas (un riesgo real sobre la identidad visual que Mónica usa a diario), que ni los tests unitarios ni los e2e detectan. Se difiere a una revisión visual dedicada, no se hace a ciegas.

### frontend.8 · corregido · [bloque 09/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** `labPanel()` definido y nunca invocado; su CSS `.lab-panel`/`.lab-wrap`/`.lab-title`/`.lab-rule`/`.lab-list`/`.lab-arrow` solo se usaba dentro de esa función.
- **Comportamiento anterior:** código muerto en el fichero.
- **Implementación actual (HEAD):** se eliminó `labPanel()` y su CSS exclusivo (se conservan `.lab-mark`/`.lab-eyebrow`/`.lab-foot`, que sí se usan en otros sitios).
- **Prueba y resultado:** verificado por grep (0 usos restantes de las clases retiradas) + e2e en verde.

### frontend.9 · corregido+probado · [bloque 10] · commit 42288d9

- **Evidencia histórica (defecto original):** `wc -l frontend/index.html` = 13852 líneas. Sin configuración de linter: no hay .eslintrc*/eslint.config*/.prettierrc*/.stylelintrc*/biome.json; package.json no tiene script 'lint' ni eslint/prettier en devDependencies (solo @playwright/test); node_modules/.bin no contiene binarios de lint.
- **Evidencia actual (HEAD):** scripts/lint.js detecta sintaxis y funciones duplicadas (frontend incluido).
- **Prueba y resultado:** scripts/lint.js · PASA

### frontend.10 · corregido · [bloque 09] · commit 2607c60

- **Evidencia histórica (defecto original):** frontend/index.html:1369 `.apstep.done .apstep-check { background: var(--ink); border-color: var(--ink); color: var(--ink); }`. El contenido del span es el ✓: :7017 `<span class="apstep-check">${done?'✓':''}</span>`. Con el paso 'done', el ✓ queda var(--ink) sobre fondo var(--ink) = invisible.
- **Evidencia actual (HEAD):** index.html:1369 .apstep.done .apstep-check color crema (antes --ink sobre --ink).
- **Prueba y resultado:** verificado por lectura

### frontend.11 · corregido · [bloque 09] · commit 2607c60

- **Evidencia histórica (defecto original):** frontend/index.html:355-357 `.btn-primary { background: var(--ink); color: var(--ink); border: none; ... }` — color idéntico al fondo (ambos var(--ink) = #1B1B16, :44).
- **Evidencia actual (HEAD):** index.html .btn-primary base color crema (antes var(--ink) sobre var(--ink)).
- **Prueba y resultado:** verificado por lectura

### pwa.1 · corregido+probado · [bloque 07] · commit 593ee6e

- **Evidencia histórica (defecto original):** backend/sv-timers.js:60-64 init(): `const vivos = leer().filter((t) => t.fireAt > now); guardar(vivos); vivos.forEach(agendar);` — al arrancar DESCARTA los ya vencidos (no los dispara). El disparo vive en un setTimeout (línea 37: `const to = setTimeout(() => disparar(t), Math.min(ms, 2147483000));`), que muere con el proceso. /avisos/cron (backend/server.js:214) solo despierta para el resumen diario (avisos.cronTick), no reprocesa temporizadores.
- **Evidencia actual (HEAD):** sv-timers.init() dispara los vencidos como aviso ATRASADO (no los descarta).
- **Prueba y resultado:** tests/sv-timers.unit.js · PASA

### pwa.2 · corregido+probado · [bloque 07] · commit 593ee6e

- **Evidencia histórica (defecto original):** backend/push.js:80 `await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data);` — se llama SIN tercer argumento de opciones. La librería web-push aplica por defecto TTL=2419200 s (4 semanas) y no envía cabecera Urgency (el servicio push la trata como 'normal'). No hay ningún `TTL`/`urgency`/`headers` en backend/ (grep sin resultados relevantes).
- **Evidencia actual (HEAD):** push.enviarATodos acepta TTL/urgency; el 'retira' sale urgente y con TTL 1h.
- **Prueba y resultado:** tests/sv-timers.unit.js (urgency high, ttl 3600) · PASA

### pwa.3 · diferido · [bloque 07]

- **Evidencia histórica (defecto original):** backend/push.js:21-35: cuando no hay VAPID_PUBLIC_KEY/PRIVATE_KEY ni doc 'vapid' guardado, `const g = webpush.generateVAPIDKeys();` genera claves nuevas; se añadió `console.warn("Push: generadas claves VAPID nuevas...")` (líneas 31-34). En frontend/index.html:4913 `if(await reg.pushManager.getSubscription()) return;` — si el navegador conserva su suscripción (firmada con la clave vieja) corta y NO re-suscribe, así que tras regenerar la clave el cliente nunca se recupera.
- **Evidencia actual (HEAD):** VAPID/suscripciones persistentes requieren almacenamiento durable (Postgres).
- **Prueba y resultado:** n/a (atado a BD)

### pwa.4 · corregido · [bloque 09] · commit 2607c60

- **Evidencia histórica (defecto original):** frontend/sw.js:13 `self.addEventListener("fetch", () => {});` — handler fetch vacío (passthrough puro). El comentario (líneas 8-12) declara explícitamente 'NO cachea nada'. No hay uso de caches/Cache API ni precache en sw.js ni en el proyecto (grep de 'precache'/'caches' sin resultados).
- **Evidencia actual (HEAD):** sw.js: app-shell con red-primero + respaldo offline; /api nunca se cachea.
- **Prueba y resultado:** e2e pinta con el SW activo; sin test offline automatizado

### pwa.5 · corregido · [bloque 07/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** el aviso local (svtAlarma, `new Notification`) y el push del servidor (SW `showNotification`) usaban tags distintos → dos notificaciones en primer plano; el handler push no comprobaba clientes enfocados.
- **Comportamiento anterior:** notificación de sous-vide duplicada con la app abierta.
- **Implementación actual (HEAD):** el push del servidor lleva `kind:"sv"` (backend/sv-timers.js); el handler push del SW (frontend/sw.js), si hay un cliente ENFOCADO (visible), NO muestra la notificación del sistema para 'sv' (la app ya la muestra) y le avisa por postMessage; si la app está en 2º plano/cerrada, sí la muestra.
- **Prueba y resultado:** verificado por lectura de sw.js + sv-timers.js; e2e en verde (el SW se registra sin errores). El solapamiento exacto solo se observa en dispositivo, pero la lógica de deduplicación por cliente enfocado es correcta.

### pwa.6 · corregido · [bloque 07/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** svtStart asigna `t.pushId` de forma asíncrona; si svtStop se ejecutaba antes de recibir el id, no se enviaba el DELETE y el aviso del servidor quedaba vivo.
- **Comportamiento anterior:** parar un temporizador en los instantes previos a recibir su id dejaba vivo el push 'retira'.
- **Implementación actual (HEAD):** svtStop marca `t.cancelado = true` (aunque el id aún no haya llegado); cuando el POST resuelve, si `t.cancelado` ya está, se envía el DELETE inmediatamente. No queda aviso espurio.
- **Prueba y resultado:** verificado por lectura (frontend/index.html svtStart/svtStop); e2e en verde. Sin test unitario dedicado (la carrera async vive en el HTML).

### pwa.7 · corregido · [bloque 07] · commit 593ee6e

- **Evidencia histórica (defecto original):** frontend/manifest.webmanifest (completo, 17 líneas): claves presentes name, short_name, description, start_url, scope, display, orientation, background_color, theme_color, lang, icons. NO existe la clave "id".
- **Evidencia actual (HEAD):** manifest.webmanifest: campo 'id'.
- **Prueba y resultado:** verificado por lectura

### rendimiento.1 · corregido+probado · [bloque 08] · commit 6c6d2fc

- **Evidencia histórica (defecto original):** backend/agora.js:316 `store.writeAll("ventas", ventas);` (y :315 materias) en CADA importarDocs → data-store.js:221 `if (usingDb) return encolar(name, () => db.replaceAll(name, cache[name]));` → db.js:112-120 `replaceAll` hace `await client.query(`DELETE FROM ${t}`);` seguido de un bucle de INSERT. También ventas-export.js:86-87 `store.writeAll("ventas", ...)` al reemplazar meses. En modo JSON equivale a reescribir el fichero entero (data-store.js:211/150).
- **Evidencia actual (HEAD):** insertMany: la sync ya no reescribe toda la tabla de ventas (no DELETE+INSERT de todo).
- **Prueba y resultado:** tests/incremental-ventas.unit.js · PASA

### rendimiento.2 · corregido · [bloque 08/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** backend/routes/dashboard.js servía `dashboard.calcular({now})` sin caché, recorriendo el array de ventas decenas de veces por llamada.
- **Comportamiento anterior:** recomputación completa en cada petición/refresco.
- **Implementación actual (HEAD):** caché de respuesta de CORTA duración (20 s) por proceso para /api/dashboard (solo admin → una sola entrada, sin rol), con `?fresh=1` para forzar recálculo y `Cache-Control: private, max-age=20`. Evita recomputar en refrescos seguidos sin servir datos rancios.
- **Prueba y resultado:** verificado por lectura + e2e en verde (la portada sigue cargando). (La memoización por pasada de costeProducto —rendimiento.5— ya reduce el coste interno.)

### rendimiento.3 · parcial · [bloque 08]

- **Evidencia histórica (defecto original):** toda la BD se hidrata en memoria (data-store.init) y la selección por fecha se hace recorriendo arrays en JS; db.js no expone consultas con WHERE por fecha ni índices.
- **Mitigaciones locales aplicadas (HEAD):** escrituras incrementales (insertMany, datos.5/rendimiento.1), caché del dashboard (rendimiento.2), archivado de movimientos antiguos (rendimiento.7) y filtro por fecha opcional en GET /api/ventas (rendimiento.6). Reducen el impacto de memoria/recorridos.
- **Pendiente (decisión de escalado):** el "pushdown" real a SQL (SELECT ... WHERE fecha BETWEEN ... con índice) y la hidratación PARCIAL de la caché son un cambio arquitectónico cuyo beneficio y techo solo se justifican/miden con volumen de PRODUCCIÓN (1-2 años de ventas). Se deja como decisión de escalado, no como tarea aplazada por prioridad.

### rendimiento.4 · corregido+probado · [bloque 08/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** no había compresión a nivel de app; el index.html (~950 KB) viajaba sin gzip.
- **Comportamiento anterior:** sin gzip/deflate; mucho ancho de banda en móvil.
- **Implementación actual (HEAD):** backend/compresion.js (zlib del core, SIN dependencias nuevas) comprime las respuestas de texto grandes (HTML + JSON) cuando el cliente acepta gzip; decide en la primera escritura, quita Content-Length y marca Content-Encoding+Vary. El SW ya cachea el app-shell (pwa.4).
- **Prueba específica:** tests/integracion-http.unit.js — pide el HTML con Accept-Encoding: gzip, comprueba Content-Encoding: gzip + Vary, descomprime con zlib y verifica que recupera el original byte a byte; el JSON de API se comprime y descomprime igual.
- **Resultado:** PASA.

### rendimiento.5 · corregido+probado · [bloque 08] · commit 2314e59

- **Evidencia histórica (defecto original):** backend/analisis-diario.js:55 `const cu = p ? costing.costeProducto(p, idxMat) : 0;` dentro de `lineas.forEach` (:50). backend/costing.js:74-78 costeProducto → costeEscandallo (:51-57) → costeMateriaEfectivo (:29-47, recursivo con guardia anti-ciclos). No hay memo/caché por producto en costing.js.
- **Evidencia actual (HEAD):** costing.costeProducto memoizado por pasada (WeakMap sobre idxMat), resultado idéntico.
- **Prueba y resultado:** tests/rendimiento.unit.js · PASA

### rendimiento.6 · corregido · [bloque 08/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** GET /api/ventas devolvía el array completo invertido, sin límite/offset ni paginación.
- **Comportamiento anterior:** todas las ventas en cada petición; coste lineal con el histórico.
- **Implementación actual (HEAD):** GET /api/ventas admite `?limit&offset` y filtro `?desde&hasta` (YYYY-MM-DD) OPCIONALES. Sin parámetros mantiene el comportamiento de siempre (array completo) para no romper el front; con `?limit` devuelve `{total, offset, limit, ventas}`.
- **Prueba y resultado:** verificado por lectura (default intacto; paginación acotada a [1,2000]). Compatible con el front actual.

### rendimiento.7 · corregido+probado · [bloque 08/C8] · commit 3658fd8

- **Evidencia histórica (defecto original):** stock_movements se hidrata entero en memoria y crece sin límite (1+ movimiento por ingrediente por línea de venta); no había política de retención/archivado.
- **Comportamiento anterior:** la tabla más grande crecía indefinidamente en memoria.
- **Implementación actual (HEAD):** backend/retencion.js (`particionar`, `archivarMovimientos`) + scripts/archivar-movimientos.js archivan a FICHEROS en disco los movimientos > N meses (18 por defecto) y recortan la tabla viva SIN perder datos (los sin fecha se conservan; nada se borra hasta haber escrito el fichero de archivo). Bajo demanda/cron; conservador.
- **Prueba específica:** tests/retencion-movimientos.unit.js (separa antiguos/recientes; conserva sin-fecha; archiva a disco y recorta con cero pérdida de datos).
- **Resultado:** PASA.

### rendimiento.8 · parcial · [bloque 08] · commit 6c6d2fc

- **Evidencia histórica (defecto original):** en modo JSON, insert/update reescriben el array entero del fichero (fs.writeFileSync completo y síncrono).
- **Mitigación aplicada (HEAD):** la ingesta usa insertMany (una sola escritura por LOTE, datos.5), que evita reescribir por cada fila.
- **Inherente / fuera de alcance local:** un array en un único fichero JSON no admite escritura por FILA; reescribir el fichero es intrínseco a ese backend. En PRODUCCIÓN con DATABASE_URL NO aplica (db.upsert escribe por fila). El único escenario afectado es un despliegue SIN Postgres, que es precisamente la decisión de infraestructura (usar Postgres) ya recomendada en el runbook. No hay más que hacer en local sin cambiar el backend de almacenamiento.

### tests.1 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** backend/data-store.js:199 `const next = prev.then(op).catch((e) => console.error("Error guardando '"+name+"':", e.message));` (la cola traga el error) y :205 `return Promise.allSettled(Object.values(colas));` (flush nunca rechaza). La ruta de dinero (TPV/Ágora) escribe por esta vía: backend/server.js:254 `await store.flush();` seguido de :255 `res.json(r);` → confirma éxito aunque el upsert de PostgreSQL haya fallado. backend/tpv-connector.js y backend/agora.js:314-316 usan store.insert/update/writeAll (persistUpsert/persistAll → encolar), no transaction().
- **Evidencia actual (HEAD):** flush propaga el fallo (no éxito en falso en Postgres).
- **Prueba y resultado:** tests/durabilidad.unit.js · PASA

### tests.2 · corregido+probado · [bloque 03] · commit f89a8cc

- **Evidencia histórica (defecto original):** grep repo-wide (backend/**, scripts/**) de `process.on|uncaughtException|unhandledRejection|SIGTERM|SIGINT|beforeExit` → sin resultados. backend/server.js solo tiene el .catch del arranque: :548 `.catch((e) => {` … :550 `process.exit(1);` que cubre únicamente el fallo de store.init(). No hay handler de proceso ni cierre ordenado.
- **Evidencia actual (HEAD):** process-guards: rejection no mata, excepción termina ordenado.
- **Prueba y resultado:** tests/process-guards.unit.js · PASA

### tests.3 · corregido+probado · [bloque 01] · commit 9a6784e

- **Evidencia histórica (defecto original):** scripts/test-unit.js:38 `const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-unit-"));` + :39 `env = { ...process.env, CONTROL_M_DATA_DIR: dataDir }` + :52-54 `finally { ... fs.rmSync(dataDir, { recursive: true, force: true }); }`. playwright.config.js:13 `const E2E_DATA_DIR = process.env.CONTROL_M_DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "cm-e2e-"));` + :32 `env: { PORT: String(PORT), CONTROL_M_DATA_DIR: E2E_DATA_DIR }`. data-store.js:26-32 resolveDataDir y :139-143 siembra transparente desde SEED_DIR cuando falta el fichero runtime, sin mutar los fixtures.
- **Evidencia actual (HEAD):** runner con DATA_DIR aislado; además la BD real nunca se toca.
- **Prueba y resultado:** tests/aislamiento-db.unit.js + fixtures intactos · PASA

### tests.4 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** backend/server.js: tras montar todas las rutas /api (hasta :400) y el estático (:406-423) el fichero pasa directo a `store.init()` (:426); no existe ningún `app.use((err, req, res, next) => …)` ni un 404 catch-all de /api. grep de `app.use((err` y `app.use((req, res, next` → sin resultados. Cada handler async se apoya en su propio try/catch; un throw async no capturado no lo recoge Express 4 (ligado también a tests.2).
- **Evidencia actual (HEAD):** 404 JSON de /api + manejador de errores sin fuga de stack.
- **Prueba y resultado:** tests/integracion-http.unit.js (404 JSON en vivo) · PASA

### tests.5 · corregido+probado · [bloque 10] · commit 42288d9

- **Evidencia histórica (defecto original):** scripts/test-unit.js:17-35 define `const FILES = [ ... ].map((n) => "tests/"+n+".unit.js")` y :43-51 un bucle `for (const file of FILES) { ... spawnSync(process.execPath, [file], ...); if (r.status !== 0) { failed = file; break; } }`. La cadena `&&` de package.json ya no existe (package.json:10 `"test": "npm run test:unit && npm run test:e2e"`). package.json:14-16 devDependencies = solo `@playwright/test`; grep de lint/coverage/nyc/c8 → sin resultados.
- **Evidencia actual (HEAD):** runner con auto-registro: falla si un tests/*.unit.js no está en la lista.
- **Prueba y resultado:** scripts/test-unit.js · PASA

### tests.6 · corregido+probado · [bloque 10] · commit 42288d9

- **Evidencia histórica (defecto original):** find de `.eslintrc*`, `eslint.config.*`, `.prettierrc*` en la raíz → sin resultados. grep `lint|prettier|eslint|nyc|c8|coverage` en package.json y backend/package.json → 'NO lint/coverage'. .github/workflows/ci.yml no tiene paso de análisis estático (solo npm ci + playwright install + npm test).
- **Evidencia actual (HEAD):** scripts/lint.js (sintaxis + funciones duplicadas) en CI.
- **Prueba y resultado:** scripts/lint.js · PASA

### tests.7 · corregido+probado · [bloque 10] · commit 42288d9

- **Evidencia histórica (defecto original):** tests/e2e.spec.js:610 `const RUTAS = ["/api/inicio", "/api/materias", "/api/carta", "/api/recetas", "/api/mbds/ingredientes", "/api/mbds/bebidas", "/api/mermas"];` y :620 `expect(comprobadas, ...).toBeGreaterThanOrEqual(4);` → sigue siendo una lista fija con umbral de solo 4 respuestas. Mitigación en producción: backend/server.js:337 `app.use("/api", require("./economia-guard").filtrarRespuestas);` aplica el filtro a TODA respuesta /api (también futuras), y tests/economia-guard.unit.js prueba stripEconomia en profundidad.
- **Evidencia actual (HEAD):** regla nº2 sobre TODA la allowlist; una ruta de dinero nueva nace protegida.
- **Prueba y resultado:** tests/roles-regla2.unit.js (19 rutas 403) · PASA

### tests.8 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** grep de `morgan|app.use((req, res, next|requestId|x-request-id` → sin resultados; no hay middleware de logging de peticiones ni request-id. Seeds con catch vacío en backend/server.js:473 `require("./seed-cafe").seedCafe().catch(() => {});` y análogos en :475,478,479,480,481,482,492,494,496,499,501,504,506, más :488 `.then(() => { try { require("./seed-productos-facturas").aplicar(store); } catch (e) {} })`.
- **Evidencia actual (HEAD):** request-id (X-Request-Id) + seeds que ya no callan errores.
- **Prueba y resultado:** tests/integracion-http.unit.js (X-Request-Id en vivo) · PASA

### tests.9 · corregido+probado · [bloque 01] · commit 9a6784e

- **Evidencia histórica (defecto original):** .github/workflows/ci.yml: paso 'Instalar dependencias del backend (reproducible)' → `run: npm ci --prefix backend`; paso 'Instalar dependencias de test (reproducible)' → `run: npm ci`. No queda ningún `npm install` en el workflow.
- **Evidencia actual (HEAD):** CI usa npm ci (builds reproducibles).
- **Prueba y resultado:** .github/workflows/ci.yml

### tests.10 · diferido · [bloque 10]

- **Evidencia histórica (defecto original):** tests/e2e.spec.js es un único fichero (~109 `test(`) sin `test.describe` ni paralelismo; webServer compartido y estado serial.
- **Mitigación ya aplicada:** el aislamiento de DATOS por run (DATA_DIR temporal, tests.3) ya está resuelto; la suite es verde y fiable.
- **Decisión (diferido, justificada):** severidad BAJA (mantenibilidad de la suite, no un bug del producto). Trocear 109 tests serialmente dependientes de un servidor compartido es un refactor grande con RIESGO real de romper una suite que hoy pasa, a cambio de poco valor (no mejora la correctitud ni cubre más casos). Se difiere: el valor/riesgo no lo justifica frente al resto del trabajo. No depende de producción.

### tests.11 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** backend/server.js:22 `const persistente = db.isActive();` y :33 `persistencia: persistente ? "persistente" : "efimera"`. backend/db.js:131-133 `function isActive() { return pool != null; }` → solo comprueba que el objeto pool existe (creado una vez al arrancar si `SELECT 1` pasó en connect(), db.js:41), no ejecuta ninguna consulta viva en el healthcheck. No hay endpoint de readiness que verifique BD ni estado de hidratación/inicialización.
- **Evidencia actual (HEAD):** /api/listo comprueba la BD (readiness) distinto de liveness.
- **Prueba y resultado:** tests/integracion-http.unit.js (/api/listo en vivo) · PASA

