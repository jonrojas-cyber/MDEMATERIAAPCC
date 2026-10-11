# CONTROL-CORRECCIONES · Control M

**Actualizado:** 2026-10-11 (revisión de rigor) · **Rama:** claude/jolly-franklin-3j3eg4.
Matriz de los **79 hallazgos** de AUDITORIA-MILIMETRO-2026-10.md. Para cada uno se separa la **evidencia histórica** (el defecto original) de la **evidencia actual** (código del HEAD de hoy) y se indica la **prueba específica y su resultado**. Un commit o una suite en verde no cierran un hallazgo por sí solos.

**Estados:** `corregido+probado` (arreglado + prueba específica que PASA) · `corregido` (arreglado y verificado por lectura/smoke/e2e, sin test unitario dedicado) · `parcial+probado` · `parcial` · `abierto` · `diferido` (decisión consciente) · `no_confirmado` (requiere acceso/decisión de despliegue). **Prod:** todo `no-desplegado` (los informes eran contradictorios; no se despliega hasta que estén consistentes y se autorice).

## Resumen (recalculado)

| Estado | Nº |
|---|---|
| corregido+probado | 38 |
| corregido | 9 |
| parcial+probado | 4 |
| parcial | 6 |
| abierto | 19 |
| diferido | 2 |
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
| dinero.6 | medio | abierto | 05 | - |
| dinero.7 | medio | abierto | 05 | - |
| dinero.8 | bajo | corregido+probado | 05 | 4086f53 |
| dinero.9 | bajo | abierto | 05 | - |
| dinero.10 | bajo | abierto | 05 | - |
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
| datos.7 | medio | corregido+probado | 06 | 0d02b1f |
| datos.8 | alto | parcial+probado | 01 | 519e4de |
| datos.9 | medio | parcial | 03 | 065676a |
| datos.10 | alto | corregido+probado | 03 | 065676a |
| motor-fechas.1 | critico | corregido+probado | 05/11 | fb1bd8a |
| motor-fechas.2 | alto | corregido+probado | 05/11 | fb1bd8a |
| motor-fechas.3 | alto | corregido+probado | 06 | 0d02b1f |
| motor-fechas.4 | medio | corregido+probado | 06 | 0d02b1f |
| motor-fechas.5 | bajo | corregido+probado | 06 | 0d02b1f |
| motor-fechas.6 | medio | abierto | 06 | - |
| agora.1 | alto | corregido+probado | 04 | 02d0101 |
| agora.2 | alto | parcial | 04 | 02d0101 |
| agora.3 | alto | corregido+probado | 04 | 02d0101 |
| agora.4 | medio | parcial | 04 | 02d0101 |
| agora.5 | medio | corregido+probado | 04 | 6c6d2fc |
| agora.6 | alto | no_confirmado | 11 | - |
| agora.7 | medio | abierto | 11 | - |
| frontend.1 | alto | corregido | 09 | 2607c60 |
| frontend.2 | medio | parcial+probado | 09 | 2607c60 |
| frontend.3 | medio | corregido | 09 | 2607c60 |
| frontend.4 | medio | corregido | 02 | 389dfcf |
| frontend.5 | medio | abierto | 09 | - |
| frontend.6 | medio | abierto | 09 | - |
| frontend.7 | bajo | abierto | 09 | - |
| frontend.8 | bajo | abierto | 09 | - |
| frontend.9 | medio | corregido+probado | 10 | 42288d9 |
| frontend.10 | medio | corregido | 09 | 2607c60 |
| frontend.11 | medio | corregido | 09 | 2607c60 |
| pwa.1 | alto | corregido+probado | 07 | 593ee6e |
| pwa.2 | medio | corregido+probado | 07 | 593ee6e |
| pwa.3 | medio | diferido | 07 | - |
| pwa.4 | bajo | corregido | 09 | 2607c60 |
| pwa.5 | bajo | abierto | 07 | - |
| pwa.6 | medio | abierto | 07 | - |
| pwa.7 | bajo | corregido | 07 | 593ee6e |
| rendimiento.1 | alto | corregido+probado | 08 | 6c6d2fc |
| rendimiento.2 | medio | abierto | 08 | - |
| rendimiento.3 | alto | abierto | 08 | - |
| rendimiento.4 | alto | abierto | 08 | - |
| rendimiento.5 | medio | corregido+probado | 08 | 2314e59 |
| rendimiento.6 | medio | abierto | 08 | - |
| rendimiento.7 | medio | abierto | 08 | - |
| rendimiento.8 | medio | abierto | 08 | - |
| tests.1 | critico | corregido+probado | 03 | 065676a |
| tests.2 | alto | corregido+probado | 03 | f89a8cc |
| tests.3 | medio | corregido+probado | 01 | 9a6784e |
| tests.4 | alto | corregido+probado | 03 | 065676a |
| tests.5 | bajo | corregido+probado | 10 | 42288d9 |
| tests.6 | bajo | corregido+probado | 10 | 42288d9 |
| tests.7 | medio | corregido+probado | 10 | 42288d9 |
| tests.8 | medio | corregido+probado | 03 | 065676a |
| tests.9 | bajo | corregido+probado | 01 | 9a6784e |
| tests.10 | bajo | abierto | 10 | - |
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

