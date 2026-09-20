// CUENTA DE RESULTADOS · P&L mensual (solo admin).
const express = require("express");
const cr = require("../cuenta-resultados");

const router = express.Router();

router.get("/", (req, res) => {
  if (!req.user || req.user.rol !== "admin") {
    return res.status(403).json({ error: "Solo dirección ve la cuenta de resultados." });
  }
  try {
    res.json(cr.calcular({ mes: req.query.mes, ventas: req.query.ventas }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
