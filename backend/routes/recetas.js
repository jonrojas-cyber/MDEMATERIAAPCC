const express = require("express");
const store = require("../data-store");

const router = express.Router();

router.get("/", (req, res) => {
  const recetas = store.readAll("recetas");
  const materias = store.readAll("materias");
  const enriched = recetas.map((r) => ({
    ...r,
    ingredientes: r.ingredientes.map((ing) => {
      const materia = materias.find((m) => m.id === ing.materia_id);
      return { ...ing, nombre: materia ? materia.nombre : ing.materia_id, unidad: materia ? materia.unidad : "" };
    }),
  }));
  res.json(enriched);
});

router.get("/:id", (req, res) => {
  const receta = store.findById("recetas", req.params.id);
  if (!receta) return res.status(404).json({ error: "Receta no encontrada" });
  res.json(receta);
});

module.exports = router;