### dinero.6 · abierto · [bloque 05]

- **Evidencia histórica (defecto original):** backend/financials.js:152 `const interesesPeriodo = eur(cuotaMensual * (dias / (365 / 12)) * 0.3); // ~30% de la cuota como interés estimado` y :159 `beneficio_neto_estimado: neto` (neto = operativo − interesesPeriodo).
- **Evidencia actual (HEAD):** financials.js:~152 sigue con interés estimado al 30% de la cuota.
- **Prueba y resultado:** —
- **Nota:** Interés hardcodeado al 30% de la cuota, sin usar calendario de amortización real ni separar principal/interés. Prompt 05 pedía usar datos reales y marcar estimaciones; sigue siendo una aproximación fija. Está etiquetado como estimado, lo que mitiga parcialmente, pero el 30% arbitrario persiste.

### dinero.7 · abierto · [bloque 05]

- **Evidencia histórica (defecto original):** backend/costing.js:119-124 `function margenMedioCarta(...) { ... const suma = items.reduce((s, x) => s + x.mm.margen_bruto, 0); return Math.round((suma / items.length) * 1000) / 1000; }` y :128-134 `foodCostMedioCarta` idéntico: `const suma = items.reduce((s, x) => s + x.mm.food_cost, 0); return Math.round((suma / items.length) * 1000) / 10;`. Son medias aritméticas por nº de productos, sin ponderar por unidades/importe vendidos. break-even.js:38 las usa como `ratio_contribucion`.
- **Evidencia actual (HEAD):** costing.js margenMedioCarta sigue siendo media no ponderada.
- **Prueba y resultado:** —
- **Nota:** No se distingue el margen de carta (no ponderado) del margen realizado ponderado por ventas que pide el prompt 05. El P&L sí tiene food cost ponderado (materia/ventas), pero estas funciones de carta/break-even siguen sin ponderar.

### dinero.8 · corregido+probado · [bloque 05] · commit 4086f53

- **Evidencia histórica (defecto original):** Constante 0.10 definida por separado en 4 módulos: backend/costing.js:81 `const IVA_DEF = 0.10;`; backend/financials.js:35 `const IVA_VENTA_DEF = 0.10;`; backend/cuenta-resultados.js:132 `const IVA_VENTA = 0.10; // hostelería`; backend/analisis-mes.js:17 `const IVA_HOSTELERIA = 0.10;`. costing.js la exporta (línea 174) pero los demás no la consumen: redefinen la suya.
- **Evidencia actual (HEAD):** backend/iva.js es la fuente única de IVA_VENTA; financials/costing/cuenta-resultados/analisis-mes la importan.
- **Prueba y resultado:** tests/motor-financiero.unit.js · PASA

### dinero.9 · abierto · [bloque 05]

- **Evidencia histórica (defecto original):** backend/cuenta-resultados.js:49 `food_cost_pct: food_cost_pct != null ? Math.round(food_cost_pct * 100) : null` (entero; existe pct1() en :15 pero NO se usa aquí). backend/financiero.js:17 `function pctDe(n, base) { return base > 0 ? Math.round((n / base) * 1000) / 10 : null; }` y :68 `food_cost_pct: materia != null ? pctDe(materia, V) : null` (1 decimal). financials.js:160 y analisis-diario.js:102 también usan entero (`Math.round(...*100)`).
- **Evidencia actual (HEAD):** redondeo de food_cost_pct todavía dispar entre pantallas.
- **Prueba y resultado:** —
- **Nota:** Divergencia de precisión real y además 'congelada' en tests (cada uno afirma su propia precisión). Impacto visual menor pero el mismo ratio se muestra con distinta precisión según la pantalla.

### dinero.10 · abierto · [bloque 05]

