const express = require("express");
const store = require("../data-store");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(store.readAll("recepciones"));
});

// Entrada manual (la foto de albarán y el OCR se añaden en una fase posterior)
router.post("/", (req, res) => {
  const { proveedor_id, importe_total } = req.body;
  if (!proveedor_id) return res.status(400).json({ error: "Indica el proveedor de la recepción" });
  const recepcion = {
    id: store.nextId("rcp", "recepciones"),
    proveedor_id,
    fecha: new Date().toISOString(),
    foto_albaran_url: null,
    estado: "Pendiente de confirmar",
    importe_total: importe_total || 0,
    pendiente_pago: importe_total || 0,
  };
  store.insert("recepciones", recepcion);
  res.status(201).json(recepcion);
});

router.post("/:id/confirmar", (req, res) => {
  const recepcion = store.update("recepciones", req.params.id, { estado: "Confirmada" });
  if (!recepcion) return res.status(404).json({ error: "Recepción no encontrada" });
  res.json(recepcion);
});

module.exports = router;
