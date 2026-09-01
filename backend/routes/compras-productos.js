// Productos de compra por proveedor: lo que compramos a cada proveedor, con su
// formato, precio pactado (sin IVA / IVA / con IVA), precio unitario real,
// foto, código, referencia, stock y alérgenos. Base para escandallos y para
// cotejar albaranes contra el precio pactado.

const express = require("express");
const store = require("../data-store");

const router = express.Router();
const jsonGrande = express.json({ limit: "8mb" }); // foto del producto en base64

const CATEGORIAS = ["Café", "Matcha", "Pan", "Panadería", "Bollería", "Charcutería", "Packaging", "Leche", "Fruta y verdura", "Limpieza", "Otros"];
const FORMATOS = ["kg", "g", "litro", "unidad", "caja", "pack"];
const ESTADOS_ART = ["Pendiente de completar", "Completo"];
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
  // Coste por unidad base (si el formato está enlazado a una materia): precio del
  // formato ÷ contenido en unidad base. Es la conversión formato→producto base.
  const cb = num(p.contenido_base);
  const costeBase = cb > 0 ? round(conIva / cb, 6) : null;
  return { ...p, precio_con_iva: conIva, precio_unitario_real: unitario, coste_base: costeBase };
}

// Evalúa si a un artículo le falta tarifa para poder usarse (escandallos/pedidos).
// No inventa nada: si falta precio, formato o contenido, queda «Pendiente de
// completar» y se listan los campos que faltan para avisar en la app.
function evaluarEstado(p) {
  const faltan = [];
  if (num(p.precio_sin_iva) <= 0) faltan.push("precio");
  if (p.iva == null) faltan.push("IVA");
  if (!p.formato) faltan.push("formato");
  if (num(p.cantidad_formato) <= 0) faltan.push("contenido");
  const pendiente = faltan.length > 0;   // se deriva de los datos, no de un flag fijo
  return { ...p, faltan, pendiente, estado: pendiente ? "Pendiente de completar" : "Completo" };
}

function slim(p) {
  const { foto_url, ...resto } = evaluarEstado(p);
  return { ...resto, tiene_foto: !!foto_url };
}

router.get("/meta", (req, res) => {
  res.json({ categorias: CATEGORIAS, formatos: FORMATOS, alergenos: ALERGENOS, estados: ESTADOS_ART });
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
  res.json(evaluarEstado(p));
});

function camposDe(body) {
  const c = {};
  const str = (k) => { if (body[k] != null) c[k] = String(body[k]).trim(); };
  const n = (k) => { if (body[k] != null && body[k] !== "") c[k] = num(body[k]); };
  ["proveedor_id", "nombre", "categoria", "formato", "foto_url", "codigo_interno", "referencia_proveedor", "caducidad_habitual", "notas"].forEach(str);
  ["cantidad_formato", "precio_sin_iva", "iva", "stock_minimo", "stock_ideal", "contenido_base"].forEach(n);
  // Enlace al producto base (materia): un formato de compra aporta `contenido_base`
  // unidades de la materia (p. ej. caja = 10.000 g). Así el pedido/precio va por
  // formato y el stock/escandallo por la unidad base. Vacío = sin enlazar.
  if (body.materia_id != null) c.materia_id = String(body.materia_id).trim() || null;
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
    materia_id: d.materia_id || null,
    contenido_base: d.contenido_base || 0,
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

  // Histórico de precios: si cambia el precio pactado, lo registramos.
  const antes = round(num(existe.precio_con_iva), 4);
  const ahora = round(num(fusion.precio_con_iva), 4);
  if (Math.abs(ahora - antes) > 1e-6) {
    store.insert("precios_historico", {
      id: store.nextId("ph", "precios_historico"),
      producto_id: existe.id,
      proveedor_id: existe.proveedor_id,
      fecha: new Date().toISOString(),
      precio_anterior: antes,
      precio_nuevo: ahora,
      precio_anterior_sin_iva: round(num(existe.precio_sin_iva), 4),
      precio_nuevo_sin_iva: round(num(fusion.precio_sin_iva), 4),
      motivo: (req.body && req.body.motivo ? String(req.body.motivo).trim() : "") || "Actualización de precio",
      responsable: (req.body && req.body.responsable ? String(req.body.responsable).trim() : "") || "Sin asignar",
      documento_url: (req.body && req.body.precio_doc) ? String(req.body.precio_doc) : null,
    });
  }

  const actualizado = store.update("compras_productos", req.params.id, fusion);
  res.json(actualizado);
});

// Histórico de precios de un producto (más reciente primero).
router.get("/:id/historico", (req, res) => {
  const hist = store
    .readAll("precios_historico")
    .filter((h) => h.producto_id === req.params.id)
    .map((h) => { const { documento_url, ...resto } = h; return { ...resto, tiene_documento: !!documento_url }; })
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  res.json(hist);
});

router.delete("/:id", (req, res) => {
  const existe = store.findById("compras_productos", req.params.id);
  if (!existe) return res.status(404).json({ error: "Producto no encontrado" });
  const items = store.readAll("compras_productos").filter((p) => p.id !== req.params.id);
  store.writeAll("compras_productos", items);
  res.json({ ok: true });
});

module.exports = router;
