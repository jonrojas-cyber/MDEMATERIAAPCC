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

// IVA de venta por defecto en hostelería (España): 10%. El titular de "ventas" se
// muestra en BRUTO (cuadra con Ágora/TPV), pero el P&L (beneficio, food cost, margen)
// se calcula sobre la base SIN IVA: el IVA repercutido no es ingreso.
const IVA_VENTA_DEF = 0.10;
function netoDeVenta(v) {
  if (v.importe_neto != null && v.importe_neto !== "") return Number(v.importe_neto) || 0;
  const bruto = Number(v.importe) || Number(v.total) || 0;
  const iva = (v.iva != null && v.iva !== "" && Number(v.iva) >= 0 && Number(v.iva) < 1) ? Number(v.iva) : IVA_VENTA_DEF;
  return bruto / (1 + iva);
}
function ventasNetasEnRango(r) {
  return store.readAll("ventas")
    .filter((v) => v.fecha && enRango(v.fecha, r))
    .reduce((s, v) => s + netoDeVenta(v), 0);
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
  const seg = fixedCosts.costeEnRangoSegmentado(r, now);
  // Personal = fijos de categoría "Personal" + módulo staff (capa aditiva opcional).
  const laboral = eur(seg.personal + seg.personal_puntual + staff.costeEnRango(r));
  const variable = variablesEnRango(r);
  const total = eur(seg.otros + seg.otros_puntual + laboral + variable);
  return {
    total,
    personal: laboral,
    fijos: seg.otros,
    fijos_puntuales: seg.otros_puntual,
    variables: eur(variable),
    dias: seg.dias,
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
  const ventas = eur(ventasEnRango(r));            // BRUTO (con IVA) → titular, cuadra con Ágora/TPV
  const ventasNetas = eur(ventasNetasEnRango(r));  // SIN IVA → base real del P&L
  const costeMateria = eur(costeMateriaVendidaEnRango(r, idxMat, idxProd)); // coste NETO (sin IVA)
  // Segmentación única: personal (categoría "Personal") vs otros fijos. El personal
  // deja de estar enterrado dentro de "gastos_fijos" y el ratio laboral deja de ser 0.
  const seg = fixedCosts.costeEnRangoSegmentado(r, now);
  const laboral = eur(seg.personal + staff.costeEnRango(r));
  const variables = eur(variablesEnRango(r) + mermaEnRango(r));
  const fijos = eur(seg.otros);
  // El beneficio se calcula sobre ventas NETAS (el IVA repercutido no es ingreso) y
  // coste neto: así deja de estar inflado y el food cost cuadra con el de la carta.
  const base = ventasNetas;
  const operativo = eur(base - costeMateria - laboral - variables - fijos);
  // Beneficio neto estimado: operativo menos intereses de deuda imputables al
  // periodo (proporción de la cuota mensual). Etiquetado como estimación.
  const cuotaMensual = debtsMod.resumen(now).cuota_mensual_total;
  const dias = (r.hasta - r.desde) / 86400000;
  const interesesPeriodo = eur(cuotaMensual * (dias / (365 / 12)) * 0.3); // ~30% de la cuota como interés estimado
  const neto = eur(operativo - interesesPeriodo);
  return {
    ventas, ventas_netas: ventasNetas, coste_materia: costeMateria, coste_laboral: laboral,
    gastos_variables: variables, gastos_fijos: fijos,
    beneficio_operativo: operativo,
    intereses_estimados: interesesPeriodo,
    beneficio_neto_estimado: neto,
    food_cost_pct: base > 0 ? Math.round((costeMateria / base) * 100) : null,
    coste_laboral_pct: base > 0 ? Math.round((laboral / base) * 100) : null,
    // Prime cost = materia + personal (la cifra que los hosteleros vigilan; objetivo ~60-65%).
    prime_cost: eur(costeMateria + laboral),
    prime_cost_pct: base > 0 ? Math.round(((costeMateria + laboral) / base) * 100) : null,
    gastos_fijos_pct: base > 0 ? Math.round((fijos / base) * 100) : null,
    margen_operativo_pct: base > 0 ? Math.round((operativo / base) * 100) : null,
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
  const seg = fixedCosts.totalesSegmentado(now);
  const laboralDiario = seg.personal.diario + staff.costeDiarioTotal();
  const MES = 365 / 12;
  const benMes = beneficio(periods.rango("mes", now), now);
  return {
    // Burn mensual = todo lo que sale sí o sí (personal + otros fijos), SIN materia.
    monthly_burn: eur((seg.total.diario + staff.costeDiarioTotal()) * MES),
    expected_payroll: eur(laboralDiario * MES),      // nómina esperada (ya separada de los fijos)
    expected_fixed_costs: seg.otros.mensual,         // otros fijos, SIN personal
    beneficio_mes: benMes.beneficio_operativo,
    margen_mes_pct: benMes.margen_operativo_pct,
    ebitda_mes: benMes.beneficio_operativo, // EBITDA-ready (ver comentario)
  };
}

module.exports = {
  ventasEnRango, ventasNetasEnRango, netoDeVenta, ticketsEnRango, costeMateriaVendidaEnRango, mermaEnRango, comprasEnRango, variablesEnRango,
  costeDeAbrir, patrimonioNeto, beneficio, costeMedioDiario, extrasFinancieros, indicesProducto, eur,
};