- **Evidencia histórica (defecto original):** Canónica en backend/costing.js:137-139 `function valorStock(materias) { return Math.round((materias || ...).reduce((s, m) => s + (Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0), 0) * 100) / 100; }`. Duplicada inline por línea en: backend/routes/reportes.js:119 `valor_stock: r2(m.disponibilidad_actual * m.coste_medio)`; backend/routes/inicio.js:140 `valor_stock_actual: Math.round(m.disponibilidad_actual * m.coste_medio * 100) / 100`; backend/routes/materias.js:54 `valor_stock_actual: Math.round((Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0) * 100) / 100`; backend/analitica.js:56 `const v = (Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0);`; backend/inventory-capital.js:25 `return (Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0);`.
- **Evidencia actual (HEAD):** valor de stock inline todavía duplica costing.valorStock en algún punto.
- **Prueba y resultado:** —
- **Nota:** Parcialmente centralizado para el AGREGADO: financials.js:115, decisiones.js:206, analitica.js:44 e inventory-capital.js:47 sí llaman a costing.valorStock. Pero la valoración POR MATERIA (disponibilidad × coste_medio) se reimplementa inline en varias rutas porque costing no exporta un helper por ítem. El prompt 06 pide 'Reutiliza costing para valor de stock' → bloque 06.

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
- **Evidencia actual (HEAD):** data-store.flush() propaga el fallo de la cola (no 200 en falso).
- **Prueba y resultado:** tests/durabilidad.unit.js (flush propaga) · PASA

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

### datos.7 · corregido+probado · [bloque 06] · commit 0d02b1f

- **Evidencia histórica (defecto original):** Consumo: backend/agora.js:288-289 `const m = idxMat[ing.materia_id]; if (!m) return;` — si el materia_id del escandallo no existe, no descuenta ni avisa. Cálculo de coste: backend/costing.js:30-31 `const m = idxMat[materiaId]; const costeDirecto = m ? Number(m.coste_medio) || 0 : 0;` — materia inexistente aporta 0 €. Sin validación al guardar: backend/routes/recetas.js:22-23 `const materia = materias.find((m) => m.id === ing.materia_id); return { ...ing, nombre: materia ? materia.nombre : ing.materia_id, ... }` usa el id como nombre en vez de rechazar.
- **Evidencia actual (HEAD):** agora.js: materia inexistente en escandallo se señala en resumen.materias_faltantes (no se traga).
- **Prueba y resultado:** tests/periodos-stock.unit.js · PASA

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

### motor-fechas.3 · corregido+probado · [bloque 06] · commit 0d02b1f

- **Evidencia histórica (defecto original):** backend/periods.js:29-47 calcula fronteras en hora del servidor: `startOfDay` `d.setHours(0,0,0,0)`, `startOfMonth` `new Date(d.getFullYear(), d.getMonth(), 1)`, `startOfYear` `new Date(d.getFullYear(), 0, 1)`, `startOfWeek` sobre startOfDay; no hay require("./tz") en el fichero. Igual en backend/cuenta-resultados.js:23-24 `const desde = new Date(y, m, 1).getTime(); const finMes = new Date(y, m + 1, 1).getTime();`.
- **Evidencia actual (HEAD):** server.js: process.env.TZ=Europe/Madrid → fronteras de día/mes en hora de Málaga (DST nativo).
- **Prueba y resultado:** tests/periodos-stock.unit.js (semana empieza lunes) · PASA

### motor-fechas.4 · corregido+probado · [bloque 06] · commit 0d02b1f

- **Evidencia histórica (defecto original):** backend/periods.js:89-101 `comparativoAnterior`: `const len = r.hasta - r.desde; ... case "mes": desde = addMonths(r.desde, -1); ... return { desde, hasta: desde + len, ... }`. `len` es el tramo transcurrido del mes en curso (largo); sumado al día 1 del mes anterior (corto) se desborda su fin de mes. Vivo en backend/routes/business-health.js:15 `const ant = periods.comparativoAnterior(preset, now)` y backend/executive-dashboard.js:92,98,222 vía periods.resolver.
- **Evidencia actual (HEAD):** periods.comparativoAnterior capa el tramo para no desbordar al mes siguiente.
- **Prueba y resultado:** tests/periodos-stock.unit.js (31 marzo) · PASA

### motor-fechas.5 · corregido+probado · [bloque 06] · commit 0d02b1f

- **Evidencia histórica (defecto original):** backend/periods.js:104-111 `comparativoAnioAnterior`: `desde: new Date(new Date(r.desde).getFullYear() - 1, new Date(r.desde).getMonth(), new Date(r.desde).getDate(), new Date(r.desde).getHours()).getTime()` (ídem hasta). Reconstruye por hora-pared local, conserva sólo la hora (minutos/segundos se pierden) y para 29-feb de año bisiesto → año-1 no bisiesto desborda a 1-mar. Expuesto en backend/executive-dashboard.js:222 `anio_anterior: res.anio_anterior`.
- **Evidencia actual (HEAD):** periods.comparativoAnioAnterior alineado al día (sin hora) → sin deriva DST.
- **Prueba y resultado:** tests/periodos-stock.unit.js · PASA

