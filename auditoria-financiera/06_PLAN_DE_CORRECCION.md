# Auditoría financiera forense · Control M (m de materia)
## 06. Plan de corrección

> Fecha: 2026-10-16 · Rama de trabajo (**sin desplegar**) · **Nada de esto se ha implementado: espera tu autorización.**
> Priorización por **impacto económico · fiabilidad · coste de implementación · mantenimiento**. Cada bloque lleva sus hallazgos, los ficheros a tocar y el **criterio de aceptación** (cómo sabremos que está bien, con test reproducible).

---

## Principio rector

**Primero parar la pérdida de datos y de verdad; luego hacer el P&L contablemente correcto; luego cargar datos reales y conciliar; y solo entonces construir el "cerebro" (Fase 3).** No se corrige históricos para forzar el cuadre: se corrige el motor y se recargan los datos.

---

## FASE A · Urgente — parar la hemorragia (alto impacto, bajo coste)

Objetivo: que Control M **no pierda ventas/stock** y que el P&L **deje de mentir** en IVA y en la portada.

1. **Ingesta de Ágora atómica e idempotente** (R1 · F03, F02, F20). Persistir venta + marcador en una sola transacción (o escribir el marcador **después** de confirmar la venta); `importarReemplazando` nunca debe borrar ventas de otra fuente (conector) ni re-descontar stock ya aplicado; avisar + respaldar antes de cualquier borrado mensual.
   - *Ficheros:* `agora.js`, `ventas-export.js`, `data-store.js`.
   - *Aceptación:* test que reimporta un export parcial sobre un mes con ventas del conector y **no pierde ninguna**; reimportar N veces no cambia stock ni ventas (idempotencia probada); un fallo simulado entre venta y marcador no deja hueco.
2. **Unificar el motor de P&L** (R2 · F01, F45, F55, F56, F57). La portada (`dashboard-ceo`/`executive-dashboard`) debe derivar ventas/EBITDA/food cost de **la misma fuente** que la cuenta de resultados (overrides incluidos), o declararse explícitamente "operativa, no contable". Un solo rótulo "del mes" = una sola cifra (MTD o proyección, no ambas con el mismo nombre).
   - *Ficheros:* `financials.js`, `dashboard-ceo.js`, `executive-dashboard.js`, `financiero.js`.
   - *Aceptación:* para el mismo mes y datos, portada y cuenta de resultados dan **el mismo** EBITDA, food cost e ingresos (test de consistencia que hoy falla).
3. **Eliminar el doble IVA** (R2 · F08–F12, F33, F41, F43, F44 · ERROR 1/2 de conciliación).
   - `analisis-mes.agregarDesdeVentas`: usar `financials.netoDeVenta(v)` para el neto y `Number(v.importe)` para el total, como ya hace `analisis-diario`; **no** re-aplicar +10%.
   - Cierre de Ágora: netear por **IVA de cada línea/familia**, no al 10% plano; el campo del front debe pedir sin ambigüedad el **bruto** (lo que el motor espera) y no re-netear al re-guardar; corregir el seed de septiembre (bruto, no neto).
   - *Ficheros:* `analisis-mes.js`, `cuenta-resultados.js`, `routes/cuenta-resultados.js`, `frontend` crRender/crGuardarCierre, `seed-negocio.js`.
   - *Aceptación:* el fixture de IVA mixto de la conciliación (03) cuadra al céntimo por las dos vías (CSV y conector); re-guardar el cierre no cambia la cifra.
4. **Trazabilidad de los overrides** (R4 · F47). Registrar en auditoría quién/cuándo cambia food cost y cierre (hoy no dejan rastro).
   - *Aceptación:* cada POST a `/cierre` y `/food-cost` deja un registro reconstruible.

> **Coste:** bajo-medio · **Impacto:** máximo · **Mantenimiento:** reduce deuda técnica (una sola fuente de verdad).

## FASE B · P&L contablemente correcto (fiabilidad)

Objetivo: que "beneficio neto", food cost, tesorería y coste laboral **signifiquen lo que dicen**.

5. **IVA por familia de producto** (R6 · Laguna L1, F15, F22, F34, F52). Modelar el tipo de IVA por producto/familia (10% hostelería vs 21% alcohol/retail/latas) en el neteo de ventas **y** en el coste; netear el coste de materia desde compras (quitar el IVA soportado).
   - *Aceptación:* una carta mixta netea cada línea a su tipo; food cost y margen dejan de estar sesgados por IVA.
