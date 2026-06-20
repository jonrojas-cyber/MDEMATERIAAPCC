const express = require("express");
const store = require("../data-store");

const router = express.Router();

router.get("/", (req, res) => {
  const materias = store.readAll("materias").map((m) => ({
    ...m,
    disponibilidad_estado:
      m.disponibilidad_actual <= m.stock_minimo ? "Disponibilidad baja" : "Disponibilidad correcta",
  }));
  res.json(materias);
});

router.get("/:id", (req, res) => {
  const materia = store.findById("materias", req.params.id);
  if (!materia) return res.status(404).json({ error: "Materia no encontrada" });
  res.json(materia);
});

router.patch("/:id", (req, res) => {
  const updated = store.update("materias", req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Materia no encontrada" });
  res.json(updated);
});

module.exports = router;
