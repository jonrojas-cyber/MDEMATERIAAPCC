# Control M · Sistema Operativo del Negocio — Documento completo para análisis externo

> **Objetivo de este documento:** describir de forma exhaustiva **qué es y qué hace**
> la aplicación en su estado actual (versión **v99**), su arquitectura, modelo de
> datos, API, pantallas, sistema de diseño e inteligencia, para que un analista
> externo (p. ej. ChatGPT) proponga mejoras concretas de producto, UX, arquitectura
> y negocio.
>
> Al final hay una sección **"Preguntas para el analista"** con lo que más nos interesa.
>
> **Novedad principal desde el análisis anterior:** Control M ha dejado de ser solo
> una app de producción/APPCC y se ha convertido en un **Sistema Operativo del
> Negocio para hostelería**, con un **Centro de Control** financiero para el
> propietario. Ver §3.

---

## 1. Resumen ejecutivo

**Control M** es el sistema operativo de una cafetería de especialidad —**"m de
materia"** (Málaga)—. Dos perfiles, una sola app:

- **Trabajador (modo operación):** rutina de apertura/cierre, producción del día,
  temperaturas APPCC, recepción de albaranes, inventario físico, mermas. Simple,
  sin datos financieros.
- **Propietario (modo control):** el **Centro de Control** — la primera pantalla
  que abre cada mañana para entender toda la empresa en 30 segundos: salud del
  negocio, beneficio real, coste de abrir, valor de la empresa, tesorería, deuda,
  equipo, capital parado, objetivos y un copiloto que sugiere acciones.

**Norte del producto:** *"máxima rentabilidad con mínimo esfuerzo cognitivo"*.
**Filosofía del Centro de Control:** *"cada euro, cada empleado, cada producto,
cada stock, cada deuda, cada coste, cada activo y cada riesgo operativo debe ser
visible, medible, comparable y accionable"*. La app responde a una pregunta:
*"¿cuánto vale y cómo está mi negocio hoy, y qué debo hacer para que mañana sea
más fuerte?"*.

**Objetivo comercial:** producto **vendible a otros locales** de hostelería.

**Usuarios reales:** 2 administradores (Jon y Mónica) y 1 trabajadora (Lara).

---

## 2. Arquitectura técnica

### Stack
- **Backend:** Node.js + Express. **37 módulos de dominio** + **37 routers**.
- **Frontend:** un **único fichero** `frontend/index.html` (~5.600 líneas) con
  HTML + CSS + JS embebidos. SPA artesanal, sin build, sin framework.
- **Persistencia dual:** ficheros **JSON** (`backend/data/*.json`, una "tabla" por
  fichero) o **PostgreSQL** vía `DATABASE_URL`. Misma API a través de
  `backend/data-store.js` (CRUD por fila, `flush()`, `transaction()` atómica).
- **Despliegue:** Render (deploy hook al hacer push a `main`).
- **Integración TPV:** conector local (Node sin dependencias) que empuja las
  ventas del TPV **Ágora** a `/agora/ingest` con token (`X-Connector-Token`).

### Principios de diseño de código (importantes para el análisis)
- **Fuente única de la verdad para el dinero:** `backend/costing.js`. Todo cálculo
  base de coste/margen/food cost/valor de stock/valor de producción sale de ahí.
- **Capa financiera que COMPONE, no duplica:** los módulos del Centro de Control
  (`financials.js`, `business-health.js`, etc.) orquestan `costing.js` + costes
  fijos + deuda + activos + tesorería. Ninguna fórmula de dinero está duplicada.
- **Clasificación de materias** centralizada en `clasificador.js`; **umbrales de
  stock** en `umbral.js`; **periodos de tiempo** en `periods.js`.
- **Seguridad por rol:** el middleware `auth.requerido` bloquea a los no-admin en
  cualquier segmento de ruta que no esté en `EQUIPO_ALLOWED`. Todos los segmentos
  financieros quedan fuera → **admin-only automático**, reforzado con un guard
  explícito en cada ruta.

---

## 3. ⭐ CENTRO DE CONTROL · Sistema Operativo del Negocio (novedad)

La evolución más importante. Pantalla del propietario, admin-only, con un **filtro
de tiempo** (Hoy · Semana · Mes · Año · Personalizado) donde **la semana SIEMPRE
empieza en lunes**, y cada cifra se compara con el **periodo anterior**.

### Bloques (tarjetas premium, números grandes, sin tablas)
1. **Salud del negocio** — nota 0–100 con razones (liquidez, rentabilidad, coste
   laboral, food cost, inventario, merma, deuda, APPCC), y variación vs anterior.