6. **Beneficio neto real** (R3 · lagunas L2/L3/L7). Incorporar **amortización** del inmovilizado al P&L, **coste financiero real** del préstamo (tipo del banco, no 0%) y **provisión del impuesto** sobre el beneficio; renombrar lo que hoy es EBITDA/BAI para que no se confunda con "neto".
   - *Aceptación:* `beneficio_neto` = operativo − D&A − intereses − impuesto; el dossier y la portada usan los rótulos correctos.
7. **Coste laboral real** (R3 · F17, F18, F49, Laguna L8). Devengar pagas extra y vacaciones (provisión mensual), SS **por empleado** (no 1,32 global), confirmar el importe de Daniel por nómina; evitar el doble conteo `fixed_costs` + `staff_finance`.
   - *Aceptación:* el coste de personal mensual = coste real con SS y provisiones; no se duplica en ningún motor.
8. **Tesorería y conciliación bancaria** (R3 · F25, F26, lagunas). El "disponible" resta nómina y compromisos; los movimientos "hecho" actualizan el saldo; introducir conciliación banco/caja contra extracto.
   - *Aceptación:* "disponible" = saldo − compromisos a corto; registrar un cobro/pago real cambia el saldo y cuadra con el extracto.
9. **Robustez de fijos y prorrateo** (F29, F30, F51). Blindar `importeNeto` (validar que `vat` es fracción antes de netear; normalizar % → fracción); netear fijos con IVA de forma coherente con ventas; prorrateo por mes natural o por días abiertos, consistente en todas las pantallas.
   - *Aceptación:* el mismo coste fijo da el mismo importe en portada, financiero y cuenta; ningún neteo divide por 22.
10. **Inventario y mermas** (R1/R3 · F21, F23, F24). `stock_movements` como libro completo (toda entrada/salida); valoración a **PMP o FIFO**; una sola taxonomía de mermas (`ajustes` vs `mermas`).
    - *Aceptación:* rotación y "capital parado" reflejan el consumo real; evitable/intencionado cuadra.

## FASE C · Datos reales + verificación (antes de decidir con las cifras)

11. **Cargar producción y conciliar** (R4/R5 · dependencias externas del 07). Cargar facturas/recepciones, escandallos, inventario, nóminas y gastos fijos reales; **borrar los seeds estimados** (food cost 26%, cierre sembrado) una vez cargados los reales; conciliar banco/caja con extracto; fijar el IVA por familia real con el asesor.
12. **Degradar cuando faltan datos** (R5). Que ningún motor presente beneficio/EBITDA/food cost **"definitivo"** si falta un input esencial: mostrar *estimado* / aviso. Re-correr la **conciliación global** (03) con datos reales: debe quedar en 0 errores.
    - *Aceptación:* con un input esencial vacío, la cifra sale marcada estimada/null, nunca cerrada; la conciliación real cuadra.

## FASE D · Cerebro financiero (solo tras A–C)

13. Los 7 módulos del **08_ARQUITECTURA_CEREBRO_FINANCIERO.md** (meteo, Gmail/OAuth, rentabilidad real, predictiva, asistente, **auditoría continua** — que nazca de estos hallazgos como controles diarios —, y la priorización). No se construye encima de un P&L que miente: primero A–C.

---

## Orden recomendado y por qué

| Fase | Por qué primero | Coste | Riesgo si se pospone |
|------|-----------------|-------|----------------------|
| **A** | Para pérdida de datos + deja de mentir en IVA/portada | Bajo-medio | Se pierden ventas reales y se decide sobre cifras falsas cada día |
| **B** | El beneficio/tesorería pasan a significar lo real | Medio | El "beneficio" sigue siendo ficticio (sin impuesto/amortización/SS) |
| **C** | Sin datos reales nada es verificable | Medio (operativo) | Cerebro construido sobre estimaciones |
| **D** | Inteligencia sobre base fiable | Alto | Predicciones y alertas sobre datos erróneos |

> **No se implementa nada hasta tu autorización.** Cuando la des, propongo empezar por la **Fase A** (máximo impacto, menor coste) y entregar cada bloque con sus tests en verde, sin desplegar hasta que lo revises.
