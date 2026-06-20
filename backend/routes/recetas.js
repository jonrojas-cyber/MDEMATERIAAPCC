const express = require("express");
const store = require("../data-store");
const { costePorUnidad, tamanosLote } = require("../costing");

const router = express.Router();

function horasRestantes(lote) {
  return (new Date(lote.caduca_en).getTime() - Date.now()) / (1000 * 60 * 60);
}

router.get("/", (req, res) => {
  const recetas = store.readAll("recetas");
  const materias = store.readAll("materias");
  const lotes = store.readAll("lotes");

  const enriched = recetas.map((r) => {
    const vigentes = lotes.filter((l) => l.receta_id === r.id && horasRestantes(l) > 0);
    const disponibleAhora = vigentes.reduce((sum, l) => sum + l.cantidad_restante, 0);
    return {
      ...r,
      ingredientes: r.ingredientes.map((ing) => {
        const materia = materias.find((m) => m.id === ing.materia_id);
        return { ...ing, nombre: materia ? materia.nombre : ing.materia_id, unidad: materia ? materia.unidad : "" };
      }),
      disponible_ahora: disponibleAhora,
      opciones_tamano: tamanosLote(r).map((t) => ({
        cantidad: t,
        coste_estimado: Math.round(costePorUnidad(r) * t * 100) / 100,
      })),
    };
  });
  res.json(enriched);
});

router.get("/:id", (req, res) => {
  const receta = store.findById("recetas", req.params.id);
  if (!receta) return res.status(404).json({ error: "Receta no encontrada" });
  res.json(receta);
});

module.exports = router;
