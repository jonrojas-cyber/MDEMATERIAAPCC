const express = require("express");
const store = require("../data-store");
const compras = require("../compras");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(store.readAll("pedidos").slice().reverse());
});

// Sugerencias de compra agrupadas por proveedor (lo mismo que el aviso de 16:00).
router.get("/sugerencias", (req, res) => {
  res.json(compras.sugerencias());
});

router.get("/:id", (req, res) => {
  const p = store.findById("pedidos", req.params.id);
  if (!p) return res.status(404).json({ error: "Pedido no encontrado" });
  res.json(p);
});

// Crear pedido: proveedor + líneas (materia, cantidad, precio esperado).
router.post("/", (req, res) => {
  const { proveedor_id, lineas } = req.body || {};
  if (!proveedor_id) return res.status(400).json({ error: "Indica el proveedor" });

  const candidatas = (Array.isArray(lineas) ? lineas : []).filter((l) => l.materia_id && Number(l.cantidad) > 0);
  if (!candidatas.length) return res.status(400).json({ error: "Añade al menos un producto con cantidad" });

  const prov = store.findById("proveedores", proveedor_id);
  const materias = store.readAll("materias");
  const lineasN = candidatas.map((l) => {
    const m = materias.find((x) => x.id === l.materia_id);
    return {
      materia_id: l.materia_id,
      nombre: m ? m.nombre : l.materia_id,
      unidad: m ? m.unidad : "",
      cantidad: Number(l.cantidad),
      precio_esperado: l.precio_esperado != null ? Number(l.precio_esperado) : m ? m.coste_medio : 0,
    };
  });

  const ahora = new Date();
  const pedido = {
    id: store.nextId("ped", "pedidos"),
    codigo: `PED-${ahora.toISOString().slice(0, 10).replace(/-/g, "")}-${String(store.readAll("pedidos").length + 1).padStart(3, "0")}`,
    proveedor_id,
    proveedor_nombre: prov ? prov.nombre : proveedor_id,
    fecha: ahora.toISOString(),
    estado: "borrador",
    lineas: lineasN,
    total_estimado: Math.round(lineasN.reduce((s, l) => s + l.cantidad * l.precio_esperado, 0) * 100) / 100,
  };
  store.insert("pedidos", pedido);
  res.status(201).json(pedido);
});

// Marcar un pedido como enviado al proveedor.
router.post("/:id/enviado", (req, res) => {
  const p = store.update("pedidos", req.params.id, { estado: "enviado", enviado_en: new Date().toISOString() });
  if (!p) return res.status(404).json({ error: "Pedido no encontrado" });
  res.json(p);
});

module.exports = router;
