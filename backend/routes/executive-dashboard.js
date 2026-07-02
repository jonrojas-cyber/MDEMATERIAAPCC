const express = require("express");
const executive = require("../executive-dashboard");
const financials = require("../financials");
const health = require("../business-health");
const periods = require("../periods");
const timeMachine = require("../time-machine");
const calendar = require("../business-calendar");
const { soloAdmin } = require("./_guard");

const router = express.Router();

function opcionesDe(req) {
  return {
    desde: req.query.desde ? Number(new Date(req.query.desde).getTime()) : undefined,
    hasta: req.query.hasta ? Number(new Date(req.query.hasta).getTime()) : undefined,
  };
}

// GET /api/executive-dashboard?preset=hoy|ayer|semana|...
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const preset = periods.PRESETS.includes(req.query.preset) ? req.query.preset : "hoy";
    res.json({ presets: periods.PRESETS, etiquetas: periods.ETIQUETAS, ...executive.construir(preset, opcionesDe(req)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
