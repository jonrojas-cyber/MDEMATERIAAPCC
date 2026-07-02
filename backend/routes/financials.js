const express = require("express");
const financials = require("../financials");
const periods = require("../periods");
const { soloAdmin } = require("./_guard");

const router = express.Router();

function rangoDe(req) {
  const preset = periods.PRESETS.includes(req.query.preset) ? req.query.preset : "mes";
  const custom = { desde: req.query.desde ? new Date(req.query.desde).getTime() : undefined, hasta: req.query.hasta ? new Date(req.query.hasta).getTime() : undefined };
  return periods.rango(preset, Date.now(), custom);
}

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const r = rangoDe(req);
  res.json({
    periodo: { preset: r.preset, label: r.label, desde: r.desde, hasta: r.hasta },
    coste_abrir: financials.costeDeAbrir(r),
    patrimonio_neto: financials.patrimonioNeto(),
    beneficio: financials.beneficio(r),
    coste_medio_diario: financials.costeMedioDiario(),
  });
});

router.get("/cost-of-opening", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json(financials.costeDeAbrir(rangoDe(req)));
});

router.get("/net-worth", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json(financials.patrimonioNeto());
});

router.get("/profit", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json(financials.beneficio(rangoDe(req)));
});

module.exports = router;
