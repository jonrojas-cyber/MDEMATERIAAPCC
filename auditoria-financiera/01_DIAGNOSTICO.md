# Auditoría financiera forense · Control M (m de materia)
## 01. Diagnóstico

> Fecha: 2026-10-16 · Rama de trabajo `claude/jolly-franklin-3j3eg4` (**sin desplegar**) · **Solo lectura: no se ha modificado producción ni se ha corregido nada.**

---

## Objetivo

Determinar si **Control M es un cerebro financiero en el que se pueda confiar para tomar decisiones económicas**, no cuántos tests pasan. Auditar todas las fórmulas, el IVA, el coste de mercancía, el coste laboral, compras/inventario/consumo, facturas/proveedores/pagos, gastos, márgenes, beneficio/tesorería, la integración de Ágora, la persistencia y la consistencia entre pantallas; y señalar lo que falta.

## Metodología (y por qué es fiable)

- **Fase 1 — Auditoría forense:** 12 auditores independientes (CFO de hostelería + controller + arquitecto + auditor de datos), uno por área, documentando cada fórmula con `archivo:función`, origen del dato (confirmado / estimado / sembrado) y construyendo **casos de matemática conocida** ejecutados contra el código real. **60 hallazgos confirmados.**
- **Fase 2 — Contra-auditoría:** un **segundo auditor por cada hallazgo** cuyo encargo era *demostrar que el primero se equivoca*; más cobertura de todos los indicadores por pantalla, conciliación global sobre un fixture conocido, prueba de datos incompletos y veredicto de fiabilidad.
- **Resultado del control de calidad cruzado: 37 CONFIRMA · 23 MATIZA · 0 REFUTA.** Ningún hallazgo fue desmontado. Los "MATIZA" no niegan el defecto: ajustan el importe (p. ej. "0 € hoy, latente") o lo condicionan a datos reales.
- **Aviso de honestidad (regla innegociable):** los datos de producción **no están en el repositorio** (`ventas.json`, `recepciones.json`, `debts.json`, `staff_finance.json`… salen vacíos). Por eso los **mecanismos** de error están confirmados leyendo el código, pero muchos **importes en €** son *estimados* o *no verificables* hasta cargar los datos reales y conciliar con el banco. Nunca se confunde un dato estimado/sembrado con uno confirmado, ni se ocultan diferencias con redondeos.

## Mapa de la arquitectura financiera

- **Motor del dinero:** `financials.js` (ventas netas/brutas, coste de materia, beneficio/EBITDA de la **portada**), `cuenta-resultados.js` (P&L mensual con overrides), `financiero.js` (cascada día·mes·año), `dashboard-ceo.js` + `executive-dashboard.js` (portada), `break-even.js` (equilibrio), `costing.js` (escandallos), `fixed-costs.js` + `staff-finance.js` (fijos + personal), `debts.js` (deuda), `treasury.js` + `treasury-os.js` (tesorería), `analisis-diario.js` / `analisis-mes.js` (análisis), `iva.js` (IVA_VENTA=0,10).
- **Entrada de datos:** Ágora (`agora.js`, `agora-sync.js`, conector TPV, `ventas-export.js`, email/CSV), facturas por email (`facturas-email.js`, `resend-inbound.js`, `ocr.js`), compras/recepciones.
- **Persistencia:** `data-store.js` (JSON en disco o PostgreSQL vía `DATABASE_URL`).
- **Convención fiscal declarada:** ventas del titular en **BRUTO** (con IVA, para cuadrar con Ágora); P&L en **NETO** (sin IVA); IVA de venta 10% por defecto.

## Estado general: los tres planos

1. **Lo que es FIABLE hoy** (4 bloques): el **coste unitario por escandallo** (bebidas y platos — una sola fuente de verdad, motor correcto), el **PVP de carta** (no se duplica), las **ventas por la vía de importación CSV** (lee la base imponible correcta) y el **control por rol** (el equipo no ve coste/precio/margen).
2. **Lo que NO es FIABLE** (10 bloques): la cascada del P&L que decide precios/viabilidad tiene **dos motores divergentes**, **doble IVA** en varias vías, un **"beneficio neto" que no es neto** (sin amortización, sin interés real, sin impuesto), **coste laboral incompleto**, **tesorería que infla la caja libre** y **riesgo de pérdida/corrupción de ventas y stock** en la ingesta/reimport de Ágora.
3. **Lo que NO se puede verificar aún** (7 bloques): el beneficio real del mes, el saldo de banco/caja, el arqueo, el forecast y las cifras reales de préstamo/nóminas/gastos/IVA por familia — porque **faltan los datos de producción**.

**Conclusión:** la arquitectura (fuente única del dinero, escandallos, roles) es **sólida**; pero mientras persistan los errores de conciliación de ventas/IVA y las lagunas estructurales del P&L, **el resultado económico mostrado NO es apto para decidir con confianza absoluta**. Lo bueno: las causas están **localizadas, demostradas y son corregibles**.

---

## TOP 10 problemas por impacto económico / de decisión

> Ordenados por su capacidad de hacer tomar una decisión equivocada o de perder dinero/datos reales. El € exacto de varios depende de datos de producción (se indica).

