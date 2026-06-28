const express = require("express");
const store = require("../data-store");

const router = express.Router();

const MARGEN_OBJETIVO_DEF = 0.7; // food cost objetivo 30% (margen bruto 70%)

// Redondeo "de carta": al múltiplo de 0,05 € más cercano hacia arriba.
function redondearPrecio(n) {
  if (!(n > 0)) return 0;
  return Math.ceil(n * 20) / 20;
}

// Calcula el escandallo de un producto: coste de materias, margen, rentabilidad
// y PVP recomendado para mantener el margen objetivo.
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

  // PVP recomendado para mantener el margen objetivo: coste / (1 - margen).
  const margenObjetivo = producto.margen_objetivo != null ? Number(producto.margen_objetivo) : MARGEN_OBJETIVO_DEF;
  const precioRecomendado = coste > 0 && margenObjetivo < 1 ? redondearPrecio(coste / (1 - margenObjetivo)) : 0;

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
    margen_objetivo: Math.round(margenObjetivo * 1000) / 1000,
    precio_recomendado: precioRecomendado,
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

// ── Crear / editar recetas (solo admin) ───────────────────────────────────
function soloAdmin(req, res) {
  if (!req.user || req.user.rol !== "admin") {
    res.status(403).json({ error: "Solo un administrador puede editar la carta." });
    return false;
  }
  return true;
}

function camposDe(body) {
  const c = {};
  if (body.nombre != null) c.nombre = String(body.nombre).trim();
  if (body.clave != null) c.clave = String(body.clave).trim();
  if (body.categoria != null) c.categoria = String(body.categoria).trim();
  if (body.descripcion != null) c.descripcion = String(body.descripcion).trim();
  if (body.precio_venta != null && body.precio_venta !== "") c.precio_venta = Number(body.precio_venta) || 0;
  if (body.margen_objetivo != null && body.margen_objetivo !== "") {
    let mo = Number(body.margen_objetivo);
    if (mo > 1) mo = mo / 100; // admite porcentaje (70) o fracción (0.7)
    if (mo >= 0 && mo < 1) c.margen_objetivo = mo;
  }
  if (Array.isArray(body.ingredientes)) {
    c.ingredientes = body.ingredientes
      .map((i) => ({ materia_id: String(i.materia_id || ""), cantidad: Number(i.cantidad) || 0 }))
      .filter((i) => i.materia_id && i.cantidad > 0);
  }
  if (body.activo != null) c.activo = !!body.activo;
  return c;
}

router.post("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const d = camposDe(req.body || {});
  if (!d.nombre) return res.status(400).json({ error: "Indica el nombre de la receta." });
  const producto = {
    id: store.nextId("prod", "productos"),
    clave: d.clave || d.nombre,
    nombre: d.nombre,
    categoria: d.categoria || "",
    descripcion: d.descripcion || "",
    precio_venta: d.precio_venta || 0,
    margen_objetivo: d.margen_objetivo != null ? d.margen_objetivo : MARGEN_OBJETIVO_DEF,
    activo: d.activo !== false,
    ingredientes: d.ingredientes || [],
    creado_en: new Date().toISOString(),
  };
  store.insert("productos", producto);
  res.status(201).json(escandallar(producto, store.readAll("materias")));
});

router.put("/:id", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const existe = store.findById("productos", req.params.id);
  if (!existe) return res.status(404).json({ error: "Producto no encontrado" });
  const d = camposDe(req.body || {});
  if (d.nombre === "") return res.status(400).json({ error: "El nombre no puede quedar vacío." });
  const actualizado = store.update("productos", req.params.id, d);
  res.json(escandallar(actualizado, store.readAll("materias")));
});

router.delete("/:id", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const existe = store.findById("productos", req.params.id);
  if (!existe) return res.status(404).json({ error: "Producto no encontrado" });
  // Baja lógica: lo marcamos inactivo (conserva histórico de ventas).
  store.update("productos", req.params.id, { activo: false });
  res.json({ ok: true });
});

module.exports = router;