### motor-fechas.6 · abierto · [bloque 06]

- **Evidencia histórica (defecto original):** backend/cuenta-resultados.js:65-73 proyección lineal sin amortiguación ni mínimo de días: `if (enCurso && diasTranscurridos > 0 && diasTranscurridos < diasMes) { const factor = diasMes / diasTranscurridos; const ventasP = ventas * factor; ...; const personalMes = personal * (diasMes / diasTranscurridos); ... }`. Mismo patrón en backend/executive-dashboard.js:115 `beneficioActual.proyeccion_mes = eur(benMes.beneficio_operativo * (diasDelMes / diasTranscurridos))`.
- **Evidencia actual (HEAD):** proyección lineal volátil los primeros días: sin cambios.
- **Prueba y resultado:** —
- **Nota:** Verificable sin producción. En día 1 el factor es diasMes/1 ≈ 30×, de modo que la proyección oscila fuertemente al principio del mes; no hay suavizado, mínimo de días ni banda de confianza. Es el método lineal tal y como está diseñado (etiquetado «proyección»), no un error de cálculo, pero la condición de volatilidad señalada por la auditoría sigue intacta.

### agora.1 · corregido+probado · [bloque 04] · commit 02d0101

- **Evidencia histórica (defecto original):** backend/conciliacion-ventas.js:214 `if (grupo.length < 2 || tipos.size < 2) return;` y :216 `ordenado.slice(1).forEach((t) => clavesAEliminar.push(t.clave));`. La firma (backend/conciliacion-ventas.js:42-48 `firmaTicket`) es solo productos+cantidades+importe redondeado, SIN hora ni cliente. La eliminación heurística de limpiarDuplicados sigue existiendo y borra ventas reales.
- **Evidencia actual (HEAD):** conciliacion-ventas.sobrantesSeguros: conserva TODAS las facturas (ventas reales) y solo quita inferiores 1:1.
- **Prueba y resultado:** tests/conciliacion-ventas.unit.js (2 facturas + 1 albarán → solo el albarán) · PASA

### agora.2 · parcial · [bloque 04] · commit 02d0101

- **Evidencia histórica (defecto original):** backend/agora.js:214-216 `const bizKey = (s, n, f) => ... return "${s}|${num}|${f.slice(0,10)}"` (solo Serie+Número+día) y :243-244 `const bk = bizKey(serie, number, fecha); if (serie != null && number != null && ventasBiz.has(bk))`. No hay ningún campo que vincule el número de albarán con el de su factura; dos documentos con números distintos no se cruzan en la ingesta.
- **Evidencia actual (HEAD):** albarán+factura con números distintos se SEÑALA en la conciliación (no se fusiona a ciegas).
- **Prueba y resultado:** tests/cuadre-agora.unit.js (aviso doble conteo) · PASA

### agora.3 · corregido+probado · [bloque 04] · commit 02d0101

- **Evidencia histórica (defecto original):** backend/agora.js:47-95 `function importarVentas(...)` hace `ventas.push({ id: store.nextId("ven","ventas"), ... })` sin doc_clave ni dedupe. Llamada viva en 3 vías: backend/agora.js:359 `const r = importarVentas(texto, "cron")` (invocado por server.js:539 `setInterval(() => agora.cronImport(), 60*60*1000)`), backend/routes/ventas.js:33 `agora.importarVentas(csv, "manual")`, backend/ventas-email.js:77 `agora.importarVentas(txt, "email")`.
- **Evidencia actual (HEAD):** cronImport idempotente por hash del fichero (no reimporta el mismo CSV).
- **Prueba y resultado:** tests/agora-cron-idempotente.unit.js · PASA

### agora.4 · parcial · [bloque 04] · commit 02d0101

- **Evidencia histórica (defecto original):** backend/agora.js:214-216 `const bizKey = (s, n, f) => ... return "${s}|${num}|${f.slice(0,10)}"` — la clave NO incluye el tipo de documento; y :244 `if (serie != null && number != null && ventasBiz.has(bk)) ... deduplicados.push(...); return;` deduplica por Serie+Número+día sin mirar el tipo.
- **Evidencia actual (HEAD):** bizKey se mantiene sin tipo A PROPÓSITO (cuadra la misma venta entre CSV y conector); el riesgo de colapso lo cubre la conciliación.
- **Prueba y resultado:** verificado por lectura

### agora.5 · corregido+probado · [bloque 04] · commit 6c6d2fc