| # | Problema | Dónde | Impacto | Estado QA |
|---|----------|-------|---------|-----------|
| 1 | **Dos motores de P&L divergentes (portada vs cuenta de resultados)** — raíz demostrada de la discrepancia histórica. La portada ignora el cierre de Ágora, el food cost manual y los gastos extraordinarios que la cuenta sí aplica → EBITDA y food cost distintos para el mismo mes. | `financials.js` beneficio · `dashboard-ceo.js` · `cuenta-resultados.js` (F01, F45) | Desvío de EBITDA potencialmente ilimitado; cambia de signo pérdida↔beneficio. Se decide precio/viabilidad sobre una cifra falsa. | ✅ CONFIRMA |
| 2 | **Reimportar un mes borra ventas y vacía el stock** — `importarReemplazando` elimina TODAS las ventas del mes (incluidas las del conector en tiempo real) y re-descuenta el inventario. | `ventas-export.js` importarReemplazando (F02, F20) | En la reproducción se perdió ~90% del mes (28 de 31 ventas). Pérdida de ingresos/cuadre y vaciado del almacén; puede ser permanente. | 🟨 MATIZA (mecanismo 100%) |
| 3 | **Ingesta de Ágora no atómica** — el marcador de "ya procesado" se guarda aparte de las ventas: si falla entre medias, la venta se pierde o se duplica **para siempre**, sin alerta (la idempotencia lo hace invisible). | `agora.js` importarDocs (F03) | Descuadre de ventas, stock y P&L por incidente; recurrente en cada sync. | ✅ CONFIRMA |
| 4 | **Doble IVA en el cierre mensual** — el campo "ventas netas del mes · sin IVA" se guarda y el P&L le vuelve a quitar el IVA; el seed de septiembre metió neto donde se espera bruto; y **cada re-guardado resta otro 9%** encadenado. | `cuenta-resultados.js` · `seed-negocio.js` · `frontend` crGuardarCierre (F08–F10, F43, F44) | −9,09% de ingresos del P&L y de todo lo derivado; ~−13.600 €/año de ingreso reportado; corrupción acumulativa al re-guardar. | ✅ CONFIRMA |
| 5 | **Doble IVA en "Análisis del mes" vía conector** — trata el importe bruto como neto y vuelve a sumar IVA. | `analisis-mes.js` agregarDesdeVentas (F11, F33, F41 · ERROR 1 conciliación) | Ventas/total del mes **sobrevaloradas ~11%**; ticket medio y mix por familia distorsionados. | ✅ CONFIRMA |
| 6 | **El "beneficio neto" NO es neto** — el P&L omite **amortización** del inmovilizado, el **coste financiero** del préstamo (interés sembrado a **0%** presentado como "del banco") y el **impuesto sobre el beneficio**. Es un BAI etiquetado como "neto". | `financials.js` beneficio · `assets.js` · `debts.js` (Lagunas L2/L3/L7) | Resultado estructuralmente **sobreestimado**; decisiones de reparto/inversión sobre un beneficio que no existe. | ✅ (lagunas) |
| 7 | **Coste laboral incompleto** — no devenga pagas extra ni vacaciones (**−16,67%** de infradotación), SS con coeficiente 1,32 global en vez de por empleado, e importe de Daniel (2.500 €) sin confirmar por nómina; motor de SS muerto. | `staff-finance.js` · `fixed-costs.js` · `seed-negocio.js` (F18, F49, Laguna L8) | El coste de personal real (la mayor partida tras materia) puede estar infravalorado; EBITDA inflado. | 🟨 MATIZA |
| 8 | **Tesorería infla la caja libre** — el "disponible" **no resta la nómina (~5.000 €/mes)** ni los compromisos a corto (fijos, cuota de deuda, impuestos). | `treasury-os.js` · `dashboard-ceo.js` (F25, F26) | Enseña miles de € más de caja libre de la real → riesgo de sobregasto y tensión de tesorería. | ✅ CONFIRMA |
| 9 | **Deuda "200 € en vez de 708"** — el seed de préstamos no se auto-repara; una cuota puede quedar a la mitad o desaparecer de la cascada. | `seed-negocio.js` seedNegocio (F28) | Hasta −708 €/mes (−8.496 €/año) de salida de caja no reflejada; patrimonio/valor de empresa sobrevalorados. | 🟨 MATIZA |
| 10 | **IVA por familia ausente + IVA de compra en el coste** — alcohol/retail/latas (Spritz) se netean al **10%** cuando van al **21%**; y el coste de materia desde compras se guarda **con IVA**, inflando el food cost. | `iva.js`/`financials.js`/`cuenta-resultados.js` · `coste-desde-compras.js` (Laguna L1, F15, F22, ERROR 2) | Base imponible e IVA mal calculados con carta mixta; food cost y margen sesgados ~+10%. | ✅ / 🟨 |

**Mención especial (riesgo meta):** la **prueba de datos incompletos la suspende** — con escandallos, nóminas o gastos fijos ausentes, Control M **sigue mostrando un beneficio "definitivo"** aunque sea incorrecto. Un cerebro financiero debe degradar a *estimado / aviso*, nunca presentar como cerrado lo que no lo es.

> Detalle completo de los 60 hallazgos en **02_ERRORES_DETECTADOS.md**; conciliación y cobertura en **03**; riesgos en **04**; funcionalidades ausentes en **05**; plan en **06**; contra-auditoría y veredicto en **07**.
