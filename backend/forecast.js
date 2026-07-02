// FORECAST ENGINE · proyecta el futuro financiero desde la línea temporal.
// Modelo por defecto: regresión lineal sobre los snapshots (mínimos cuadrados),
// con confianza = R². La arquitectura es enchufable (`modelo`): mañana un modelo
// de ML puede sustituir la proyección sin tocar el endpoint ni la UI.
//
// Responde a: "¿cuánto tendré en 45 días?", "¿cuándo me quedo sin caja?",
// "¿qué pasa si las ventas caen un 10%?".

const timeline = require("./timeline");

const DAY = 86400000;
const HORIZONTES = [7, 30, 90, 180, 365];
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function ymd(t) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

// Bondad de ajuste (R²) de la regresión sobre los puntos.
function r2(puntos, reg) {
  const n = puntos.length;
  if (n < 3) return null;
  const media = puntos.reduce((s, p) => s + p.valor, 0) / n;
  let ssTot = 0, ssRes = 0;
  puntos.forEach((p) => {
    const pred = reg.intercepto + reg.pendiente * p.x;
    ssTot += (p.valor - media) ** 2;
    ssRes += (p.valor - pred) ** 2;
  });
  if (ssTot === 0) return 1;
  return Math.max(0, Math.min(1, 1 - ssRes / ssTot));
}

// Proyecta una métrica `horizonte` días hacia delante. modelo = 'linear' (default).
function proyectar(metricKey, horizonte = 30, localId = "principal", opts = {}) {
  const m = timeline.metricaDe(metricKey);
  const pts = timeline.serie(metricKey, 400, localId);
  if (pts.length < 3) return { disponible: false, motivo: "Se necesitan al menos 3 días de histórico.", horizonte };
  const reg = timeline.regresion(pts);
  const confianza = r2(pts, reg);
  const shock = opts.shockPct != null ? 1 + Number(opts.shockPct) / 100 : 1; // escenarios "y si…"
  const last = pts[pts.length - 1];
  const lastT = new Date(last.fecha).getTime();

  const futuro = [];
  let acumulado = 0;
  for (let i = 1; i <= horizonte; i++) {
    const x = last.x + i;
    let valor = (reg.intercepto + reg.pendiente * x) * shock;
    if (m.tipo === "stock" && m.campo !== "salud") valor = round2(valor);
    else if (m.campo === "salud") valor = Math.max(0, Math.min(100, Math.round(valor)));
    else valor = round2(valor); // flow: valor diario proyectado
    acumulado = round2(acumulado + valor);
    futuro.push({ fecha: ymd(lastT + i * DAY), x, valor, acumulado });
  }
  const valorHorizonte = m.tipo === "flow" ? acumulado : futuro[futuro.length - 1].valor;

  return {
    disponible: true, metric: metricKey, tipo: m.tipo, label: m.label, horizonte,
    modelo: "linear", confianza: confianza != null ? Math.round(confianza * 100) / 100 : null,
    valor_actual: round2(last.valor), valor_horizonte: round2(valorHorizonte),
    velocidad_dia: round2(reg.pendiente),
    serie: futuro,
  };
}

// Todos los horizontes de una métrica de un golpe (para el titular ejecutivo).
function horizontes(metricKey, localId = "principal", opts = {}) {
  const out = {};
  HORIZONTES.forEach((h) => { const p = proyectar(metricKey, h, localId, opts); out[h] = p.disponible ? p.valor_horizonte : null; });
  return { metric: metricKey, disponible: HORIZONTES.some((h) => out[h] != null), horizontes: out };
}

// ¿Cuándo me quedo sin caja? Extrapola la liquidez hasta 0 con la tendencia actual.
function runwayCaja(localId = "principal") {
  const pts = timeline.serie("liquidez", 400, localId);
  if (pts.length < 3) return { disponible: false };
  const reg = timeline.regresion(pts);
  const last = pts[pts.length - 1];
  if (reg.pendiente >= -0.01) return { disponible: true, en_riesgo: false, mensaje: "La liquidez no está cayendo." };
  // valor(x) = a + b·x = 0  →  x0 = -a/b
  const x0 = -reg.intercepto / reg.pendiente;
  const dias = Math.max(0, Math.round(x0 - last.x));
  const lastT = new Date(last.fecha).getTime();
  return { disponible: true, en_riesgo: true, dias_hasta_cero: dias, fecha_estimada: ymd(lastT + dias * DAY), liquidez_actual: round2(last.valor) };
}

// Escenario "¿y si…?": aplica un shock porcentual a la proyección.
function escenario(metricKey, horizonte, shockPct, localId = "principal") {
  const base = proyectar(metricKey, horizonte, localId);
  const shocked = proyectar(metricKey, horizonte, localId, { shockPct });
  if (!base.disponible) return base;
  return {
    disponible: true, metric: metricKey, horizonte, shock_pct: shockPct,
    base: base.valor_horizonte, escenario: shocked.valor_horizonte,
    diferencia: round2(shocked.valor_horizonte - base.valor_horizonte),
  };
}

module.exports = { HORIZONTES, proyectar, horizontes, runwayCaja, escenario, r2 };
