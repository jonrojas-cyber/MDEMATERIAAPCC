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

const { eur, pctDe } = require("./fmt"); // formato único (dinero.9): % a 1 decimal
function enRango(fecha, r) { const t = new Date(fecha).getTime(); return Number.isFinite(t) && t >= r.desde && t < r.hasta; }

// Índices de producto para valorar el coste de lo vendido (reutiliza costing).
function indicesProducto() {
  const productos = store.readAll("productos");
  const byId = {}; const byName = {};
  productos.forEach((p) => { byId[p.id] = p; if (p.nombre) byName[p.nombre.toLowerCase()] = p; });
  return { byId, byName };
}

// Tipo de impuesto sobre el beneficio (PROVISIÓN, dinero.1). Config editable
// `impuesto_beneficio_pct`; por defecto 15% (tipo reducido de sociedad nueva, orientativo).
// Es una estimación para provisionar el impuesto, NO un cálculo fiscal: el régimen real
// (IRPF de actividad si es autónoma, o Impuesto de Sociedades si es SL) lo fija la gestoría.
const IMPUESTO_PCT_DEFECTO = 15;
function impuestoBeneficioPct() {
  const c = (store.readAll("config") || []).find((x) => x && x.id === "impuesto_beneficio_pct");
  const v = c ? Number(c.valor) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : IMPUESTO_PCT_DEFECTO;
}

function ventasEnRango(r) {
  return store.readAll("ventas")
    .filter((v) => v.fecha && enRango(v.fecha, r))
    .reduce((s, v) => s + (Number(v.importe) || Number(v.total) || 0), 0);
}

