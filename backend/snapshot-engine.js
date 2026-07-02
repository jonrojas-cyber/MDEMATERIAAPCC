// SNAPSHOT ENGINE · fotos financieras diarias del negocio.
// La capa histórica que faltaba: convierte cada día en un registro comparable,
// habilitando tendencias, previsión y detección de anomalías (hoy y por IA mañana).
//
// Regla AI-Ready (ver GOVERNANCE.md): cada snapshot guarda historia, relaciones,
// timestamps y ownership (local_id), de modo que un modelo pueda entrenar y
// predecir sobre esta serie temporal sin cambiar el esquema.
//
// Idempotente: un único snapshot por local y día. Reutiliza los motores
// existentes (financials, business-health, treasury…): no recalcula dinero por su
// cuenta ni duplica fórmulas.

const store = require("./data-store");
const periods = require("./periods");
const financials = require("./financials");
const fixedCosts = require("./fixed-costs");
const health = require("./business-health");
const treasury = require("./treasury");
const debtsMod = require("./debts");
const { estadoStock } = require("./umbral");

const DAY = periods.DAY;
function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function ymd(t) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function snapId(localId, fechaYmd) { return `snap-${localId}-${fechaYmd}`; }

function existeDia(now = Date.now(), localId = "principal") {
  return store.findById("financial_snapshots", snapId(localId, ymd(now)));
}

// Construye (sin persistir) el snapshot del día a partir de los motores.
function construirSnapshot(now = Date.now(), localId = "principal") {
  const rHoy = periods.rango("hoy", now);
  const rSemana = periods.rango("semana", now);
  const patr = financials.patrimonioNeto(now);
  const benDia = financials.beneficio(rHoy, now);
  const costeDiario = financials.costeMedioDiario(now);
  const liq = treasury.liquidez();
  const runway = treasury.runway(liq.liquidez_inmediata, costeDiario);
  const saludObj = health.calcular(rSemana, now, { costeMedioDiario: costeDiario });
  const salud = saludObj.score;
  // Evolución por categoría: {financial: 72, cash_flow: 55, ...} para el histórico.
  const saludCategorias = {};
  (saludObj.categorias || []).forEach((c) => { if (c.score != null) saludCategorias[c.clave] = c.score; });
  const materias = store.readAll("materias");
  const stockCritico = materias.filter((m) => estadoStock(m) !== "correcto").length;
  const deuda = debtsMod.resumen(now);

  return {
    id: snapId(localId, ymd(now)),
    local_id: localId,                 // ownership (multi-local ready)
    fecha: ymd(now),                   // clave temporal (una por día)
    creado_en: new Date(now).toISOString(),
    // Salud y valor
    salud: salud,
    salud_categorias: saludCategorias, // evolución por categoría (AI-ready)
    patrimonio_neto: patr.patrimonio_neto,
    caja: patr.caja,
    banco: patr.banco,
    valor_almacen: patr.valor_almacen,
    valor_produccion: patr.valor_produccion,
    valor_activos: patr.valor_activos,
    deuda_total: deuda.deuda_total,
    cobros_pendientes: patr.cobros_pendientes,
    pagos_pendientes: patr.pagos_pendientes,
    // Día (hechos diarios; los agregados semanal/mensual/anual los deriva el
    // FinancialTimelineEngine desde esta serie — no se denormalizan por fila).
    ventas_dia: benDia.ventas,
    beneficio_dia: benDia.beneficio_operativo,
    coste_laboral_dia: benDia.coste_laboral,
    coste_materia_dia: benDia.coste_materia,      // food cost del día
    fixed_cost_dia: fixedCosts.totales(now).diario,
    variable_cost_dia: eur(financials.variablesEnRango(rHoy)),
    margen_dia: benDia.margen_operativo_pct,
    merma_dia: eur(financials.mermaEnRango(rHoy)),
    // Liquidez / supervivencia
    liquidez: liq.liquidez_inmediata,
    coste_medio_diario: eur(costeDiario),
    runway: runway,
    stock_critico: stockCritico,
    // Metadatos AI-ready
    updated_at: new Date(now).toISOString(),
    forecast_reference: null, // reservado para el modelo de previsión (ML futuro)
  };
}

// Captura idempotente del snapshot de hoy. Si ya existe, lo devuelve sin reescribir
// (los balances del día ya quedaron registrados en la primera lectura).
async function capturarDiario(now = Date.now(), localId = "principal") {
  const existente = existeDia(now, localId);
  if (existente) return { snapshot: existente, nuevo: false };
  const snap = construirSnapshot(now, localId);
  store.insert("financial_snapshots", snap);
  await store.flush();
  return { snapshot: snap, nuevo: true };
}

// Serie temporal de los últimos N días (para gráficas y análisis/IA).
function historico(dias = 90, localId = "principal") {
  const desde = ymd(Date.now() - dias * DAY);
  return store.readAll("financial_snapshots")
    .filter((s) => s.local_id === localId && s.fecha >= desde)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

// Tendencia: último snapshot frente a ~7 y ~30 días atrás, para métricas clave.
function tendencia(now = Date.now(), localId = "principal") {
  const serie = historico(60, localId);
  if (!serie.length) return { disponible: false };
  const ultimo = serie[serie.length - 1];
  const haceDias = (n) => {
    const objetivo = ymd(now - n * DAY);
    // el snapshot más cercano por debajo o igual a la fecha objetivo
    let cand = null;
    for (const s of serie) { if (s.fecha <= objetivo) cand = s; }
    return cand;
  };
  const cmp = (campo, ref) => {
    if (!ref || ref[campo] == null || ultimo[campo] == null) return null;
    const abs = eur(ultimo[campo] - ref[campo]);
    const pct = ref[campo] !== 0 ? Math.round(((ultimo[campo] - ref[campo]) / Math.abs(ref[campo])) * 100) : null;
    return { desde: ref[campo], hasta: ultimo[campo], abs, pct };
  };
  const ref7 = haceDias(7), ref30 = haceDias(30);
  return {
    disponible: true,
    dias_registrados: serie.length,
    semana: { salud: cmp("salud", ref7), patrimonio_neto: cmp("patrimonio_neto", ref7), ventas_dia: cmp("ventas_dia", ref7) },
    mes: { salud: cmp("salud", ref30), patrimonio_neto: cmp("patrimonio_neto", ref30) },
  };
}

module.exports = { capturarDiario, construirSnapshot, existeDia, historico, tendencia, ymd };
