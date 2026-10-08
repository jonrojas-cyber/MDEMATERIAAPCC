// DASHBOARD CEO · centro de mando de la portada (solo dirección).
// Una sola llamada con todo lo que la portada necesita (dashboard-ceo.calcular).
const express = require("express");
const { soloAdmin } = require("./_guard");
const dashboard = require("../dashboard-ceo");

const router = express.Router();

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    res.json(dashboard.calcular({ now: Date.now() }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
