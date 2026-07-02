// FINANCIALS · capa de composición. NO reimplementa dinero: orquesta costing.js
// (materia/stock/producción), fixed-costs, staff-finance, debts, assets y treasury
// para producir las tres cifras que importan: coste de abrir, patrimonio neto y
// beneficio real. Todo por periodo [desde, hasta) resuelto en periods.js.

const store = require("./data-store");
const costing = require("./costing");
const periods = require("./periods");
const fixedCosts = require("./fixed-costs");
const staff = require("./staff-finance");
const debtsMod = require("./debts");
const assetsMod = require("./assets");
const treasury = require("./treasury");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function enRango(fecha, r) { const t = new Date(fecha).getTime(); return Number.isFinite(t) && t >= r.desde && t < r.hasta; }

// Índices de producto para valorar el coste de lo vendido (reutiliza costing).
function indicesProducto() {
  const productos = store.readAll("productos");
  const byId = {}; const byName = {};
  productos.forEach((p) => { byId[p.id] = p; if (p.nombre) byName[p.nombre.toLowerCase()] = p; });
  return { byId, byName };
}

function ventasEnRango(r) {
  return store.readAll("ventas")
    .filter((v) => v.fecha && enRango(v.fecha, r))
    .reduce((s, v) => s + (Number(v.importe) || Number(v.total) || 0), 0);
}

function ticketsEnRango(r) {
  // Nº de tickets ≈ nº de líneas de venta distintas por documento; si no hay doc,
  // cuenta cada venta. Aproximación honesta con los datos disponibles.
  const ventas = store.readAll("ventas").filter((v) => v.fecha && enRango(v.fecha, r));
  const docs = new Set();
  let sinDoc = 0;
  ventas.forEach((v) => { const k = v.doc_clave || v.doc_number; if (k) docs.add(String(k)); else sinDoc++; });
  return docs.size + sinDoc;
}

function costeMateriaVendidaEnRango(r, idxMat, idxProd) {
  const { byId, byName } = idxProd;
  return store.readAll("ventas")
    .filter((v) => v.fecha && enRango(v.fecha, r))
    .reduce((s, v) => {
      const p = byId[v.producto_id] || byName[String(v.producto || "").toLowerCase()];
      return s + (p ? costing.costeProducto(p, idxMat) * (Number(v.cantidad) || 0) : 0);
    }, 0);
}

function mermaEnRango(r) {
  return store.readAll("ajustes")
    .filter((a) => a.fecha && enRango(a.fecha, r))
    .reduce((s, a) => s + (Number(a.coste_estimado) || 0), 0);
}

function comprasEnRango(r) {
  return store.readAll("recepciones")
    .filter((x) => x.fecha && enRango(x.fecha, r))
    .reduce((s, x) => s + (Number(x.importe_total) || 0), 0);
}

// Gastos variables puntuales registrados en el rango (no ligados a recepción).
function variablesEnRango(r) {
  return store.readAll("variable_costs")
    .filter((x) => x.fecha && enRango(x.fecha, r) && x.active !== false)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
}

// ── COSTE DE ABRIR LA PERSIANA ──────────────────────────────────────────────
// El coste de EXISTIR en el periodo: costes fijos prorrateados + coste laboral +
// gastos variables puntuales. NO incluye materia prima (es variable con la venta)
// ni cuota de deuda (es financiación, se ve en Tesorería/Deuda).
function costeDeAbrir(r, now = Date.now()) {
  const fijo = fixedCosts.costeEnRango(r, now);
  const laboral = staff.costeEnRango(r);
  const variable = variablesEnRango(r);
  const total = eur(fijo.total + laboral + variable);
  return {
    total,
    personal: eur(laboral),
    fijos: eur(fijo.recurrente),
    fijos_puntuales: eur(fijo.puntual),
    variables: eur(variable),
    dias: fijo.dias,
    por_categoria: fixedCosts.porCategoria(now),
    prorrateo: fixedCosts.totales(now),
  };
}

