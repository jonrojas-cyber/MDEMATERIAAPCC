const express = require("express");
const health = require("../business-health");
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
    res.json({ periodo: { preset: r.preset, label: r.label }, ...health.calcularConComparativo(r, ant, now) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
