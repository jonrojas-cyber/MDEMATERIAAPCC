const express = require("express");
const { soloAdmin } = require("./_guard");

const router = express.Router();

// GET /api/fiabilidad — medidor de fiabilidad de los datos (Fase C): % real,
// áreas reales/parciales/pendientes y la lista de acciones para cuadrar a cero.
// Solo admin (toca dinero y estado del negocio).
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    res.json(require("../fiabilidad").informe());
  } catch (e) {
    res.status(500).json({ error: e.message || "No se pudo calcular la fiabilidad." });
  }
});

module.exports = router;