// ── PATRIMONIO NETO ─────────────────────────────────────────────────────────
function patrimonioNeto(now = Date.now()) {
  const materias = store.readAll("materias");
  const idxMat = costing.indiceMaterias(materias);
  const liq = treasury.liquidez();
  const pend = treasury.pendientes(now);
  const valorAlmacen = costing.valorStock(materias);
  const valorProduccion = costing.valorProduccion(null, null, idxMat);
  const activos = assetsMod.resumen(now).valor_total;
  const deuda = debtsMod.resumen(now).deuda_total;
  const cobros = pend.cobros_pendientes;
  const pagos = pend.pagos_pendientes + pend.iva_pendiente + pend.irpf_pendiente + pend.ss_pendiente;
  const patrimonio = eur(liq.caja + liq.banco + valorAlmacen + valorProduccion + activos + cobros - deuda - pagos);
  return {
    caja: liq.caja, banco: liq.banco,
    valor_almacen: valorAlmacen, valor_produccion: valorProduccion, valor_activos: activos,
    cobros_pendientes: cobros, deuda_pendiente: deuda, pagos_pendientes: eur(pagos),
    patrimonio_neto: patrimonio,
  };
}

// ── BENEFICIO REAL ──────────────────────────────────────────────────────────
function beneficio(r, now = Date.now()) {
  const materias = store.readAll("materias");
  const idxMat = costing.indiceMaterias(materias);
  const idxProd = indicesProducto();
  const ventas = eur(ventasEnRango(r));
  const costeMateria = eur(costeMateriaVendidaEnRango(r, idxMat, idxProd));
  const laboral = eur(staff.costeEnRango(r));
  const variables = eur(variablesEnRango(r) + mermaEnRango(r));
  const fijos = eur(fixedCosts.costeEnRango(r, now).recurrente);
  const operativo = eur(ventas - costeMateria - laboral - variables - fijos);
  // Beneficio neto estimado: operativo menos intereses de deuda imputables al
  // periodo (proporción de la cuota mensual). Etiquetado como estimación.
  const cuotaMensual = debtsMod.resumen(now).cuota_mensual_total;
  const dias = (r.hasta - r.desde) / 86400000;
  const interesesPeriodo = eur(cuotaMensual * (dias / (365 / 12)) * 0.3); // ~30% de la cuota como interés estimado
  const neto = eur(operativo - interesesPeriodo);
  return {
    ventas, coste_materia: costeMateria, coste_laboral: laboral,
    gastos_variables: variables, gastos_fijos: fijos,
    beneficio_operativo: operativo,
    intereses_estimados: interesesPeriodo,
    beneficio_neto_estimado: neto,
    food_cost_pct: ventas > 0 ? Math.round((costeMateria / ventas) * 100) : null,
    coste_laboral_pct: ventas > 0 ? Math.round((laboral / ventas) * 100) : null,
    margen_operativo_pct: ventas > 0 ? Math.round((operativo / ventas) * 100) : null,
  };
}

// Coste medio diario de operar (para el runway): fijos + laboral + media diaria
// de materia consumida (últimos 30 días, con fallback a compras).
function costeMedioDiario(now = Date.now()) {
  const fijoDiario = fixedCosts.totales(now).diario;
  const laboralDiario = staff.costeDiarioTotal();
  const r30 = { desde: now - 30 * 86400000, hasta: now };
  const materias = store.readAll("materias");
  const idxMat = costing.indiceMaterias(materias);
  const idxProd = indicesProducto();
  let materiaDiaria = costeMateriaVendidaEnRango(r30, idxMat, idxProd) / 30;
  if (!(materiaDiaria > 0)) materiaDiaria = comprasEnRango(r30) / 30;
  return eur(fijoDiario + laboralDiario + materiaDiaria);
}

// ── EXTRAS FINANCIEROS DEL SNAPSHOT EJECUTIVO ───────────────────────────────
// Burn mensual (dinero que sale sí o sí, SIN materia — que escala con la venta),
// nómina esperada, coste fijo esperado y EBITDA (preparado: el add-back de
// amortización es 0 hasta que los activos amorticen en la cuenta de resultados).
function extrasFinancieros(now = Date.now()) {
  const fijo = fixedCosts.totales(now);
  const laboralDiario = staff.costeDiarioTotal();
  const MES = 365 / 12;
  const benMes = beneficio(periods.rango("mes", now), now);
  return {
    monthly_burn: eur((fijo.diario + laboralDiario) * MES),
    expected_payroll: eur(laboralDiario * MES),
    expected_fixed_costs: fijo.mensual,
    beneficio_mes: benMes.beneficio_operativo,
    margen_mes_pct: benMes.margen_operativo_pct,
    ebitda_mes: benMes.beneficio_operativo, // EBITDA-ready (ver comentario)
  };
}

module.exports = {
  ventasEnRango, ticketsEnRango, costeMateriaVendidaEnRango, mermaEnRango, comprasEnRango, variablesEnRango,
  costeDeAbrir, patrimonioNeto, beneficio, costeMedioDiario, extrasFinancieros, indicesProducto, eur,
};