- **Evidencia histórica (defecto original):** backend/agora.js:256-271: la resolución de línea solo lee nombre, `cantidad` (:257), `importeRaw` de `["TotalAmount","Amount",...,"GrossAmount","UnitPrice",...]` (:258) y `netoRaw` de `["Base","NetAmount",...]` (:261). No hay ninguna referencia a descuento/discount/invitación/cortesía en backend/agora.js ni backend/ventas-export.js (grep sin coincidencias salvo un comentario). No existe resta de descuentos de línea/documento ni tratamiento de invitaciones.
- **Evidencia actual (HEAD):** agora.esAnulado: documentos anulados no cuentan; invitaciones suman 0; devoluciones restan.
- **Prueba y resultado:** tests/agora-cuadre.unit.js (anulado no cuenta) · PASA

### agora.6 · no_confirmado · [bloque 11]

- **Evidencia histórica (defecto original):** backend/agora.js:189 `const procesadosPrev = new Set(docsAgora.filter(d => d.status==="processed").map(d => d.id))` y :218-219 `const ventasBiz = new Set(); ventas.forEach(...)` se construyen de la caché en memoria. backend/data-store.js:168-183 (init) hidrata la caché UNA vez al arrancar; readAll (:226-229) devuelve la caché, nunca re-lee la BD en runtime. backend/db.js:48-54 `CREATE TABLE ... id TEXT PRIMARY KEY` — no hay UNIQUE sobre doc_clave ni sobre Serie+Número (grep unique/constraint sin coincidencias); la fila de venta usa un id aleatorio (nextId).
- **Evidencia actual (HEAD):** En una instancia importarDocs es síncrono → seguro. Multi-réplica requiere restricción única en BD (decisión de despliegue).
- **Prueba y resultado:** n/a (requiere despliegue multi-réplica)

### agora.7 · abierto · [bloque 11]

- **Evidencia histórica (defecto original):** backend/conciliacion-ventas.js:200-201 `const key = v.doc_clave; if (!key) return;` — limpiarDuplicados EXCLUYE las ventas sin doc_clave. backend/agora.js:219 `ventas.forEach(v => { if (v.doc_serie != null || v.doc_number != null) ventasBiz.add(...) })` — el índice bizKey de la ingesta omite las heredadas. PERO backend/conciliacion-ventas.js:100 `const tkey = v.doc_clave || "(sin doc) "+v.id;` — conciliacionDia SÍ las suma en bruto/neto y las muestra como tickets. backend/migracion-ventas-dup.js:28 borra las heredadas en meses que ya tienen consumo.
- **Evidencia actual (HEAD):** ventas heredadas sin doc_clave siguen fuera del cuadre fino.
- **Prueba y resultado:** —
- **Nota:** El hallazgo es mixto. 'Fuera de la limpieza' es CORRECTO: limpiarDuplicados hace `if (!key) return` (línea 201), y la ingesta no las indexa en bizKey (agora.js:219), así que una heredada no bloquea una reimportación equivalente. 'Fuera del cuadre' es solo PARCIALMENTE cierto: conciliacionDia SÍ las cuenta en los totales (línea 100, agrupadas como tipo 'Otro'), no quedan fuera del cuadre de importes. Además existe la migración de arranque migracion-ventas-dup.js que elimina las heredadas duplicadas en meses con consumo (idempotente, con test). Riesgo mitigado pero no cerrado: quedan vías donde una venta heredada sin doc_clave ni se dedup en ingesta ni se puede remediar con limpiarDuplicados.

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

### frontend.5 · abierto · [bloque 09]

