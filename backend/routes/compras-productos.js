// Productos de compra por proveedor: lo que compramos a cada proveedor, con su
// formato, precio pactado (sin IVA / IVA / con IVA), precio unitario real,
// foto, código, referencia, stock y alérgenos. Base para escandallos y para
// cotejar albaranes contra el precio pactado.

const express = require("express");
const store = require("../data-store");

const router = express.Router();
const jsonGrande = express.json({ limit: "8mb" }); // foto del producto en base64

const CATEGORIAS = ["Café", "Matcha", "Pan", "Bollería", "Packaging", "Leche", "Fruta y verdura", "Limpieza", "Otros"];
const FORMATOS = ["kg", "g", "litro", "unidad", "caja", "pack"];
// 14 alérgenos de declaración obligatoria (UE).
const ALERGENOS = [
  "Gluten", "Crustáceos", "Huevos", "Pescado", "Cacahuetes", "Soja", "Lácteos",
  "Frutos de cáscara", "Apio", "Mostaza", "Sésamo", "Sulfitos", "Altramuces", "Moluscos",
];

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = (n, d = 4) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);

// Calcula precio con IVA y precio unitario real a partir de los datos base.
function calcular(p) {
  const sinIva = num(p.precio_sin_iva);
  const iva = num(p.iva);
  const cant = num(p.cantidad_formato);
  const conIva = round(sinIva * (1 + iva / 100), 4);
  const unitario = cant > 0 ? round(conIva / cant, 4) : conIva;
  return { ...p, precio_con_iva: conIva, precio_unitario_real: unitario };
}

function slim(p) {
  const { foto_url, ...resto } = p;
  return { ...resto, tiene_foto: !!foto_url };
}

router.get("/meta", (req, res) => {
  res.json({ categorias: CATEGORIAS, formatos: FORMATOS, alergenos: ALERGENOS });
});

// Listado (slim). Filtra por ?proveedor_id=...
router.get("/", (req, res) => {
  let items = store.readAll("compras_productos");
  if (req.query.proveedor_id) items = items.filter((p) => p.proveedor_id === req.query.proveedor_id);
  res.json(items.map(slim));
});

router.get("/:id", (req, res) => {
  const p = store.findById("compras_productos", req.params.id);
  if (!p) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(p);
});

function camposDe(body) {
  const c = {};
  const str = (k) => { if (body[k] != null) c[k] = String(body[k]).trim(); };
  const n = (k) => { if (body[k] != null && body[k] !== "") c[k] = num(body[k]); };
  ["proveedor_id", "nombre", "categoria", "formato", "foto_url", "codigo_interno", "referencia_proveedor", "caducidad_habitual", "notas"].forEach(str);
  ["cantidad_formato", "precio_sin_iva", "iva", "stock_minimo", "stock_ideal"].forEach(n);
  if (Array.isArray(body.alergenos)) c.alergenos = body.alergenos.filter((a) => ALERGENOS.includes(a));
  if (c.categoria && !CATEGORIAS.includes(c.categoria)) c.categoria = "Otros";
  if (c.formato && !FORMATOS.includes(c.formato)) c.formato = "unidad";
  return c;
}

router.post("/", jsonGrande, (req, res) => {
  const d = camposDe(req.body || {});
  if (!d.proveedor_id || !store.findById("proveedores", d.proveedor_id)) {
    return res.status(400).json({ error: "Indica a qué proveedor pertenece el producto." });
  }
  if (!d.nombre) return res.status(400).json({ error: "Indica el nombre del producto." });
  const base = {
    id: store.nextId("cpr", "compras_productos"),
    proveedor_id: d.proveedor_id,
    nombre: d.nombre,
    categoria: d.categoria || "Otros",
    formato: d.formato || "unidad",
    cantidad_formato: d.cantidad_formato || 1,
    precio_sin_iva: d.precio_sin_iva || 0,
    iva: d.iva != null ? d.iva : 10,
    foto_url: d.foto_url || null,
    codigo_interno: d.codigo_interno || "",
    referencia_proveedor: d.referencia_proveedor || "",
    stock_minimo: d.stock_minimo || 0,
    stock_ideal: d.stock_ideal || 0,
    caducidad_habitual: d.caducidad_habitual || "",
    alergenos: d.alergenos || [],
    notas: d.notas || "",
    creado_en: new Date().toISOString(),
  };
  const producto = calcular(base);
  store.insert("compras_productos", producto);
  res.status(201).json(producto);
});

router.put("/:id", jsonGrande, (req, res) => {
  const existe = store.findById("compras_productos", req.params.id);
  if (!existe) return res.status(404).json({ error: "Producto no encontrado" });
  const d = camposDe(req.body || {});
  if (d.nombre === "") return res.status(400).json({ error: "El nombre no puede quedar vacío." });
  const fusion = calcular({ ...existe, ...d });
  const actualizado = store.update("compras_productos", req.params.id, fusion);
  res.json(actualizado);
});

router.delete("/:id", (req, res) => {
  const existe = store.findById("compras_productos", req.params.id);
  if (!existe) return res.status(404).json({ error: "Producto no encontrado" });
  const items = store.readAll("compras_productos").filter((p) => p.id !== req.params.id);
  store.writeAll("compras_productos", items);
  res.json({ ok: true });
});

module.exports = router;
