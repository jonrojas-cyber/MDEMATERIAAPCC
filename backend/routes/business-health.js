const express = require("express");
const store = require("../data-store");
const health = require("../business-health");
const forecast = require("../forecast");
const periods = require("../periods");
const { soloAdmin } = require("./_guard");

const router = express.Router();

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const preset = periods.PRESETS.includes(req.query.preset) ? req.query.preset : "semana";
  const now = Date.now();
  const r = periods.rango(preset, now);
  const ant = periods.comparativoAnterior(preset, now);
  try {
    res.json({
      periodo: { preset: r.preset, label: r.label },
      ...health.calcularConComparativo(r, ant, now),
      // Previsión de la salud a 30 días desde la serie histórica de snapshots.
      forecast: forecast.proyectar("salud", 30),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Pesos configurables de la Salud del Negocio (nunca hardcodeados) ────────
router.get("/config", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json({ pesos: health.pesos(), default: health.DEFAULT_PESOS, categorias: health.CAT_LABEL });
});

router.put("/config", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const entrada = (req.body && req.body.pesos) || {};
  const pesos = {};
  Object.keys(health.DEFAULT_PESOS).forEach((k) => {
    if (entrada[k] != null && entrada[k] !== "") { const v = Number(entrada[k]); if (Number.isFinite(v) && v >= 0 && v <= 10) pesos[k] = v; }
  });
  const doc = { id: "pesos", pesos, updated_at: new Date().toISOString() };
  if (store.findById("business_health_config", "pesos")) store.update("business_health_config", "pesos", doc);
  else store.insert("business_health_config", doc);
  await store.flush();
  res.json({ ok: true, pesos: health.pesos() });
});

module.exports = router;
