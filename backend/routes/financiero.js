// FINANCIERO · resumen día·mes·año con cascada EBITDA y ratios (solo admin/dirección).
const express = require("express");
const financiero = require("../financiero");

const router = express.Router();

function soloAdmin(req, res) {
  if (!req.user || req.user.rol !== "admin") { res.status(403).json({ error: "Solo dirección ve el resumen financiero." }); return false; }
  return true;
}

// GET /api/financiero?mes=AAAA-MM  → cascada escalada a día abierto / mes / año.
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || "")) ? req.query.mes : undefined;
    res.json(financiero.calcular({ mes, ventas: req.query.ventas, foodCost: req.query.food_cost }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