2. **Beneficio real** — ventas − materia − personal − variables − fijos =
   beneficio operativo; y beneficio neto estimado (con intereses de deuda). Se
   prioriza el beneficio, no las ventas.
3. **Coste de abrir la persiana** — coste de existir: fijos prorrateados + personal
   + variables, por día/semana/mes/año, con "necesitas vender X para cubrirlo".
4. **Valor de la empresa (patrimonio neto)** = caja + banco + almacén + producción
   + activos + cobros − deuda − pagos pendientes.
5. **Tesorería** — liquidez, cobros/pagos e impuestos pendientes, próximos
   movimientos y **"días de supervivencia"** (runway = liquidez / coste medio diario).
6. **Deuda** — préstamos, leasing, renting, tarjetas, deuda fiscal y con Seguridad
   Social; cuota mensual, intereses estimados, próximos vencimientos, cuotas restantes.
7. **Equipo** — nº de empleados, estados (trabajando/libre/vacaciones/baja), coste
   laboral por día/semana/mes/año. Degrada con elegancia si faltan datos de RRHH.
8. **Capital parado** — dinero inmovilizado en almacén: por categoría, en
   frío/seco/bebidas/limpieza, sin rotación, a punto de caducar, perdido por merma,
   rotación y días medios de stock.
9. **Objetivos** — metas configurables (ventas, food cost, coste laboral, merma,
   ticket medio, reserva de caja…) con barras de progreso.
10. **Copiloto** — frases accionables que **solo hablan si hay señal**: "Hoy abrir
    cuesta 642 €, necesitas vender 1.840 €", "El coste laboral está 4,2% por
    encima del objetivo", "Tu liquidez permite operar 64 días sin ingresos", etc.

### Pantallas de detalle y CRUD (dentro del Centro de Control)
- **Costes fijos** (CRUD, con prorrateo automático a día/semana/mes/año).
- **Deuda** (CRUD, con estimación de cuotas e intereses).
- **Activos** (CRUD, con amortización lineal y garantías por vencer).
- **Objetivos** (CRUD).
- **Tesorería** (cuentas caja/banco + movimientos cobro/pago).
- **Análisis y tendencias** (el antiguo "Panel del propietario", ahora unificado
  como detalle: mermas, top productos, compras por proveedor, balance, descuadre).
- **Calendario de empresa** — vista semanal (lunes→domingo) que unifica eventos
  operativos y financieros: producciones, pedidos, recepciones, pagos, cobros,
  vencimientos de deuda, APPCC, caducidades, vacaciones/bajas.
- **¿Cómo estaba mi empresa?** — máquina del tiempo: reconstruye el estado del
  negocio a una fecha pasada (ventas, stock, deudas, costes, activos, empleados).

### Módulos backend de la capa financiera (todos componen costing.js)
`periods.js` (rangos con semana en lunes + comparativos) · `fixed-costs.js`
(prorrateo) · `debts.js` · `assets.js` · `treasury.js` (liquidez + runway) ·
`staff-finance.js` (coste laboral con fallback) · `targets.js` · `financials.js`
(coste de abrir, patrimonio neto, beneficio real) · `inventory-capital.js` ·
`business-health.js` (nota 0–100) · `copilot.js` · `business-calendar.js` ·
`time-machine.js` · `executive-dashboard.js` (ensambla todo).

### Nota de rendimiento
El ensamblado del dashboard calcula el beneficio **una sola vez** y lo reparte a
salud, comparativos y objetivos (memoización por periodo), en lugar de re-escanear
las ventas por cada consumidor. Coste medio diario y patrimonio se calculan una vez.

---

## 4. Modelo de datos (37 entidades)

**Operación / producción (las de siempre):** `materias`, `productos`, `recetas`,
`lotes`, `preparaciones`, `revisiones` (APPCC), `ajustes` (mermas), `inventarios`
(recuento físico vs teórico), `proveedores`, `compras_productos`,
`precios_historico`, `recepciones`, `pedidos`, `pagos`/`justificantes`,
`etiquetas`/`impresiones`, `ventas`, `docs_agora` (idempotencia Ágora),
`sincronizaciones`, `stock_movements` (libro de movimientos), `consumos`,
`recetario_cafe`, `apertura` (checklist), `usuarios` (PIN hasheado, roles),
`auditoria`, `config`, `push_subs`.

**Capa financiera / Centro de Control (nuevas):** `fixed_costs`, `variable_costs`,
`debts`, `assets`, `financial_accounts` (caja/banco), `treasury_movements`,
`business_targets`, `staff_finance`, `financial_snapshots` (base para la máquina
del tiempo), `executive_notes`.

