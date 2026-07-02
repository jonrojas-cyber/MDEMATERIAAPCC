// SALUD DEL NEGOCIO · el latido de Control M. No es una nota suelta: es el
// equilibrio ponderado de las áreas críticas de la empresa, agrupadas en
// CATEGORÍAS (financiera, tesorería, inventario, equipo, producción, compras,
// crecimiento, riesgo… con cliente e IA preparados). Ninguna métrica domina.
//
// Los PESOS de cada categoría son CONFIGURABLES (entidad business_health_config),
// nunca hardcodeados: el DEFAULT solo es el punto de partida. Cuando falta un
// dato, la señal queda NEUTRA (no puntúa) y su categoría se excluye del global.
//
// risk.js y snapshot-engine.js se cargan de forma perezosa dentro de calcular()
// para evitar un ciclo de require (snapshot-engine → business-health).

const store = require("./data-store");
const financials = require("./financials");
const treasury = require("./treasury");
const debtsMod = require("./debts");
const { estadoStock } = require("./umbral");
const targets = require("./targets");

const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
const NEUTRO = 60;

// Pesos por defecto de cada categoría (editables en business_health_config).
const DEFAULT_PESOS = {
  financial: 1.5, cash_flow: 1.4, inventory: 1.0, employee: 1.1, production: 0.9,
  purchasing: 1.0, growth: 1.0, risk: 1.2, customer: 0, ai_confidence: 0.3,
};
const CAT_LABEL = {
  financial: "Financiera", cash_flow: "Tesorería", inventory: "Inventario",
  employee: "Equipo", production: "Producción y APPCC", purchasing: "Compras",
  growth: "Crecimiento", risk: "Riesgo", customer: "Cliente", ai_confidence: "Confianza de datos",
};
// A qué categoría pertenece cada señal base.
const CAT_MAP = {
  rentabilidad: "financial", liquidez: "cash_flow", deuda: "cash_flow",
  inventario: "inventory", merma: "inventory", laboral: "employee",
  appcc: "production", food_cost: "purchasing", compras: "purchasing", crecimiento: "growth",
};

// Pesos vigentes: DEFAULT + overrides guardados. Fuente única de la ponderación.
function pesos() {
  const doc = store.readAll("business_health_config").find((c) => c.id === "pesos");
  return { ...DEFAULT_PESOS, ...(doc && doc.pesos ? doc.pesos : {}) };
}
function estadoDe(score) { return score == null ? "neutro" : (score >= 75 ? "bien" : score >= 45 ? "regular" : "mal"); }

function objetivoDe(tipo, def) {
  const t = targets.lista().find((x) => x.tipo === tipo);
  return t ? Number(t.valor) : def;
}

