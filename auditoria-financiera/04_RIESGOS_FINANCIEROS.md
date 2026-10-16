# Auditoría financiera forense · Control M (m de materia)
## 04. Riesgos financieros

> Fecha: 2026-10-16 · Rama de trabajo (**sin desplegar**) · Solo lectura.
> Los riesgos se ordenan por **gravedad × probabilidad × impacto en la decisión**. El € exacto de varios depende de datos de producción (se indica).

---

## R1 · Pérdida o corrupción de datos económicos (el más grave: se pierde dinero/verdad, no solo precisión)

- **Reimportar el mes borra ventas y stock** (`ventas-export.js` · F02/F20). Subir el export de Ágora por email/CSV sobre un mes ya iniciado **elimina las ventas previas de cualquier fuente** (incluido el conector en tiempo real) y **re-descuenta el inventario**. En la reproducción se perdió ~90% del mes. Riesgo: descuadre mensual completo y almacén teórico vaciado.
- **Ingesta de Ágora no atómica** (`agora.js` importarDocs · F03). El marcador de idempotencia se persiste aparte de las ventas → ante un fallo/crash/caída de BD en la ventana intermedia, la venta se **pierde o se duplica de forma permanente y silenciosa** (la idempotencia oculta el hueco). Sin alerta ni ruta de recuperación.
- **`init()` resucita datos borrados** (`data-store.js` · F39). Vaciar a propósito costes fijos (u otras 17 tablas sembradas) los **reinyecta al reiniciar/redesplegar** (Render), reintroduciendo cifras estimadas en el P&L sin aviso.
- **`flush()` sin reconciliación** (`data-store.js` · F40). Un fallo de escritura en Postgres puede dejar datos **sin persistir mientras se muestran como reales** hasta el reinicio, momento en que desaparecen sin traza. `reconciliar()` nunca se invoca en producción.
- **Severidad:** 🔴 crítica. **Probabilidad:** media-alta (operativa real de reenvío de export + reinicios de Render). **Acción:** máxima prioridad en el plan (06, Fase A).

## R2 · Cifras engañosas para decidir (la app "miente" sin querer)

- **Dos motores de P&L divergentes** (portada vs cuenta de resultados · F01/F45): EBITDA y food cost distintos para el mismo mes. Raíz de la discrepancia histórica.
- **Doble IVA** en el cierre mensual (−9,09%, acumulativo al re-guardar · F08–F10/F43/F44) y en "Análisis del mes" vía conector (+~11% · F11/F33/F41).
- **"Beneficio neto" ficticio** (sin amortización, sin interés real, sin impuesto · lagunas): es un BAI etiquetado como neto → resultado sobreestimado.
- **Tesorería infla la caja libre** (~5.000 €/mes de nómina + compromisos no restados · F25/F26) → riesgo de sobregasto real.
- **Cifras sembradas presentadas como "confirmadas y conciliadas con Ágora"** (`crRender` · F46): food cost 26%, personal estimado, fijos aprox., cierre con doble IVA — sin marca que lo advierta.
- **Severidad:** 🟠 alta. **Impacto:** decisiones de precio, margen, contratación e inversión sobre números falsos.

## R3 · Ausencia de controles contables básicos

- **Sin amortización, sin impuesto sobre el beneficio, sin coste financiero real** (interés del préstamo sembrado a 0%): el P&L no llega a un beneficio neto real.
- **Sin conciliación bancaria** (`treasury.js`): el saldo de banco/caja es un **número tecleado a mano** y es la **fuente única** de liquidez, patrimonio neto, runway y valor de empresa. Los movimientos marcados "hecho" no actualizan el saldo.
- **Arqueo de caja huérfano** (`cierre-caja.js`): los descuadres de efectivo/tarjeta **no los consume ningún motor** del P&L; las tolerancias (1 €/5 €) absorben faltantes **sin registrarlos** → el netting entre métodos de pago puede enmascarar robo/faltante.
- **Sin devengo laboral** (pagas extra/vacaciones): infradotación del 16,67% del coste de personal.
- **Severidad:** 🟠 alta (fiabilidad y cumplimiento). **Nota:** la valoración de existencias usa "último precio" (no PMP ni FIFO), no conforme al PGC (F23).

## R4 · Datos estimados/sembrados presentados como confirmados

- Food cost **26% macro** sembrado que pisa el food cost real de escandallos si no se borra (F13); personal **2.500 €** (Daniel sin confirmar por nómina, F49); **interés 0%** "del banco"; fijos aproximados; cierre de septiembre con doble IVA. **75 datos** catalogados como estimados/sembrados (ver 05).
- **Riesgo:** confundir una estimación con un hecho al decidir. **Mitigación obligatoria:** marcar visualmente *estimado* vs *confirmado* y registrar en auditoría los overrides (hoy no dejan rastro · F47).

## R5 · Riesgo meta: la app no avisa cuando le faltan datos

- **Prueba de datos incompletos: SUSPENSO PARCIAL** — con **escandallos, nóminas o gastos fijos ausentes**, Control M **presenta un beneficio/EBITDA "definitivo"** aunque sea incorrecto (falla en 3 de 5 inputs esenciales). Un cerebro financiero debe degradar a *estimado / aviso*, nunca mostrar como cerrado lo que no lo es. **Severidad:** 🟠 alta (induce confianza injustificada).

## R6 · Integración de Ágora (ingresos, la cifra más sensible)

- **Doble conteo entre vías** (conector + puente de import · F36): la misma venta contada dos veces si ambas vías cubren el periodo.
- **Descuento global de documento no restado** (F35): sobre-declaración de ingresos (raíz del cuadre 1055/1035).
- **CSV plano**: punto decimal → ×100 (F37); devoluciones con cantidad negativa que **suman** ingreso (F38). Condicionados al formato del export.
- **Severidad:** 🟠 alta y **condicionada a la operativa real** de importación.

---

### Mapa de calor (resumen)

| Riesgo | Gravedad | Probabilidad | ¿Verificable el € hoy? |
|--------|----------|--------------|------------------------|
| R1 Pérdida/corrupción de datos | 🔴 Crítica | Media-alta | Parcial (mecanismo sí, € con datos reales) |
| R2 Cifras engañosas para decidir | 🟠 Alta | Alta (uso diario) | % sí, € con datos reales |
| R3 Controles contables ausentes | 🟠 Alta | Cierta (estructural) | Con criterio del asesor |
| R4 Estimado presentado como confirmado | 🟠 Alta | Cierta | Con nóminas/facturas reales |
| R5 No avisa de datos faltantes | 🟠 Alta | Cierta | Confirmado (comportamiento) |
| R6 Ágora (ingresos) | 🟠 Alta | Condicionada | Con export real |

> El detalle por hallazgo (con prueba reproducible y corrección) está en **02_ERRORES_DETECTADOS.md**. El plan priorizado para cerrarlos, en **06_PLAN_DE_CORRECCION.md**.