**Regla de oro del stock:** ninguna variación de `disponibilidad_actual` ocurre sin
un registro en `stock_movements` (venta, recepción, merma, inventario, producción).

**Ejemplo — coste fijo:** `{ name, category, amount, vat, periodicity
(daily/weekly/monthly/quarterly/yearly/one_time), start_date, end_date,
payment_day, provider, payment_method, bank_account, is_direct_debit, notes,
active }`. El sistema prorratea automáticamente a día/semana/mes/año.

**Ejemplo — deuda:** `{ name, lender, type (loan/credit_line/leasing/renting/
credit_card/supplier_debt/tax_debt/social_security/other), initial_amount,
outstanding_amount, interest_rate, monthly_payment, start_date, end_date,
payment_day, status, notes }`.

Los costes fijos y objetivos vienen con **semilla editable** (alquiler 550 €,
gestoría, luz, agua, seguro; objetivos de ventas/food cost/laboral/merma/ticket);
son registros editables, no verdad fija. Deuda, activos y cuentas empiezan vacíos
con estados vacíos en español y **fallbacks elegantes**.

---

## 5. API HTTP (37 áreas bajo /api)

Todas exigen sesión (JWT) salvo `/salud` y `/auth/login`. **Las financieras son
admin-only.**

**Centro de Control (admin-only):**
```
GET  /executive-dashboard?preset=hoy|semana|mes|anio|personalizado
GET  /financials  · /financials/cost-of-opening · /net-worth · /profit
GET/POST/PUT/DELETE  /fixed-costs
GET/POST/PUT/DELETE  /debts
GET/POST/PUT/DELETE  /assets
GET  /treasury  · POST /treasury/cuenta · /treasury/movimiento
GET/POST/PUT/DELETE  /targets
GET  /business-health   · GET /business-calendar?offset=
GET  /business-time-machine?date=YYYY-MM-DD
```
**Operación (equipo + admin):** `/inicio` `/decisiones` `/prevision` `/materias`
`/recetas` `/lotes` `/preparaciones` `/revisiones` `/recetario-cafe` `/apertura`
`/ajustes` `/inventario` `/carta` `/etiquetas`.
**Compras/ventas/admin:** `/proveedores` `/compras-productos` `/recepciones`
`/pedidos` `/pagos` `/ventas` `/analitica` `/reportes` `/avisos` `/auditoria`
`/calendario`.

---

## 6. Pantallas y flujos (frontend)

### Rutina de apertura (lo primero al entrar, para el trabajador)
Saludo por hora + nombre + "Bienvenido a materia" + frase motivacional diaria que
resalta una cualidad de la persona. Lista ordenada de arranque: luces → café →
**calibrar cafés** (Colombia 32s, Brasil 28s) → **temperaturas APPCC de 5 equipos**
→ fechas de caducidad → carros → producción → limpieza → terraza → playlist →
**8:00 abrir puertas ("¡que empiece la función!")**. También rutina de cierre.

### Dashboard (home)
4 bloques 2×2 sin scroll: **ALERTAS · PRODUCCIÓN · MATERIA · APPCC**. Para admin,
una entrada limpia a **Centro de control** (única sala de mando del propietario) e
**Informes y configuración**.

### Aviso diario de compras (16:00)
Los pedidos **no** salen en Tareas; cada día a las 16:00 se genera una alerta de qué
falta, **clasificada por proveedor** (no por producto).

---

## 7. Sistema de diseño

- **Monocromo por decisión de producto.** Toda la tinta es el mismo color
  (`#2A332B`); fondos crema/papel; texto atenuado. La **severidad se comunica por
  peso tipográfico, posición y jerarquía**, no por color. Única excepción: un rojo
  (`#b5462a`) para seguridad alimentaria.
- **Tipografía:** `'Courier New', monospace` — estética "sistema rtd 01".
- **Submenús** en rejilla cuadrada que llena la pantalla sin scroll; botones
  cuadrados como la portada.
- El Centro de Control usa tarjetas premium (número grande, comparación debajo,
  cero tablas en la primera pantalla), coherente con el monocromo.

---

## 8. Integraciones
Ágora (TPV, estructura Invoice→InvoiceItems→Lines, descuenta stock por escandallo,
idempotente, emparejamiento por **nombre exacto**) · PostgreSQL · Web Push (VAPID)
· Email (justificantes) · OCR de albaranes (detección de unidad y conversión) ·
PDF (archivo trimestral para gestoría, export APPCC para inspección).

---

