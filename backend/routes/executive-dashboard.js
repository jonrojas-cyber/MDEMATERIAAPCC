const express = require("express");
const executive = require("../executive-dashboard");
const periods = require("../periods");
const snapshotEngine = require("../snapshot-engine");
const timeline = require("../timeline");
const forecast = require("../forecast");
const anomaly = require("../anomaly");
const { soloAdmin } = require("./_guard");

const router = express.Router();

function opcionesDe(req) {
  return {
    desde: req.query.desde ? Number(new Date(req.query.desde).getTime()) : undefined,
    hasta: req.query.hasta ? Number(new Date(req.query.hasta).getTime()) : undefined,
  };
}
function localDe(req) { return (req.user && req.user.local_id) || "principal"; }

// GET /api/executive-dashboard?preset=hoy|semana|mes|anio|personalizado
router.get("/", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const preset = periods.PRESETS.includes(req.query.preset) ? req.query.preset : "hoy";
    const dashboard = executive.construir(preset, opcionesDe(req));
    // Snapshot diario idempotente: alimenta la serie histórica (tendencias, previsión,
    // detección de anomalías y máquina del tiempo). Solo escribe la primera vez al día.
    try { await snapshotEngine.capturarDiario(Date.now(), localDe(req)); } catch (_) { /* nunca bloquea el dashboard */ }
    res.json({ presets: periods.PRESETS, etiquetas: periods.ETIQUETAS, ...dashboard });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/executive-dashboard/historico?dias=90 — serie temporal de snapshots.
router.get("/historico", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const dias = Math.min(365, Math.max(7, Number(req.query.dias) || 90));
  const localId = localDe(req);
  res.json({ dias, historico: snapshotEngine.historico(dias, localId), tendencia: snapshotEngine.tendencia(Date.now(), localId) });
});

// GET /api/executive-dashboard/timeline?metric=&horizon=&dias= — línea temporal
// financiera completa de UNA métrica: serie histórica, deltas, forecast, escenario,
// anomalías y runway de caja. Una sola llamada por gráfico (rendimiento).
router.get("/timeline", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const metric = timeline.METRICAS[req.query.metric] ? req.query.metric : "patrimonio_neto";
  const horizon = forecast.HORIZONTES.includes(Number(req.query.horizon)) ? Number(req.query.horizon) : 30;
  const dias = Math.min(400, Math.max(14, Number(req.query.dias) || 120));
  const localId = localDe(req);
  try {
    res.json({
      metric, horizon,
      metricas: Object.keys(timeline.METRICAS).map((k) => ({ key: k, label: timeline.METRICAS[k].label, tipo: timeline.METRICAS[k].tipo, dir: timeline.METRICAS[k].dir })),
      serie: timeline.serie(metric, dias, localId),
      delta: timeline.delta(metric, localId),
      forecast: forecast.proyectar(metric, horizon, localId),
      horizontes: forecast.horizontes(metric, localId),
      runway_caja: forecast.runwayCaja(localId),
      anomalies: anomaly.detectar(localId),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