function calcular(rango, now = Date.now(), opts = {}) {
  const ben = opts.beneficio || financials.beneficio(rango, now);
  const liq = treasury.liquidez();
  const costeDiario = opts.costeMedioDiario != null ? opts.costeMedioDiario : financials.costeMedioDiario(now);
  const runway = treasury.runway(liq.liquidez_inmediata, costeDiario);
  const materias = store.readAll("materias");
  const criticos = materias.filter((m) => estadoStock(m) !== "correcto").length;
  const deuda = debtsMod.resumen(now);

  const señales = [];
  const add = (clave, texto, score, peso = 1) => {
    const real = score != null;
    const s = real ? clamp(score) : NEUTRO;
    señales.push({ clave, texto, score: Math.round(s), estado: estadoDe(real ? s : null), peso, real });
  };

  // ── Señales base ──────────────────────────────────────────────────────────
  add("liquidez", runway == null ? "Liquidez sin datos suficientes" : (runway >= 45 ? "Liquidez saludable" : runway >= 20 ? "Liquidez ajustada" : "Liquidez baja"),
    runway == null ? null : clamp((runway / 60) * 100), 1.4);

  add("rentabilidad", ben.margen_operativo_pct == null ? "Sin ventas para medir margen" : (ben.margen_operativo_pct >= 10 ? "Margen por encima del objetivo" : ben.margen_operativo_pct >= 0 ? "Margen justo" : "Estás perdiendo dinero"),
    ben.margen_operativo_pct == null ? null : clamp((ben.margen_operativo_pct / 15) * 100), 1.5);

  const objLab = objetivoDe("coste_laboral", 30);
  add("laboral", ben.coste_laboral_pct == null ? "Añade el coste del equipo" : (ben.coste_laboral_pct <= objLab ? "Coste laboral bajo control" : "Coste laboral por encima del objetivo"),
    ben.coste_laboral_pct == null ? null : clamp(100 - Math.max(0, ben.coste_laboral_pct - objLab) * 5), 1.1);

  const objFood = objetivoDe("food_cost", 30);
  add("food_cost", ben.food_cost_pct == null ? "Sin ventas para medir food cost" : (ben.food_cost_pct <= objFood ? "Food cost en objetivo" : "Food cost alto"),
    ben.food_cost_pct == null ? null : clamp(100 - Math.max(0, ben.food_cost_pct - objFood) * 5), 1.1);

  add("inventario", criticos === 0 ? "Stock correcto" : `${criticos} materia(s) en nivel crítico`, clamp(100 - criticos * 12), 0.9);

  const objMerma = objetivoDe("merma", 2);
  const mermaPct = ben.ventas > 0 ? (financials.mermaEnRango(rango) / ben.ventas) * 100 : null;
  add("merma", mermaPct == null ? "Sin datos de merma" : (mermaPct <= objMerma ? "Merma controlada" : "Merma por encima del objetivo"),
    mermaPct == null ? null : clamp(100 - Math.max(0, mermaPct - objMerma) * 10), 0.8);

  const ventasMes = ben.ventas > 0 ? ben.ventas * ((365 / 12) / Math.max(1, (rango.hasta - rango.desde) / 86400000)) : 0;
  const presion = ventasMes > 0 ? deuda.cuota_mensual_total / ventasMes : null;
  add("deuda", deuda.deuda_total === 0 ? "Sin deuda pendiente" : (presion != null && presion < 0.15 ? "Deuda asumible" : "Deuda exige atención"),
    deuda.deuda_total === 0 ? 100 : (presion == null ? null : clamp(100 - presion * 300)), 1.0);

  const hoy = new Date(now).toDateString();
  const revsHoy = store.readAll("revisiones").filter((r) => r.fecha && new Date(r.fecha).toDateString() === hoy);
  const incidencias = revsHoy.filter((r) => r.estado && r.estado !== "Correcto" && !r.resuelta_en).length;
  add("appcc", revsHoy.length === 0 ? "APPCC pendiente hoy" : (incidencias === 0 ? "APPCC al día" : `${incidencias} incidencia(s) APPCC`),
    revsHoy.length === 0 ? 55 : clamp(100 - incidencias * 25), 1.0);

  // Compras: estabilidad de precios de proveedor (subidas recientes penalizan).
  const hayCompras = store.readAll("precios_historico").length > 0 || store.readAll("recepciones").length > 0;
  const subidas = store.readAll("precios_historico").filter((h) => h.fecha && new Date(h.fecha).getTime() >= now - 90 * 86400000 && Number(h.precio_nuevo) > Number(h.precio_anterior)).length;
  add("compras", hayCompras ? (subidas ? `${subidas} subida(s) de precio de proveedor (90 días)` : "Precios de compra estables") : "Sin datos de compras para evaluar",
    hayCompras ? clamp(100 - subidas * 12) : null, 1.0);

  // Crecimiento: evolución del valor de la empresa desde los snapshots (perezoso).
  let growthScore = null, growthTxt = "Sin histórico para medir crecimiento";
  try {
    const snapshotEngine = require("./snapshot-engine");
    const tend = snapshotEngine.tendencia(now);
    if (tend.disponible && tend.mes && tend.mes.patrimonio_neto && tend.mes.patrimonio_neto.pct != null) {
      const pct = tend.mes.patrimonio_neto.pct;
      growthScore = clamp(60 + pct * 2);
      growthTxt = pct >= 0 ? `El valor de la empresa crece (${pct > 0 ? "+" : ""}${pct}% en 30 días)` : `El valor de la empresa cae (${pct}% en 30 días)`;
    }
  } catch (_) { /* sin histórico */ }
  add("crecimiento", growthTxt, growthScore, 1.0);

  // ── Categorías ──────────────────────────────────────────────────────────
  const P = pesos();
  const porCat = {};
  señales.forEach((s) => {
    const cat = CAT_MAP[s.clave]; if (!cat) return;
    (porCat[cat] = porCat[cat] || []).push(s);
  });
  const catScore = (arr) => {
    const reales = arr.filter((s) => s.real);
    if (!reales.length) return null;
    const w = reales.reduce((a, s) => a + s.peso, 0);
    return Math.round(reales.reduce((a, s) => a + s.score * s.peso, 0) / (w || 1));
  };

  // Categoría de riesgo (RiskEngine, perezoso).
  let riesgos = [];
  let riskScore = null;
  try {
    const sr = require("./risk").saludRiesgo(now);
    riskScore = sr.score; riesgos = sr.riesgos;
  } catch (_) { /* motor de riesgo no disponible */ }

  // Confianza de datos: fracción de señales con dato real (meta-salud).
  const realCount = señales.filter((s) => s.real).length;
  const aiConfidence = señales.length ? Math.round((realCount / señales.length) * 100) : null;

  const categorias = [];
  const pushCat = (clave, score) => categorias.push({ clave, label: CAT_LABEL[clave], score, estado: estadoDe(score), peso: P[clave] != null ? P[clave] : 0 });
  ["financial", "cash_flow", "inventory", "employee", "production", "purchasing", "growth"].forEach((c) => pushCat(c, catScore(porCat[c] || [])));
  pushCat("risk", riskScore);
  pushCat("customer", null);            // arquitectura preparada (reviews/NPS futuros)
  pushCat("ai_confidence", aiConfidence);

  // ── Nota global: media ponderada de las categorías con score y peso > 0 ────
  const puntuables = categorias.filter((c) => c.score != null && c.peso > 0);
  const wTot = puntuables.reduce((a, c) => a + c.peso, 0);
  const score = wTot > 0 ? Math.round(puntuables.reduce((a, c) => a + c.score * c.peso, 0) / wTot) : NEUTRO;

  const razones = señales.filter((s) => s.real).slice().sort((a, b) => a.score - b.score).map((s) => ({ texto: s.texto, estado: s.estado }));

  return { score: clamp(score), razones, señales, categorias, riesgos, pesos: P };
}

