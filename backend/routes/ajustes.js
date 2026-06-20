const express = require("express");
const store = require("../data-store");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(store.readAll("ajustes"));
});

router.post("/", (req, res) => {
  const { tipo_objetivo, objetivo_id, cantidad, motivo, coste_estimado, responsable, observacion } = req.body;
  if (!tipo_objetivo || !objetivo_id || !cantidad || !motivo) {
    return res.status(400).json({ error: "Indica materia o lote, cantidad y motivo del ajuste" });
  }
  const ajuste = {
    id: store.nextId("aju", "ajustes"),
    tipo_objetivo,
    objetivo_id,
    cantidad,
    motivo,
    coste_estimado: coste_estimado || 0,
    responsable: responsable || "Sin asignar",
    observacion: observacion || "",
    fecha: new Date().toISOString(),
  };
  store.insert("ajustes", ajuste);
  res.status(201).json(ajuste);
});

module.exports = router;
