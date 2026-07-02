// SALUD DEL NEGOCIO · una nota 0–100 que resume la empresa. Compone señales de
// liquidez, rentabilidad, coste laboral, food cost, inventario, merma, deuda,
// APPCC, tendencia de ventas y alertas. Cuando falta un dato, la señal queda
// NEUTRA (no penaliza ni infla). Devuelve la nota y razones cortas en español.

const store = require("./data-store");
const financials = require("./financials");
const treasury = require("./treasury");
const debtsMod = require("./debts");
const { estadoStock } = require("./umbral");
const targets = require("./targets");

const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
const NEUTRO = 60;

function objetivoDe(tipo, def) {
  const t = targets.lista().find((x) => x.tipo === tipo);
  return t ? Number(t.valor) : def;
}

// Cada señal → { score 0-100, estado 'bien'|'regular'|'mal', texto, peso }.
// opts permite inyectar cifras ya calculadas (beneficio, costeMedioDiario) para
// no repetir escaneos costosos de ventas cuando el dashboard ya las tiene.
function calcular(rango, now = Date.now(), opts = {}) {
  const ben = opts.beneficio || financials.beneficio(rango, now);
  const liq = treasury.liquidez();
  const costeDiario = opts.costeMedioDiario != null ? opts.costeMedioDiario : financials.costeMedioDiario(now);
  const runway = treasury.runway(liq.liquidez_inmediata, costeDiario);
  const materias = store.readAll("materias");
  const criticos = materias.filter((m) => estadoStock(m) !== "correcto").length;
  const deuda = debtsMod.resumen(now);

  const señales = [];
  const add = (clave, texto, score, peso, umbralBien = 75, umbralMal = 45) => {
    const s = score == null ? NEUTRO : clamp(score);
    const estado = score == null ? "neutro" : (s >= umbralBien ? "bien" : (s >= umbralMal ? "regular" : "mal"));
    señales.push({ clave, texto, score: Math.round(s), estado, peso });
  };

  // 1) Liquidez (runway). 60+ días = excelente.
  const liqScore = runway == null ? null : clamp((runway / 60) * 100);
  add("liquidez", runway == null ? "Liquidez sin datos suficientes" : (runway >= 45 ? "Liquidez saludable" : runway >= 20 ? "Liquidez ajustada" : "Liquidez baja"), liqScore, 1.4);

  // 2) Rentabilidad (margen operativo). 15%+ = excelente.
  const rentScore = ben.margen_operativo_pct == null ? null : clamp((ben.margen_operativo_pct / 15) * 100);
  add("rentabilidad", ben.margen_operativo_pct == null ? "Sin ventas para medir margen" : (ben.margen_operativo_pct >= 10 ? "Margen por encima del objetivo" : ben.margen_operativo_pct >= 0 ? "Margen justo" : "Estás perdiendo dinero"), rentScore, 1.5);

  // 3) Coste laboral vs objetivo.
  const objLab = objetivoDe("coste_laboral", 30);
  const labScore = ben.coste_laboral_pct == null ? null : clamp(100 - Math.max(0, ben.coste_laboral_pct - objLab) * 5);
  add("laboral", ben.coste_laboral_pct == null ? "Añade el coste del equipo" : (ben.coste_laboral_pct <= objLab ? "Coste laboral bajo control" : "Coste laboral por encima del objetivo"), labScore, 1.1);

  // 4) Food cost vs objetivo.
  const objFood = objetivoDe("food_cost", 30);
  const foodScore = ben.food_cost_pct == null ? null : clamp(100 - Math.max(0, ben.food_cost_pct - objFood) * 5);
  add("food_cost", ben.food_cost_pct == null ? "Sin ventas para medir food cost" : (ben.food_cost_pct <= objFood ? "Food cost en objetivo" : "Food cost alto"), foodScore, 1.1);

  // 5) Inventario (stock crítico).
  const invScore = clamp(100 - criticos * 12);
  add("inventario", criticos === 0 ? "Stock correcto" : `${criticos} materia(s) en nivel crítico`, invScore, 0.9);

  // 6) Merma vs objetivo (% sobre ventas).
  const objMerma = objetivoDe("merma", 2);
  const mermaPct = ben.ventas > 0 ? (financials.mermaEnRango(rango) / ben.ventas) * 100 : null;
  const mermaScore = mermaPct == null ? null : clamp(100 - Math.max(0, mermaPct - objMerma) * 10);
  add("merma", mermaPct == null ? "Sin datos de merma" : (mermaPct <= objMerma ? "Merma controlada" : "Merma por encima del objetivo"), mermaScore, 0.8);

  // 7) Presión de deuda (cuota mensual vs ventas mensuales estimadas).
  const ventasMes = ben.ventas > 0 ? ben.ventas * ((365 / 12) / Math.max(1, (rango.hasta - rango.desde) / 86400000)) : 0;
  const presion = ventasMes > 0 ? deuda.cuota_mensual_total / ventasMes : null;
  const deudaScore = deuda.deuda_total === 0 ? 100 : (presion == null ? null : clamp(100 - presion * 300));
  add("deuda", deuda.deuda_total === 0 ? "Sin deuda pendiente" : (presion != null && presion < 0.15 ? "Deuda asumible" : "Deuda exige atención"), deudaScore, 1.0);

  // 8) APPCC (temperaturas de hoy registradas + incidencias abiertas).
  const hoy = new Date(now).toDateString();
  const revsHoy = store.readAll("revisiones").filter((r) => r.fecha && new Date(r.fecha).toDateString() === hoy);
  const incidencias = revsHoy.filter((r) => r.estado && r.estado !== "Correcto" && !r.resuelta_en).length;
  const appccScore = revsHoy.length === 0 ? 55 : clamp(100 - incidencias * 25);
  add("appcc", revsHoy.length === 0 ? "APPCC pendiente hoy" : (incidencias === 0 ? "APPCC al día" : `${incidencias} incidencia(s) APPCC`), appccScore, 1.0, 70, 40);

  // Nota final: media ponderada de las señales con score (las neutras cuentan como NEUTRO).
  const pesoTotal = señales.reduce((s, x) => s + x.peso, 0);
  const score = Math.round(señales.reduce((s, x) => s + x.score * x.peso, 0) / (pesoTotal || 1));

  const razones = señales
    .slice()
    .sort((a, b) => a.score - b.score)
    .map((s) => ({ texto: s.texto, estado: s.estado }));

  return { score: clamp(score), razones, señales };
}

// Nota + variación respecto al periodo anterior (para "+3 vs semana anterior").
// opts.beneficio / opts.beneficioAnterior / opts.costeMedioDiario evitan recalcular.
function calcularConComparativo(actualR, anteriorR, now = Date.now(), opts = {}) {
  const actual = calcular(actualR, now, { beneficio: opts.beneficio, costeMedioDiario: opts.costeMedioDiario });
  let delta = null;
  try {
    const prev = calcular(anteriorR, now, { beneficio: opts.beneficioAnterior, costeMedioDiario: opts.costeMedioDiario });
    delta = actual.score - prev.score;
  } catch (_) { delta = null; }
  return { ...actual, delta };
}

module.exports = { calcular, calcularConComparativo };
