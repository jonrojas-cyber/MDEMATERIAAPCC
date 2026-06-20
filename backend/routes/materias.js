const express = require("express");
const store = require("../data-store");

const router = express.Router();

function decorate(m, proveedores) {
  const proveedor = proveedores.find((p) => p.id === m.proveedor_id);
  return {
    ...m,
    disponibilidad_estado:
      m.disponibilidad_actual <= m.stock_minimo ? "Disponibilidad baja" : "Disponibilidad correcta",
    valor_stock_actual: Math.round(m.disponibilidad_actual * m.coste_medio * 100) / 100,
    proveedor_nombre: proveedor ? proveedor.nombre : "Sin proveedor asignado",
    proveedor_whatsapp: proveedor ? proveedor.whatsapp : null,
  };
}

router.get("/", (req, res) => {
  const proveedores = store.readAll("proveedores");
  const materias = store.readAll("materias").map((m) => decorate(m, proveedores));
  res.json(materias);
});

router.get("/:id", (req, res) => {
  const materia = store.findById("materias", req.params.id);
  if (!materia) return res.status(404).json({ error: "Materia no encontrada" });
  res.json(decorate(materia, store.readAll("proveedores")));
});

router.patch("/:id", (req, res) => {
  const updated = store.update("materias", req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: "Materia no encontrada" });
  res.json(decorate(updated, store.readAll("proveedores")));
});

module.exports = router;