// Nota + variación vs periodo anterior + mayor mejora / mayor deterioro por categoría.
function calcularConComparativo(actualR, anteriorR, now = Date.now(), opts = {}) {
  const actual = calcular(actualR, now, { beneficio: opts.beneficio, costeMedioDiario: opts.costeMedioDiario });
  let delta = null, prev = null;
  try {
    prev = calcular(anteriorR, now, { beneficio: opts.beneficioAnterior, costeMedioDiario: opts.costeMedioDiario });
    delta = actual.score - prev.score;
  } catch (_) { delta = null; }

  // Mayor mejora / deterioro comparando categorías con score en ambos periodos.
  let mejora = null, deterioro = null;
  if (prev) {
    const prevMap = {}; prev.categorias.forEach((c) => (prevMap[c.clave] = c.score));
    actual.categorias.forEach((c) => {
      if (c.score == null || prevMap[c.clave] == null) return;
      const d = c.score - prevMap[c.clave];
      if (d > 0 && (!mejora || d > mejora.delta)) mejora = { clave: c.clave, label: c.label, delta: d };
      if (d < 0 && (!deterioro || d < deterioro.delta)) deterioro = { clave: c.clave, label: c.label, delta: d };
    });
  }
  return { ...actual, delta, mayor_mejora: mejora, mayor_deterioro: deterioro };
}

module.exports = { calcular, calcularConComparativo, pesos, DEFAULT_PESOS, CAT_LABEL };
