const express = require("express");
const store = require("../data-store");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(store.readAll("proveedores"));
});

router.get("/:id", (req, res) => {
  const proveedor = store.findById("proveedores", req.params.id);
  if (!proveedor) return res.status(404).json({ error: "Proveedor no encontrado" });
  res.json(proveedor);
});

module.exports = router;
