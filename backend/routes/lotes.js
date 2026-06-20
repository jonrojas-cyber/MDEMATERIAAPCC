const express = require("express");
const store = require("../data-store");

const router = express.Router();

function decorate(lote) {
  const recetas = store.readAll("recetas");
  const receta = recetas.find((r) => r.id === lote.receta_id);
  const ahora = new Date();
  const caduca = new Date(lote.caduca_en);
  const horasRestantes = (caduca.getTime() - ahora.getTime()) / (1000 * 60 * 60);
  return {
    ...lote,
    nombre: receta ? receta.nombre : lote.receta_id,
    horas_restantes: Math.round(horasRestantes * 10) / 10,
    caduca_pronto: horasRestantes <= 6 && horasRestantes > 0,
    caducado: horasRestantes <= 0,
  };
}

router.get("/", (req, res) => {
  const lotes = store.readAll("lotes").map(decorate);
  res.json(lotes);
});

router.get("/:id", (req, res) => {
  const lote = store.findById("lotes", req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado" });
  res.json(decorate(lote));
});

router.patch("/:id", (req, res) => {
  const updated = store.update("lotes", req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Lote no encontrado" });
  res.json(decorate(updated));
});

router.post("/:id/dar-de-baja", (req, res) => {
  const lote = store.findById("lotes", req.params.id);
  if (!lote) return res.status(404).json({ error: "Lote no encontrado" });

  const recetas = store.readAll("recetas");
  const receta = recetas.find((r) => r.id === lote.receta_id);
  const costePorUnidad = require("../costing").costePorUnidad;
  const coste = receta ? Math.round(costePorUnidad(receta) * lote.cantidad_restante * 100) / 100 : 0;

  if (lote.cantidad_restante > 0) {
    store.insert("ajustes", {
      id: store.nextId("aju", "ajustes"),
      tipo_objetivo: "lote",
      objetivo_id: lote.id,
      cantidad: lote.cantidad_restante,
      motivo: "fuera de vida útil",
      coste_estimado: coste,
      responsable: (req.body && req.body.responsable) || "Sin asignar",
      observacion: `Baja automática del lote ${lote.codigo} al superar su vida útil`,
      fecha: new Date().toISOString(),
    });
  }

  const actualizado = store.update("lotes", req.params.id, {
    estado: "Fuera de servicio",
    cantidad_restante: 0,
  });
  res.json(decorate(actualizado));
});

module.exports = router;