// IVA de venta por defecto en hostelería (España): 10%. El titular de "ventas" se
// muestra en BRUTO (cuadra con Ágora/TPV), pero el P&L (beneficio, food cost, margen)
// se calcula sobre la base SIN IVA: el IVA repercutido no es ingreso.
const IVA_VENTA_DEF = require("./iva").IVA_VENTA; // fuente única (dinero.8)
function netoDeVenta(v) {
  if (v.importe_neto != null && v.importe_neto !== "") return Number(v.importe_neto) || 0;
  const bruto = Number(v.importe) || Number(v.total) || 0;
  // IVA de venta ÚNICO al 10% para todo (decisión de la fundadora): no se aplica ningún
  // tipo por línea. importe_neto (la Base de Ágora) sigue mandando cuando viene.
  return bruto / (1 + IVA_VENTA_DEF);
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

// Coste de PERSONAL de fuente ÚNICA (anti doble-conteo · L8). Si hay staff_finance
// (nóminas), MANDA: los costes fijos de categoría "Personal" NO se suman encima (sería
// contar el personal dos veces, +57 k€/año en el peor caso). Si no hay staff, el personal
// son esos fijos (como hasta ahora). Así fixed_costs(Personal) y staff_finance nunca
// aportan a la vez. Devuelve también "otros" (fijos no-personal) para no recalcularlos.
function costeLaboralEnRango(r, now = Date.now()) {
  const seg = fixedCosts.costeEnRangoSegmentado(r, now);
  const hayStaff = (store.readAll("staff_finance") || []).some((s) => s && s.activo !== false);
  const personal = hayStaff ? eur(staff.costeEnRango(r)) : eur(seg.personal);
  return { personal, otros: eur(seg.otros), fuente: hayStaff ? "staff_finance" : "fixed_costs" };
}

// ── BENEFICIO REAL ──────────────────────────────────────────────────────────
function beneficio(r, now = Date.now()) {
  const materias = store.readAll("materias");
  const idxMat = costing.indiceMaterias(materias);
  const idxProd = indicesProducto();
  const ventas = eur(ventasEnRango(r));            // BRUTO (con IVA) → titular, cuadra con Ágora/TPV
  const ventasNetas = eur(ventasNetasEnRango(r));  // SIN IVA → base real del P&L
  const costeMateria = eur(costeMateriaVendidaEnRango(r, idxMat, idxProd)); // coste NETO (sin IVA)
  // Personal de FUENTE ÚNICA (anti doble-conteo · L8) y otros fijos. El personal deja
  // de estar enterrado dentro de "gastos_fijos" y el ratio laboral deja de ser 0.
  const lab = costeLaboralEnRango(r, now);
  const laboral = lab.personal;
  const variables = eur(variablesEnRango(r) + mermaEnRango(r));
  const fijos = lab.otros;
  // El beneficio se calcula sobre ventas NETAS (el IVA repercutido no es ingreso) y
  // coste neto: así deja de estar inflado y el food cost cuadra con el de la carta.
  const base = ventasNetas;
  const operativo = eur(base - costeMateria - laboral - variables - fijos);
  // Beneficio neto estimado: operativo menos intereses de deuda imputables al
  // periodo. El interés mensual se deriva de los DATOS de cada deuda (tipo real o
  // amortización), no de un 30% plano de la cuota (dinero.6). Sigue etiquetado como
  // estimación (intereses_estimados).
  const interesMes = debtsMod.interesMensualTotal(now);
  const dias = (r.hasta - r.desde) / 86400000;
  const interesesPeriodo = eur(interesMes * (dias / (365 / 12)));
  // Cascada hasta el beneficio NETO real (dinero.1): EBITDA − amortización = EBIT;
  // EBIT − intereses = BAI; BAI − impuesto = neto. Antes el "neto" era solo
  // operativo − intereses (sin amortización ni impuesto) y salía sobrevalorado.
  const amortizacion = assetsMod.amortizacionEnRango(r, now);
  const resultadoExplotacion = eur(operativo - amortizacion);  // EBIT (resultado de explotación)
  const bai = eur(resultadoExplotacion - interesesPeriodo);    // beneficio antes de impuestos
  const impuestoPct = impuestoBeneficioPct();
  const impuesto = bai > 0 ? eur(bai * impuestoPct / 100) : 0; // provisión solo sobre BAI positivo (sin impuesto sobre pérdidas)
  const neto = eur(bai - impuesto);                            // beneficio NETO (provisión de impuesto incluida)
  return {
    ventas, ventas_netas: ventasNetas, coste_materia: costeMateria, coste_laboral: laboral,
    gastos_variables: variables, gastos_fijos: fijos,
    beneficio_operativo: operativo,
    amortizacion,
    resultado_explotacion: resultadoExplotacion,
    intereses_estimados: interesesPeriodo,
    bai,
    impuesto,
    impuesto_pct: impuestoPct,
    beneficio_neto: neto,
    beneficio_neto_estimado: neto, // compat: ahora es el neto REAL (con amortización e impuesto)
    food_cost_pct: pctDe(costeMateria, base),
    coste_laboral_pct: pctDe(laboral, base),
    // Prime cost = materia + personal (la cifra que los hosteleros vigilan; objetivo ~60-65%).
    prime_cost: eur(costeMateria + laboral),
    prime_cost_pct: pctDe(costeMateria + laboral, base),
    gastos_fijos_pct: pctDe(fijos, base),
    margen_operativo_pct: pctDe(operativo, base),
  };
}

// Coste medio diario de operar (para el runway): fijos + laboral + media diaria
// de materia consumida (últimos 30 días, con fallback a compras).
function costeMedioDiario(now = Date.now()) {
  // Personal de fuente ÚNICA (anti doble-conteo · L8): antes se sumaba el personal de
  // fixed_costs (dentro de totales) Y el de staff_finance → doble conteo si ambos existen.
  const seg = fixedCosts.totalesSegmentado(now);
  const hayStaff = (store.readAll("staff_finance") || []).some((s) => s && s.activo !== false);
  const personalDiario = hayStaff ? staff.costeDiarioTotal() : seg.personal.diario;
  const r30 = { desde: now - 30 * 86400000, hasta: now };
  const materias = store.readAll("materias");
  const idxMat = costing.indiceMaterias(materias);
  const idxProd = indicesProducto();
  let materiaDiaria = costeMateriaVendidaEnRango(r30, idxMat, idxProd) / 30;
  if (!(materiaDiaria > 0)) materiaDiaria = comprasEnRango(r30) / 30;
  return eur(seg.otros.diario + personalDiario + materiaDiaria);
}

// ── EXTRAS FINANCIEROS DEL SNAPSHOT EJECUTIVO ───────────────────────────────
// Burn mensual (dinero que sale sí o sí, SIN materia — que escala con la venta),
// nómina esperada, coste fijo esperado y EBITDA (preparado: el add-back de
// amortización es 0 hasta que los activos amorticen en la cuenta de resultados).
function extrasFinancieros(now = Date.now()) {
  const seg = fixedCosts.totalesSegmentado(now);
  // Personal de fuente ÚNICA (anti doble-conteo · L8): staff_finance manda si existe;
  // si no, el personal son los fixed_costs 'Personal'. Nunca se suman los dos.
  const hayStaff = (store.readAll("staff_finance") || []).some((s) => s && s.activo !== false);
  const laboralDiario = hayStaff ? staff.costeDiarioTotal() : seg.personal.diario;
  const MES = 365 / 12;
  const benMes = beneficio(periods.rango("mes", now), now);
  return {
    // Burn mensual = todo lo que sale sí o sí (personal + otros fijos), SIN materia.
    monthly_burn: eur((seg.otros.diario + laboralDiario) * MES),
    expected_payroll: eur(laboralDiario * MES),      // nómina esperada (ya separada de los fijos)
    expected_fixed_costs: seg.otros.mensual,         // otros fijos, SIN personal
    beneficio_mes: benMes.beneficio_operativo,
    margen_mes_pct: benMes.margen_operativo_pct,
    ebitda_mes: benMes.beneficio_operativo, // EBITDA-ready (ver comentario)
  };
}

module.exports = {
  ventasEnRango, ventasNetasEnRango, netoDeVenta, ticketsEnRango, costeMateriaVendidaEnRango, mermaEnRango, comprasEnRango, variablesEnRango,
  costeDeAbrir, patrimonioNeto, beneficio, costeLaboralEnRango, costeMedioDiario, extrasFinancieros, indicesProducto, impuestoBeneficioPct, eur,
};