- **Evidencia histórica (defecto original):** frontend/index.html:1829 `.lab-estado { font-size:9px; ...; color:#1a1f16; ... }` pintado sobre fondo inline `background:${est.c}` (:5487). LAB_ESTADOS (:5316-5319): prueba c:'#c79a3a' (~6.4:1 OK), aprobado c:'var(--olive)'=#45443D (~1.7:1), carta c:'#3f6079' (~2.5:1), archivado c:'var(--muted)'=#86847A (~4.47:1).
- **Evidencia actual (HEAD):** algunos badges con contraste bajo: sin cambios.
- **Prueba y resultado:** —
- **Nota:** Texto casi negro (#1a1f16) en 9px mayúsculas sobre fondos oscuros/medios. 'Aprobado' (olivo, ~1.7:1) y 'En carta' (azul, ~2.5:1) quedan muy por debajo de 4.5:1; 'Archivado' justo por debajo (~4.47:1). Medible por fórmula WCAG; confirmado abierto.

### frontend.6 · abierto · [bloque 09]

- **Evidencia histórica (defecto original):** frontend/index.html:1019-1021 `.topbar-inicio { font-size:12px; ...; padding:7px 18px; ... }` (alto ≈30px con borde); :1025-1027 `.topbar-aj { font-size:12px; ...; padding:7px 15px; }` (≈30px); :1044-1045 `.topbar-back { ...; font-size:17px; ...; padding:0 4px 0 0; }` (~20px). La barra mide 94px (:1003) pero estos controles no llenan el alto.
- **Evidencia actual (HEAD):** tamaño táctil de la barra superior: sin cambios (toca layout).
- **Prueba y resultado:** —
- **Nota:** Objetivos táctiles de ~28-31px (inicio/ajustes) y aún menores en el botón atrás, por debajo del mínimo recomendado 44x44px en una app móvil-primero. El imagotipo central sí mide 44px (:1032). La cifra '~28px' del hallazgo es aproximadamente correcta.

### frontend.7 · abierto · [bloque 09]

- **Evidencia histórica (defecto original):** grep -oiE '#[0-9a-f]{6}|#[0-9a-f]{3}' frontend/index.html = 476 ocurrencias (135 únicas). En :root (:31-83) hay 30 custom properties, de las cuales ~17 son colores hex. Ejemplos de hex inline sueltos: #23281E (:1564), #B7C77E (:1569), #262B1E (:1035), #1a1f16 (:1829), #c79a3a/#3f6079 (:5316-5318).
- **Evidencia actual (HEAD):** deriva de color (tokens sin unificar): sin cambios.
- **Prueba y resultado:** —
- **Nota:** Cifra confirmada al dígito: 476 hex inline frente a ~20 tokens (hallazgo exacto). Deriva de color / mantenibilidad: numerosos hex duplican o se desvían de los tokens definidos en :root.

### frontend.8 · abierto · [bloque 09]

- **Evidencia histórica (defecto original):** frontend/index.html:3946 `function labPanel(titulo, lista, onclick){` es la ÚNICA aparición de 'labPanel' en el fichero (nunca se invoca). Su CSS `.lab-panel` (:1195, :1198, :1207) solo se emite dentro de esa función (:3947 `<button class="lab-panel" ...>`), por lo que también queda inalcanzable.
- **Evidencia actual (HEAD):** labPanel() confirmado código muerto; retirada diferida por bajo valor.
- **Prueba y resultado:** —
- **Nota:** Código muerto confirmado por grep: labPanel() definido y sin ninguna llamada; .lab-panel referenciado solo dentro de labPanel(). (Nota: usa <button>, de modo que si se usara sería accesible por teclado; es irrelevante porque está muerto.)

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

### pwa.5 · abierto · [bloque 07]

- **Evidencia histórica (defecto original):** frontend/index.html:4968 svtAlarma dispara en primer plano `new Notification("⏰ Retira: "+c.label, { ... tag:c.id ...})` con c.id = 'sv'+n (línea 4893). El servidor dispara en paralelo el push a la misma hora y el SW lo muestra en frontend/sw.js:30 `self.registration.showNotification(title, options)` con tag = t.id = 'svp'+Date.now()+random (backend/sv-timers.js:42). Los tags DIFIEREN, así que no se colapsan: aparecen dos notificaciones. El handler push de sw.js (líneas 15-31) no comprueba clientes enfocados antes de mostrar.
- **Evidencia actual (HEAD):** notificación duplicada en primer plano: sin cambios.
- **Prueba y resultado:** —
- **Nota:** El duplicado requiere que el push del servidor llegue efectivamente (avisos activados y suscripción válida). No hay deduplicación por cliente enfocado ni tag común entre el aviso local y el del servidor. Confirmado por lectura; el solapamiento visual exacto solo se ve en dispositivo real.

### pwa.6 · abierto · [bloque 07]

- **Evidencia histórica (defecto original):** frontend/index.html:4900-4901 svtStart lanza el POST y asigna el id de forma asíncrona: `api("/avisos/temporizador",{...}).then(r=>{ t.pushId = r.id; }).catch(()=>{});`. frontend/index.html:4905 svtStop: `if(t && t.pushId){ api("/avisos/temporizador/"+t.pushId,{method:"DELETE"}).catch(()=>{}); }` — si se para antes de que llegue la respuesta, t.pushId es null (inicializado en línea 4893) y NO se envía el DELETE, así que el temporizador del servidor nunca se cancela y disparará su push.
- **Evidencia actual (HEAD):** carrera al parar el temporizador antes de recibir el id: sin cambios (coordinación SW/front).
- **Prueba y resultado:** —
- **Nota:** Carrera real e intacta: parar un temporizador en los ~milisegundos/segundo previos a recibir el id del servidor deja vivo el aviso 'retira' en el backend. No hay cola de cancelaciones pendientes ni reintento. Daño bajo (aviso espurio), pero el defecto persiste.

### pwa.7 · corregido · [bloque 07] · commit 593ee6e

- **Evidencia histórica (defecto original):** frontend/manifest.webmanifest (completo, 17 líneas): claves presentes name, short_name, description, start_url, scope, display, orientation, background_color, theme_color, lang, icons. NO existe la clave "id".
- **Evidencia actual (HEAD):** manifest.webmanifest: campo 'id'.
- **Prueba y resultado:** verificado por lectura

### rendimiento.1 · corregido+probado · [bloque 08] · commit 6c6d2fc

- **Evidencia histórica (defecto original):** backend/agora.js:316 `store.writeAll("ventas", ventas);` (y :315 materias) en CADA importarDocs → data-store.js:221 `if (usingDb) return encolar(name, () => db.replaceAll(name, cache[name]));` → db.js:112-120 `replaceAll` hace `await client.query(`DELETE FROM ${t}`);` seguido de un bucle de INSERT. También ventas-export.js:86-87 `store.writeAll("ventas", ...)` al reemplazar meses. En modo JSON equivale a reescribir el fichero entero (data-store.js:211/150).
- **Evidencia actual (HEAD):** insertMany: la sync ya no reescribe toda la tabla de ventas (no DELETE+INSERT de todo).
- **Prueba y resultado:** tests/incremental-ventas.unit.js · PASA

### rendimiento.2 · abierto · [bloque 08]

- **Evidencia histórica (defecto original):** backend/routes/dashboard.js:12 `res.json(dashboard.calcular({ now: Date.now() }));` sin caché ni cabecera de cacheo. dashboard-ceo.js recorre `ventas` muchas veces: mediaMismoDiaSemana (líneas 155-165) llama a analisisDiario.ventaDia 8 veces, serieMes (línea 450) recorre todas las ventas, más ventaDia de hoy (207) y de la semana pasada (321); ventaDia filtra el array completo cada vez. frontend/index.html:3862 `_dashTimer=setInterval(()=>{...loadHomeCEO()...}, 180000);` = 3 min.
- **Evidencia actual (HEAD):** dashboard sin caché: sin cambios (requiere medición y caché por rol).
- **Prueba y resultado:** benchmark local disponible (scripts/bench.js)
- **Nota:** El número exacto "30-40 pasadas" no es verificable al milímetro, pero el orden de magnitud (docenas de recorridos completos del array ventas por llamada, sin memoización ni caché de respuesta) sí se confirma leyendo el código.

### rendimiento.3 · abierto · [bloque 08]

- **Evidencia histórica (defecto original):** backend/data-store.js:168-183 init() hace para cada entidad `let rows = await db.loadAll(name)` (:171) o `cache[name] = readFile(name)` (:181). backend/db.js:63-67 `loadAll` = `SELECT data FROM ${t} ORDER BY seq ASC` (todas las filas). readAll (data-store.js:226-229) devuelve el array completo de la caché. db.js solo expone count/loadAll/upsert/del/tx/replaceAll: no hay ninguna consulta con WHERE por fecha ni índice.
- **Evidencia actual (HEAD):** todo en memoria/sin consulta por fecha en SQL: sin cambios (requiere medición).
- **Prueba y resultado:** —
- **Nota:** Relacionado con bloques 03/06. El techo real de memoria/arranque solo se confirma en producción con volumen (p. ej. 1-2 años de ventas); estructuralmente es cierto que toda la BD se hidrata en memoria y la selección por fecha se hace recorriendo arrays en JS, nunca por SQL.

### rendimiento.4 · abierto · [bloque 08]

- **Evidencia histórica (defecto original):** frontend/index.html = 974475 bytes (~950 KB). No existe middleware `compression()` en ningún .js del repo (grep sin coincidencias). backend/server.js:415-417 sirve .html y sw.js con `res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate")`. frontend/sw.js:13 `self.addEventListener("fetch", () => {});` — passthrough puro, no cachea nada.
- **Evidencia actual (HEAD):** sin compresión: sin cambios (requiere dependencia).
- **Prueba y resultado:** —
- **Nota:** La parte de SW corresponde también a bloque 09 (PWA). A nivel de app no hay gzip/deflate y el HTML va con no-store (se re-descarga en cada carga). Render podría aplicar compresión en el edge: eso NO es verificable sin acceso a producción, pero el defecto a nivel de aplicación (sin compresión, no-store, SW sin caché) es real.

### rendimiento.5 · corregido+probado · [bloque 08] · commit 2314e59

- **Evidencia histórica (defecto original):** backend/analisis-diario.js:55 `const cu = p ? costing.costeProducto(p, idxMat) : 0;` dentro de `lineas.forEach` (:50). backend/costing.js:74-78 costeProducto → costeEscandallo (:51-57) → costeMateriaEfectivo (:29-47, recursivo con guardia anti-ciclos). No hay memo/caché por producto en costing.js.
- **Evidencia actual (HEAD):** costing.costeProducto memoizado por pasada (WeakMap sobre idxMat), resultado idéntico.
- **Prueba y resultado:** tests/rendimiento.unit.js · PASA

### rendimiento.6 · abierto · [bloque 08]

- **Evidencia histórica (defecto original):** backend/routes/ventas.js:63-65 `router.get("/", (req, res) => { res.json(store.readAll("ventas").slice().reverse()); });` — devuelve el array completo invertido, sin parámetros de límite/offset ni paginación.
- **Evidencia actual (HEAD):** GET /api/ventas sin paginar: sin cambios (cambiar el default rompería el front).
- **Prueba y resultado:** —
- **Nota:** Devuelve todas las ventas en cada petición; el impacto crece linealmente con el histórico. No hay ruta paginada alternativa.

### rendimiento.7 · abierto · [bloque 08]

- **Evidencia histórica (defecto original):** backend/data-store.js:59 `"stock_movements"` está en ENTITIES (se hidrata entero en init). Inserción (nunca purga): agora.js:314 `movimientos.forEach((mv) => store.insert("stock_movements", mv));`, inventario.js:88 y conciliacion-ventas.js:258 (mismo patrón). Lectura completa en memoria: conciliacion.js:73 `(store.readAll("stock_movements") || []).forEach(...)`, inventory-capital.js:42, time-machine.js:54. No hay política de retención/archivado (solo limpieza-demo.js para datos de demo).
- **Evidencia actual (HEAD):** stock_movements sin archivado: sin cambios (política de retención).
- **Prueba y resultado:** —
- **Nota:** Relacionado con bloque 06. Es la tabla que más crece (1+ movimiento por ingrediente por línea de venta). El crecimiento sin límite y el impacto en memoria solo se cuantifican en producción con histórico, pero la ausencia de corte temporal/archivado es verificable y está vigente.

### rendimiento.8 · abierto · [bloque 08]

- **Evidencia histórica (defecto original):** backend/data-store.js:209-213 `persistUpsert`: en modo JSON (`!usingDb`) ejecuta `writeFile(name, cache[name])`. writeFile (:148-151) hace `fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8")` — fichero completo y síncrono. insert (:250-255) y update (:241-248) llaman a persistUpsert, de modo que cada alta/edición reescribe el array entero.
- **Evidencia actual (HEAD):** JSON reescribe fichero entero por insert: mitigado con insertMany en lote para la ingesta.
- **Prueba y resultado:** parcial vía insertMany
- **Nota:** Relacionado con bloque 03. Inherente al backend JSON (un array en un único fichero no admite escritura por fila). En producción con DATABASE_URL NO aplica (usa db.upsert por fila, data-store.js:210). El riesgo real es dev y cualquier despliegue sin Postgres.

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

### tests.10 · abierto · [bloque 10]

- **Evidencia histórica (defecto original):** tests/e2e.spec.js es un único fichero de 119.073 bytes con ~109 llamadas `test(` (grep -c 'test(' = 109) y grep `test.describe` → sin resultados (sin agrupación por área). playwright.config.js: `fullyParallel: false` y un solo project chromium con un webServer compartido → ejecución serial con estado compartido.
- **Evidencia actual (HEAD):** e2e monolítico sin trocear: sin cambios (refactor grande, bajo riesgo).
- **Prueba y resultado:** —
- **Nota:** Sigue monolítico y serial. El aislamiento de DATOS mejoró (DATA_DIR temporal por run, tests.3), pero el estado del servidor y de la BD de pruebas se comparte entre todos los tests del fichero y no hay separación por áreas ni paralelismo. Severidad baja: es mantenibilidad/robustez de la suite, no un bug de correctitud del producto.

### tests.11 · corregido+probado · [bloque 03] · commit 065676a

- **Evidencia histórica (defecto original):** backend/server.js:22 `const persistente = db.isActive();` y :33 `persistencia: persistente ? "persistente" : "efimera"`. backend/db.js:131-133 `function isActive() { return pool != null; }` → solo comprueba que el objeto pool existe (creado una vez al arrancar si `SELECT 1` pasó en connect(), db.js:41), no ejecuta ninguna consulta viva en el healthcheck. No hay endpoint de readiness que verifique BD ni estado de hidratación/inicialización.
- **Evidencia actual (HEAD):** /api/listo comprueba la BD (readiness) distinto de liveness.
- **Prueba y resultado:** tests/integracion-http.unit.js (/api/listo en vivo) · PASA

