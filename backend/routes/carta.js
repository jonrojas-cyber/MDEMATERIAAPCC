const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Calcula el escandallo de un producto: coste de materias, margen y rentabilidad.
function escandallar(producto, materias) {
  const indice = {};
  materias.forEach((m) => (indice[m.id] = m));

  let costeEstimado = false;
  const desglose = (producto.ingredientes || []).map((ing) => {
    const m = indice[ing.materia_id];
    const costeUnit = m ? m.coste_medio : 0;
    if (!m || m.coste_estimado) costeEstimado = true;
    const coste = Math.round(costeUnit * ing.cantidad * 10000) / 10000;
    return {
      materia_id: ing.materia_id,
      nombre: m ? m.nombre : ing.materia_id,
      cantidad: ing.cantidad,
      unidad: m ? m.unidad : "",
      coste,
    };
  });

  const coste = Math.round(desglose.reduce((s, d) => s + d.coste, 0) * 100) / 100;
  const precio = producto.precio_venta || 0;
  const margenBruto = precio > 0 ? (precio - coste) / precio : 0;

  // Semáforo de rentabilidad pensado para hostelería (food cost objetivo < 30%).
  const foodCost = precio > 0 ? coste / precio : 1;
  let rentabilidad = "alta";
  if (foodCost > 0.35) rentabilidad = "baja";
  else if (foodCost > 0.28) rentabilidad = "media";

  return {
    id: producto.id,
    clave: producto.clave,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    categoria: producto.categoria,
    activo: producto.activo !== false,
    precio_venta: precio,
    coste,
    margen_bruto: Math.round(margenBruto * 1000) / 1000,
    margen_euros: Math.round((precio - coste) * 100) / 100,
    food_cost: Math.round(foodCost * 1000) / 1000,
    rentabilidad,
    coste_estimado: costeEstimado || producto.cantidades_estimadas === true,
    ingredientes: desglose,
  };
}

// GET /api/carta — productos con coste, margen y rentabilidad + resumen de la carta.
router.get("/", (req, res) => {
  const materias = store.readAll("materias");
  const productos = store.readAll("productos").filter((p) => p.activo !== false);
  const items = productos.map((p) => escandallar(p, materias));

  const conPrecio = items.filter((i) => i.precio_venta > 0);
  const margenMedio = conPrecio.length
    ? Math.round((conPrecio.reduce((s, i) => s + i.margen_bruto, 0) / conPrecio.length) * 1000) / 1000
    : 0;

  res.json({
    margen_medio: margenMedio,
    food_cost_medio: conPrecio.length
      ? Math.round((conPrecio.reduce((s, i) => s + i.food_cost, 0) / conPrecio.length) * 1000) / 1000
      : 0,
    total_productos: items.length,
    hay_estimaciones: items.some((i) => i.coste_estimado),
    productos: items.sort((a, b) => b.margen_bruto - a.margen_bruto),
  });
});

// GET /api/carta/:id — escandallo detallado de un producto.
router.get("/:id", (req, res) => {
  const producto = store.findById("productos", req.params.id);
  if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(escandallar(producto, store.readAll("materias")));
});

module.exports = router;
