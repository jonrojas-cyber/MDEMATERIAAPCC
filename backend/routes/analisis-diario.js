// ANÁLISIS DIARIO · rayos X de la venta y la compra de un día (solo admin).
// El equipo nunca ve coste/margen: se exige rol admin (regla de negocio).

const express = require("express");
const analisis = require("../analisis-diario");

const router = express.Router();

router.get("/", (req, res) => {
  if (!req.user || req.user.rol !== "admin") {
    return res.status(403).json({ error: "Solo dirección ve el análisis diario." });
  }
  const fecha = req.query.fecha ? String(req.query.fecha).slice(0, 10) : new Date().toISOString().slice(0, 10);
  try {
    res.json(analisis.analizar(fecha));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
