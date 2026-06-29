const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Categorías del almacén (item 5): bloques claros para encontrar en segundos.
const CATEGORIAS = [
  "Repostería",
  "Sandwich",
  "Tostas",
  "Cócteles",
  "Refrescos",
  "Café",
  "Matcha",
  "Lácteos y bebidas vegetales",
  "Salsas y cremas",
  "Proteínas",
  "Seco",
  "Frío",
  "Congelado",
  "Material no alimentario",
  "Limpieza",
  "Packaging",
  "APPCC",
];
const SIN_CATEGORIA = "Sin categoría";

// Clasificación automática por nombre, para que el almacén no salga vacío el
// primer día. El admin puede recategorizar a mano (PATCH categoria) y eso manda.
const REGLAS = [
  [/matcha/i, "Matcha"],
  [/cold ?brew|caf[eé]|espresso|tueste/i, "Café"],
  [/leche|l[aá]cteo|avena|nata|yogur|bebida vegetal|soja/i, "Lácteos y bebidas vegetales"],
  [/pollo|ventresca|jam[oó]n|short ?rib|carne|at[uú]n|salm[oó]n|huevo|prote[ií]na/i, "Proteínas"],
  [/agua|refresco|t[oó]nica|soda|zumo|kombucha/i, "Refrescos"],
  [/salsa|crema|mayonesa|alioli|pesto|hummus|guacamole/i, "Salsas y cremas"],
  [/aove|aceite|sal\b|vinagre|az[uú]car|harina|especia|pistacho|fruto seco/i, "Seco"],
  [/pan|bollo|masa|bizcocho|galleta|repost/i, "Repostería"],
  [/aguacate|tomate|lima|lim[oó]n|hierba|berenjena|encurtido|verdura|fruta|lechuga|r[uú]cula|pepino/i, "Frío"],
  [/film|papel|servilleta|vaso|tapa|bolsa|caja|packaging|etiqueta/i, "Packaging"],
  [/limpiez|desinfect|lej[ií]a|detergente|bayeta/i, "Limpieza"],
];
function categorizarPorNombre(nombre) {
  const n = String(nombre || "");
  for (const [re, cat] of REGLAS) if (re.test(n)) return cat;
  return SIN_CATEGORIA;
}
function categoriaDe(m) {
  if (m.categoria && (CATEGORIAS.includes(m.categoria) || m.categoria === SIN_CATEGORIA)) return m.categoria;
  return categorizarPorNombre(m.nombre);
}

function decorate(m, proveedores) {
  const proveedor = proveedores.find((p) => p.id === m.proveedor_id);
  return {
    ...m,
    categoria: categoriaDe(m),
    subcategoria: m.subcategoria || "",
    disponibilidad_estado:
      m.disponibilidad_actual <= m.stock_minimo ? "Disponibilidad baja" : "Disponibilidad correcta",
    stock_bajo: m.disponibilidad_actual <= m.stock_minimo,
    valor_stock_actual: Math.round(m.disponibilidad_actual * m.coste_medio * 100) / 100,
    proveedor_nombre: proveedor ? proveedor.nombre : "Sin proveedor asignado",
    proveedor_whatsapp: proveedor ? proveedor.whatsapp : null,
  };
}

// Lista de categorías con conteo de materias y de stock bajo (para las tarjetas).
router.get("/categorias", (req, res) => {
  const proveedores = store.readAll("proveedores");
  const materias = store.readAll("materias").map((m) => decorate(m, proveedores));
  const orden = [...CATEGORIAS, SIN_CATEGORIA];
  const resumen = orden
    .map((cat) => {
      const items = materias.filter((m) => m.categoria === cat);
      return {
        categoria: cat,
        total: items.length,
        stock_bajo: items.filter((m) => m.stock_bajo).length,
      };
    })
    .filter((c) => c.total > 0 || c.categoria !== SIN_CATEGORIA);
  res.json({ categorias: CATEGORIAS, resumen });
});

router.get("/", (req, res) => {
  const proveedores = store.readAll("proveedores");
  let materias = store.readAll("materias").map((m) => decorate(m, proveedores));
  if (req.query.categoria) materias = materias.filter((m) => m.categoria === req.query.categoria);
  res.json(materias);
});

router.get("/:id", (req, res) => {
  const materia = store.findById("materias", req.params.id);
  if (!materia) return res.status(404).json({ error: "Materia no encontrada" });
  res.json(decorate(materia, store.readAll("proveedores")));
});

// Edición acotada (whitelist) para no permitir tocar campos sensibles por error.
router.patch("/:id", (req, res) => {
  const permitido = ["categoria", "subcategoria", "ubicacion", "stock_minimo", "stock_ideal"];
  const patch = {};
  for (const k of permitido) if (req.body[k] !== undefined) patch[k] = req.body[k];
  if (patch.categoria != null && !CATEGORIAS.includes(patch.categoria) && patch.categoria !== SIN_CATEGORIA) {
    return res.status(400).json({ error: "Esa categoría no existe. Revísalo antes de continuar." });
  }
  if (patch.stock_minimo != null) patch.stock_minimo = Number(patch.stock_minimo) || 0;
  if (patch.stock_ideal != null) patch.stock_ideal = Number(patch.stock_ideal) || 0;
  const updated = store.update("materias", req.params.id, patch);
  if (!updated) return res.status(404).json({ error: "Materia no encontrada" });
  res.json(decorate(updated, store.readAll("proveedores")));
});

module.exports = router;
