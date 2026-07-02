// RISK ENGINE · vigila los riesgos que pueden dañar el negocio y los prioriza.
// Cada riesgo trae probabilidad (0–1), impacto (0–1), prioridad (prob×impacto),
// explicación y acción recomendada. Compone motores existentes (forecast, deudas,
// inventario, financials): no recalcula dinero ni duplica reglas.
//
// Alimenta la categoría "Riesgo" de la Salud del Negocio y el copiloto.

const store = require("./data-store");
const forecast = require("./forecast");
const debtsMod = require("./debts");
const inventoryCapital = require("./inventory-capital");
const { estadoStock } = require("./umbral");

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

const NIVEL = (p) => (p >= 0.5 ? "alto" : p >= 0.25 ? "medio" : "bajo");

// Devuelve la lista de riesgos activos, ordenada por prioridad descendente.
function detectar(now = Date.now(), localId = "principal") {
  const riesgos = [];
  const add = (tipo, label, probabilidad, impacto, explicacion, accion) => {
    const p = clamp01(probabilidad), i = clamp01(impacto);
    const prioridad = round2(p * i);
    if (prioridad <= 0) return;
    riesgos.push({ tipo, label, probabilidad: round2(p), impacto: round2(i), prioridad, nivel: NIVEL(prioridad), explicacion, accion });
  };

  // 1) Riesgo de caja: forecast de liquidez a cero.
  const rw = forecast.runwayCaja(localId);
  if (rw.disponible && rw.en_riesgo && rw.dias_hasta_cero != null) {
    const d = rw.dias_hasta_cero;
    const prob = d <= 15 ? 0.9 : d <= 30 ? 0.7 : d <= 60 ? 0.45 : 0.25;
    add("caja", "Riesgo de caja", prob, 1.0,
      `Al ritmo actual la liquidez llega a cero en ${d} días (aprox. ${rw.fecha_estimada}).`,
      "Adelanta cobros, retrasa pagos no críticos o reduce coste esta semana.");
  }

  // 2) Riesgo de deuda: cuota mensual alta frente a la liquidez.
  const deuda = debtsMod.resumen(now);
  if (deuda.deuda_total > 0) {
    const liquidez = (rw && rw.liquidez_actual) || 0;
    const meses = deuda.cuota_mensual_total > 0 && liquidez > 0 ? liquidez / deuda.cuota_mensual_total : null;
    const prob = meses == null ? 0.3 : meses < 1 ? 0.8 : meses < 3 ? 0.5 : 0.2;
    add("deuda", "Riesgo de deuda", prob, 0.7,
      `Deuda pendiente ${deuda.deuda_total} € · cuota ${deuda.cuota_mensual_total} €/mes${meses != null ? ` (≈ ${Math.round(meses)} meses de cuota en caja)` : ""}.`,
      "Revisa el calendario de pagos y evita nueva deuda cara.");
  }

  // 3) Riesgo de inventario: capital parado / a caducar.
  const cap = inventoryCapital.calcular(now);
  if (cap.valor_total > 0) {
    const ratioParado = cap.sin_rotacion_eur / cap.valor_total;
    if (ratioParado > 0.2 || cap.en_caducidad_eur > 30) {
      const prob = clamp01(ratioParado + (cap.en_caducidad_eur > 30 ? 0.2 : 0));
      add("inventario", "Riesgo de inventario", prob, 0.5,
        `${cap.sin_rotacion_eur} € sin rotación y ${cap.en_caducidad_eur} € a punto de caducar.`,
        "Prioriza o promociona el stock lento antes de que se convierta en merma.");
    }
  }

  // 4) Riesgo de proveedor: subidas de precio recientes.
  const desde = now - 90 * 86400000;
  const subidas = store.readAll("precios_historico").filter((h) => h.fecha && new Date(h.fecha).getTime() >= desde &&
    Number(h.precio_anterior) > 0 && Number(h.precio_nuevo) > Number(h.precio_anterior));
  if (subidas.length) {
    const prob = clamp01(0.3 + subidas.length * 0.1);
    add("proveedor", "Riesgo de proveedor", prob, 0.4,
      `${subidas.length} subida(s) de precio de proveedor en los últimos 90 días.`,
      "Renegocia o busca alternativa; revisa si el PVP sigue cubriendo margen.");
  }

  // 5) Riesgo operativo: incidencias APPCC abiertas y stock crítico.
  const hoy = new Date(now).toDateString();
  const incidencias = store.readAll("revisiones").filter((r) => r.fecha && new Date(r.fecha).toDateString() === hoy && r.estado && r.estado !== "Correcto" && !r.resuelta_en).length;
  const criticos = store.readAll("materias").filter((m) => estadoStock(m) !== "correcto").length;
  if (incidencias > 0 || criticos >= 3) {
    const prob = clamp01(incidencias * 0.3 + criticos * 0.06);
    add("operativo", "Riesgo operativo", prob, 0.5,
      `${incidencias} incidencia(s) APPCC y ${criticos} materia(s) en nivel crítico.`,
      "Resuelve las incidencias de seguridad y repón el stock crítico.");
  }

  return riesgos.sort((a, b) => b.prioridad - a.prioridad);
}

// Salud de riesgo (0–100, 100 = sin riesgo): 100 − prioridad máxima ponderada.
function saludRiesgo(now = Date.now(), localId = "principal") {
  const riesgos = detectar(now, localId);
  if (!riesgos.length) return { score: 100, riesgos: [] };
  // El peor riesgo domina, pero el resto también resta algo.
  const peor = riesgos[0].prioridad;
  const resto = riesgos.slice(1).reduce((s, r) => s + r.prioridad, 0) * 0.3;
  const score = Math.round(Math.max(0, 100 - (peor + resto) * 100));
  return { score, riesgos };
}

module.exports = { detectar, saludRiesgo, NIVEL };
