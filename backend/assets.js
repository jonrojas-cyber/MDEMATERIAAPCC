// ACTIVOS · maquinaria, equipos, mobiliario, vehículos. Su valor forma parte del
// patrimonio neto. Amortización lineal opcional para estimar el valor actual.

const store = require("./data-store");

const CATEGORIAS = [
  "Cafetera", "Molinos", "Neveras", "Congeladores", "Lavavajillas", "Hornos",
  "TPV", "Ordenadores", "Mobiliario", "Herramientas", "Vehículos", "Otros",
];

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Valor actual: si hay current_value explícito, se usa. Si no y hay método lineal
// con vida útil, se amortiza. Si no, se asume el precio de compra (sin amortizar).
function valorActual(a, now = Date.now()) {
  if (a.current_value != null && a.current_value !== "") return Number(a.current_value) || 0;
  const compra = Number(a.purchase_price) || 0;
  const vidaAnios = Number(a.useful_life_years) || 0;
  if ((a.depreciation_method === "linear" || a.depreciation_method === "lineal") && vidaAnios > 0 && a.purchase_date) {
    const t0 = new Date(a.purchase_date).getTime();
    if (Number.isFinite(t0)) {
      const anios = (now - t0) / (365 * 86400000);
      const residual = compra * Math.max(0, 1 - anios / vidaAnios);
      return eur(residual);
    }
  }
  return eur(compra);
}

// Amortización ANUAL (gasto de depreciación) de un activo con método lineal, vida
// útil y fecha de compra: precio de compra / vida útil (€/año). Los activos con solo
// current_value (sin método) NO se amortizan sistemáticamente (no hay base para el gasto).
function amortizacionAnualDe(a) {
  const compra = Number(a.purchase_price) || 0;
  const vida = Number(a.useful_life_years) || 0;
  const metodo = a.depreciation_method === "linear" || a.depreciation_method === "lineal";
  if (metodo && vida > 0 && compra > 0 && a.purchase_date) return compra / vida;
  return 0;
}

// Amortización (D&A) imputable a un RANGO [desde,hasta): el gasto de depreciación
// lineal prorrateado a los días del periodo, SOLO mientras el activo está dentro de
// su vida útil (al terminar de amortizar, deja de generar gasto). Para el P&L (dinero.1).
function amortizacionEnRango(rango, now = Date.now(), lista = null) {
  const activos = (lista || store.readAll("assets")).filter((a) => a.active !== false);
  let total = 0;
  activos.forEach((a) => {
    const anual = amortizacionAnualDe(a);
    if (anual <= 0) return;
    const t0 = new Date(a.purchase_date).getTime();
    if (!Number.isFinite(t0)) return;
    const finVida = t0 + (Number(a.useful_life_years) || 0) * 365 * 86400000;
    const desde = Math.max(Number(rango.desde) || 0, t0);
    const hasta = Math.min(Number(rango.hasta) || 0, finVida);
    if (hasta <= desde) return; // el periodo no solapa con la vida útil restante
    total += anual * ((hasta - desde) / 86400000 / 365);
  });
  return eur(total);
}

function garantiaVence(a, now = Date.now(), dias = 60) {
  if (!a.warranty_end_date) return false;
  const t = new Date(a.warranty_end_date).getTime();
  return Number.isFinite(t) && t >= now && t - now <= dias * 86400000;
}

function decorar(a, now = Date.now()) {
  return {
    ...a,
    valor_actual: valorActual(a, now),
    garantia_por_vencer: garantiaVence(a, now),
  };
}

function resumen(now = Date.now(), lista = null) {
  const activos = (lista || store.readAll("assets")).filter((a) => a.active !== false).map((a) => decorar(a, now));
  const valorTotal = eur(activos.reduce((s, a) => s + a.valor_actual, 0));
  const garantias = activos.filter((a) => a.garantia_por_vencer).length;
  const criticos = activos.filter((a) => a.critical === true).length;
  return {
    valor_total: valorTotal,
    num_activos: activos.length,
    garantias_por_vencer: garantias,
    activos_criticos: criticos,
    activos: activos.sort((a, b) => b.valor_actual - a.valor_actual),
  };
}

module.exports = { CATEGORIAS, valorActual, amortizacionAnualDe, amortizacionEnRango, garantiaVence, decorar, resumen, eur };
