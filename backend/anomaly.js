// ANOMALY ENGINE · detecta comportamientos financieros inusuales en la línea
// temporal. Método: z-score del valor más reciente frente a la media/desviación
// de la historia previa. Para stocks se analiza el cambio diario; para flujos, el
// valor diario. Cada anomalía trae severidad, confianza, explicación y acción.
//
// No reimplementa deltas ni series: consume timeline.js.

const timeline = require("./timeline");

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Qué vigilar y cómo explicarlo. `senal`: 'flow' usa el valor diario; 'diff' usa
// el cambio día a día (para stocks). `malo`: qué dirección es preocupante.
const VIGILANCIA = [
  { metric: "liquidez",          senal: "diff", malo: "baja", label: "Caja/liquidez",
    txt: { baja: "La liquidez cayó de forma inusual", sube: "Entrada de caja inusual" }, accion: "Revisa los pagos y cobros del día." },
  { metric: "valor_almacen",     senal: "diff", malo: "sube", label: "Almacén",
    txt: { sube: "El almacén creció más de lo normal", baja: "El almacén cayó de forma inusual" }, accion: "¿Compra grande o consumo alto? Vigila el capital parado." },
  { metric: "beneficio_dia",     senal: "flow", malo: "baja", label: "Beneficio",
    txt: { baja: "El beneficio del día se desplomó", sube: "Beneficio del día muy por encima de lo normal" }, accion: "Revisa ventas y costes de hoy." },
  { metric: "merma_dia",         senal: "flow", malo: "sube", label: "Merma",
    txt: { sube: "Merma anormalmente alta", baja: "Merma inusualmente baja" }, accion: "Revisa caducidades y sobreproducción." },
  { metric: "coste_laboral_dia", senal: "flow", malo: "sube", label: "Coste laboral",
    txt: { sube: "Coste laboral inusual", baja: "Coste laboral inusualmente bajo" }, accion: "¿Horas extra o sobredimensión de personal?" },
  { metric: "ventas_dia",        senal: "flow", malo: "baja", label: "Ventas",
    txt: { baja: "Caída de ventas fuera de lo normal", sube: "Pico de ventas fuera de lo normal" }, accion: "Ajusta stock y personal a la demanda." },
];

function señal(pts, tipo) {
  if (tipo === "diff") {
    const out = [];
    for (let i = 1; i < pts.length; i++) out.push(pts[i].valor - pts[i - 1].valor);
    return out;
  }
  return pts.map((p) => p.valor);
}

function estadistica(arr) {
  const n = arr.length;
  const media = arr.reduce((s, v) => s + v, 0) / n;
  const varianza = arr.reduce((s, v) => s + (v - media) ** 2, 0) / n;
  return { media, std: Math.sqrt(varianza) };
}

// Analiza una métrica y devuelve una anomalía si el último punto se desvía.
function analizar(cfg, localId) {
  const pts = timeline.serie(cfg.metric, 90, localId);
  const s = señal(pts, cfg.senal);
  if (s.length < 8) return null; // sin suficiente historia no se afirma nada
  const ultimo = s[s.length - 1];
  const previos = s.slice(0, -1);
  const { media, std } = estadistica(previos);
  // Umbral mínimo de ruido: si la desviación es ~0 pero el último punto se separa
  // de una base perfectamente estable, ES una anomalía fuerte (z efectivamente
  // enorme). Evita perder picos reales sobre una base plana.
  let z;
  if (std < 1e-9) {
    if (Math.abs(ultimo - media) < 1e-9) return null; // base estable, sin cambio
    z = ultimo > media ? 6 : -6; // desviación clara sobre base plana
  } else {
    z = (ultimo - media) / std;
  }
  const absZ = Math.abs(z);
  if (absZ < 2) return null; // dentro de lo normal

  const direccion = z > 0 ? "sube" : "baja";
  const severidad = absZ >= 3 ? "alta" : absZ >= 2.5 ? "media" : "baja";
  const confianza = Math.min(0.99, Math.round((absZ / 4) * 100) / 100);
  const esMalo = direccion === cfg.malo;
  return {
    metric: cfg.metric, label: cfg.label, fecha: pts[pts.length - 1].fecha,
    direccion, z: round2(z), severidad, confianza, preocupante: esMalo,
    valor: round2(pts[pts.length - 1].valor),
    explicacion: cfg.txt[direccion] || "Comportamiento inusual",
    accion: cfg.accion,
  };
}

// Escanea todas las métricas vigiladas y devuelve las anomalías por severidad.
function detectar(localId = "principal") {
  const orden = { alta: 0, media: 1, baja: 2 };
  return VIGILANCIA.map((cfg) => analizar(cfg, localId)).filter(Boolean)
    .sort((a, b) => (orden[a.severidad] - orden[b.severidad]) || (b.confianza - a.confianza));
}

module.exports = { detectar, analizar, VIGILANCIA };
