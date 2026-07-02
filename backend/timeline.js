// FINANCIAL TIMELINE ENGINE (+ DELTA ENGINE)
// Convierte la serie de snapshots diarios en una línea temporal financiera:
// series por métrica, deltas (día/semana/mes/año), medias móviles, tendencia y
// velocidad de crecimiento. Fuente única de TODO cálculo de línea temporal —
// forecast.js y anomaly.js consumen esto, nunca reimplementan deltas.
//
// Distingue STOCK (valor puntual: caja, patrimonio, deuda, salud…) de FLOW
// (importe diario: ventas, beneficio, merma, coste laboral…). Los stocks se
// comparan por valor puntual; los flujos se comparan por suma de la ventana.

const snapshotEngine = require("./snapshot-engine");

const DAY = 86400000;
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Catálogo de métricas: campo del snapshot + tipo + etiqueta + dirección buena.
const METRICAS = {
  caja:            { campo: "caja", tipo: "stock", label: "Caja", dir: "up" },
  banco:           { campo: "banco", tipo: "stock", label: "Banco", dir: "up" },
  liquidez:        { campo: "liquidez", tipo: "stock", label: "Liquidez", dir: "up" },
  patrimonio_neto: { campo: "patrimonio_neto", tipo: "stock", label: "Valor de la empresa", dir: "up" },
  valor_almacen:   { campo: "valor_almacen", tipo: "stock", label: "Valor de almacén", dir: "neutral" },
  deuda_total:     { campo: "deuda_total", tipo: "stock", label: "Deuda", dir: "down" },
  salud:           { campo: "salud", tipo: "stock", label: "Salud del negocio", dir: "up" },
  runway:          { campo: "runway", tipo: "stock", label: "Días de supervivencia", dir: "up" },
  ventas_dia:      { campo: "ventas_dia", tipo: "flow", label: "Ventas", dir: "up" },
  beneficio_dia:   { campo: "beneficio_dia", tipo: "flow", label: "Beneficio", dir: "up" },
  coste_laboral_dia: { campo: "coste_laboral_dia", tipo: "flow", label: "Coste laboral", dir: "down" },
  coste_materia_dia: { campo: "coste_materia_dia", tipo: "flow", label: "Food cost", dir: "down" },
  merma_dia:       { campo: "merma_dia", tipo: "flow", label: "Merma", dir: "down" },
};

function metricaDe(key) { return METRICAS[key] || METRICAS.patrimonio_neto; }

// Serie [{fecha, x(dayIndex), valor}] de una métrica, ordenada ascendente.
function serie(metricKey, dias = 365, localId = "principal") {
  const m = metricaDe(metricKey);
  const snaps = snapshotEngine.historico(dias, localId);
  if (!snaps.length) return [];
  const t0 = new Date(snaps[0].fecha).getTime();
  return snaps.map((s) => ({
    fecha: s.fecha,
    x: Math.round((new Date(s.fecha).getTime() - t0) / DAY),
    valor: Number(s[m.campo]) || 0,
  }));
}

// Regresión lineal por mínimos cuadrados sobre {x, valor}. Devuelve pendiente/día.
function regresion(puntos) {
  const n = puntos.length;
  if (n < 2) return { pendiente: 0, intercepto: n ? puntos[0].valor : 0, n };
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  puntos.forEach((p) => { sx += p.x; sy += p.valor; sxy += p.x * p.valor; sxx += p.x * p.x; });
  const denom = n * sxx - sx * sx;
  const pendiente = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const intercepto = (sy - pendiente * sx) / n;
  return { pendiente, intercepto, n };
}

function mediaMovil(puntos, ventana) {
  if (puntos.length < 1) return null;
  const ult = puntos.slice(-ventana);
  return round2(ult.reduce((s, p) => s + p.valor, 0) / ult.length);
}

function sumaVentana(puntos, dias, offset = 0) {
  if (!puntos.length) return 0;
  const maxX = puntos[puntos.length - 1].x - offset;
  const minX = maxX - dias;
  return round2(puntos.filter((p) => p.x > minX && p.x <= maxX).reduce((s, p) => s + p.valor, 0));
}

function valorEnOffset(puntos, diasAtras) {
  if (!puntos.length) return null;
  const objetivo = puntos[puntos.length - 1].x - diasAtras;
  let cand = null;
  for (const p of puntos) { if (p.x <= objetivo) cand = p; }
  return cand ? cand.valor : null;
}

function cmp(actual, anterior) {
  if (actual == null || anterior == null) return null;
  const abs = round2(actual - anterior);
  const pct = anterior !== 0 ? Math.round((abs / Math.abs(anterior)) * 100) : null;
  return { anterior: round2(anterior), actual: round2(actual), abs, pct };
}

// DELTA ENGINE: día/semana/mes/año + medias móviles + tendencia + aceleración.
function delta(metricKey, localId = "principal") {
  const m = metricaDe(metricKey);
  const pts = serie(metricKey, 400, localId);
  if (pts.length < 2) return { disponible: false, tipo: m.tipo, label: m.label };
  const reg = regresion(pts);
  const ultimo = pts[pts.length - 1].valor;

  let dia, semana, mes, anio;
  if (m.tipo === "flow") {
    dia = cmp(pts[pts.length - 1].valor, pts[pts.length - 2].valor);
    semana = cmp(sumaVentana(pts, 7), sumaVentana(pts, 7, 7));
    mes = cmp(sumaVentana(pts, 30), sumaVentana(pts, 30, 30));
    anio = cmp(sumaVentana(pts, 365), sumaVentana(pts, 365, 365));
  } else {
    dia = cmp(ultimo, pts[pts.length - 2].valor);
    semana = cmp(ultimo, valorEnOffset(pts, 7));
    mes = cmp(ultimo, valorEnOffset(pts, 30));
    anio = cmp(ultimo, valorEnOffset(pts, 365));
  }

  // Aceleración: pendiente reciente (7d) vs pendiente previa (7-14d).
  const recientes = pts.slice(-7), previos = pts.slice(-14, -7);
  const pendReciente = regresion(recientes).pendiente;
  const pendPrevia = regresion(previos).pendiente;

  return {
    disponible: true, tipo: m.tipo, label: m.label, dir: m.dir,
    ultimo: round2(ultimo),
    dia, semana, mes, anio,
    media_movil_7: mediaMovil(pts, 7),
    media_movil_30: mediaMovil(pts, 30),
    tendencia: reg.pendiente > 0.01 ? "sube" : reg.pendiente < -0.01 ? "baja" : "estable",
    velocidad_dia: round2(reg.pendiente),           // unidades por día (regresión)
    aceleracion: round2(pendReciente - pendPrevia), // cambio en la velocidad
  };
}

module.exports = { METRICAS, metricaDe, serie, regresion, mediaMovil, sumaVentana, valorEnOffset, delta, round2 };
