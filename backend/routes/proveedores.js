const express = require("express");
const store = require("../data-store");

const router = express.Router();

function decorate(p, materias) {
  return {
    ...p,
    productos_nombres: p.productos_asociados.map((id) => {
      const m = materias.find((x) => x.id === id);
      return m ? m.nombre : id;
    }),
  };
}

router.get("/", (req, res) => {
  const materias = store.readAll("materias");
  const proveedores = store.readAll("proveedores").map((p) => decorate(p, materias));
  res.json(proveedores);
});

router.get("/:id", (req, res) => {
  const proveedor = store.findById("proveedores", req.params.id);
  if (!proveedor) return res.status(404).json({ error: "Proveedor no encontrado" });
  res.json(decorate(proveedor, store.readAll("materias")));
});

module.exports = router;
