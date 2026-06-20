const express = require("express");
const store = require("../data-store");
const labelService = require("../label-service");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(store.readAll("etiquetas").slice().reverse());
});

router.get("/lote/:loteId", (req, res) => {
  const etiquetas = store.readAll("etiquetas").filter((e) => e.lote_id === req.params.loteId);
  res.json(etiquetas.slice().reverse());
});

router.post("/:id/reimprimir", (req, res) => {
  const etiqueta = labelService.registrarImpresion(req.params.id, {
    usuario: req.body.usuario,
    impresora: req.body.impresora || "Navegador",
  });
  if (!etiqueta) return res.status(404).json({ error: "Etiqueta no encontrada" });
  res.json(etiqueta);
});

module.exports = router;
