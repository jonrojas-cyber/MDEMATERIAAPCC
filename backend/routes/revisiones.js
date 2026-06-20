const express = require("express");
const store = require("../data-store");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(store.readAll("revisiones"));
});

router.post("/", (req, res) => {
  const { tipo, valor, estado, accion_correctiva, responsable } = req.body;
  if (!tipo || !valor || !estado) {
    return res.status(400).json({ error: "Indica tipo, valor y estado de la revisión" });
  }
  const revision = {
    id: store.nextId("rev", "revisiones"),
    tipo,
    valor,
    estado,
    accion_correctiva: accion_correctiva || "",
    responsable: responsable || "Sin asignar",
    fecha: new Date().toISOString(),
  };
  store.insert("revisiones", revision);
  res.status(201).json(revision);
});

router.post("/:id/resolver", (req, res) => {
  const revision = store.findById("revisiones", req.params.id);
  if (!revision) return res.status(404).json({ error: "Revisión no encontrada" });
  const actualizada = store.update("revisiones", req.params.id, {
    estado: "Correcto",
    accion_correctiva: "",
    resuelta_en: new Date().toISOString(),
  });
  res.json(actualizada);
});

module.exports = router;
