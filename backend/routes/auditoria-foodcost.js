// AUDITORÍA DE FOOD COST por producto vendido (solo dirección/admin).
// GET /api/auditoria-foodcost?preset=mes|hoy|anio|...[&desde=&hasta=]
const express = require("express");
const periods = require("../periods");
const auditoria = require("../auditoria-foodcost");

const router = express.Router();

function soloAdmin(req, res) {
  if (!req.user || req.user.rol !== "admin") {
    res.status(403).json({ error: "Solo dirección ve la auditoría de food cost." });
    return false;
  }
  return true;
}

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const preset = req.query.preset || "mes";
    const custom = { desde: req.query.desde, hasta: req.query.hasta };
    const r = periods.rango(preset, Date.now(), custom);
    const data = auditoria.auditar(r);
    res.json(Object.assign({ preset: r.preset, label: r.label }, data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