## 9. Inteligencia y automatización
- **Previsión de demanda por día de la semana** (aprende del histórico; cruza
  demanda con stock y recomienda qué producir).
- **Centro de decisiones** (acciones/riesgos/oportunidades del momento).
- **Insights de operación** ("estás tirando demasiado X", subida de precio de
  proveedor, merma oculta del recuento…).
- **Copiloto financiero** (coste de abrir, coste laboral vs objetivo, runway,
  proyección de beneficio, presión de deuda…). Todo solo habla si hay señal real.
- **Salud del negocio 0–100** con razones y comparativo.
- **Inventario físico vs teórico** (descuadre y merma oculta).
- **Máquina del tiempo** (reconstrucción histórica por fecha).

---

## 10. Testing
- **8 suites unitarias** (node assert): persistencia, Ágora, unidades, calendario,
  compras, previsión, insights y **finanzas** (periodos con semana en lunes,
  prorrateo, coste de abrir, patrimonio, deuda, runway, salud).
- **31 tests E2E** (Playwright) contra el servidor real, incluidos: el admin abre
  el Centro de Control con todos los bloques, **el trabajador recibe 403 en todos
  los endpoints financieros**, el filtro de tiempo con semana en lunes, y alta de
  coste fijo y de deuda por interfaz.

---

## 11. Seguridad y cumplimiento
PIN hasheado, bloqueo por intentos, roles admin/equipo, auditoría de acciones
críticas. **Los datos financieros son admin-only** (segmento fuera de
`EQUIPO_ALLOWED` + guard explícito). APPCC con rangos legales y export para
inspección; alérgenos según Reglamento UE 1169/2011.

---

## 12. Estado actual y trabajo pendiente conocido

**Hecho y desplegado (v99):** Centro de Control completo (10 bloques + detalles +
CRUD), capa financiera que compone costing.js, 10 entidades nuevas, filtro de
tiempo con semana en lunes, unificación con el antiguo panel, y optimización del
ensamblado del dashboard. Antes: Recetas Pro (alérgenos), export APPCC para
Sanidad, inventario físico vs teórico, panel del propietario, insights.

**Pendiente / decisiones abiertas:**
- **RRHH real** (fichajes/turnos) para que el coste laboral, ventas por empleado y
  productividad sean exactos en vez de estimados.
- **Snapshots financieros automáticos** para que la máquina del tiempo sea 100%
  precisa (hoy estima el stock pasado con el valor actual).
- **Multi-local (`local_id` en todas las entidades)** para vender a cadenas.
- Capturar de Ágora **método de pago y descuentos** (los datos existen, no se
  guardan aún).
- Tesorería semi-automática (previsión de IVA/IRPF/SS a partir de ventas y nóminas).

---

## 13. Preguntas para el analista (lo que más nos interesa)

1. **Centro de Control / UX del propietario:** ¿La primera pantalla comunica de
   verdad el estado del negocio en 30 segundos? ¿Qué bloque sobra, cuál falta y en
   qué orden deberían ir para un dueño de cafetería con prisa?
2. **Salud del negocio (0–100):** ¿Es razonable el modelo de señales y pesos
   (liquidez, rentabilidad, laboral, food cost, inventario, merma, deuda, APPCC)?
   ¿Cómo lo harías más creíble y menos "caja negra"?
3. **Vendibilidad:** para vender esto a otro café de especialidad, ¿qué 3 funciones
   provocan el "esto lo necesito ya" y cuáles distraen?
4. **Finanzas:** ¿Ves algún error conceptual en cómo separamos coste de abrir
   (fijos+personal) del beneficio (que sí resta materia) y de la deuda (financiación,
   fuera del coste de abrir)? ¿El runway y el patrimonio neto están bien planteados?
5. **Datos/inteligencia:** con los datos que ya tenemos (ventas, mermas, precios,
   inventario, costes fijos, deuda), ¿qué otros insights de alto valor derivarías?
6. **Arquitectura:** frontend de ~5.600 líneas en un solo HTML sin build y backend
   con 37 módulos/rutas: ¿cuándo y cómo modularizar sin sobre-ingeniería?
7. **Riesgos:** puntos débiles en persistencia, seguridad, idempotencia de Ágora,
   el emparejamiento por nombre exacto, o el hecho de que RRHH y snapshots aún sean
   estimaciones.
8. **Pricing/negocio:** modelo de precio (SaaS por local, por volumen, por módulos)
   y qué métricas medir para demostrar el ROI al cliente.

---

*Documento generado a partir del código fuente actual del repositorio (v99).
Refleja el estado real de la app en el momento de exportarlo.*
