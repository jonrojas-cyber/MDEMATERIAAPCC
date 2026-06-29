const express = require("express");
const store = require("../data-store");

const router = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// ALMACÉN · arquitectura jerárquica de 3 niveles
//   Nivel 1: Macrocategoría  →  Nivel 2: Subcategoría  →  Nivel 3: Producto
// La TAXONOMÍA es la única fuente de verdad; frontend y backend la comparten.
// Preparado para multi-local: cada producto puede llevar `local_id` (futuro);
// hoy se asume un único local ("principal").
// ──────────────────────────────────────────────────────────────────────────
const TAXONOMIA = {
  "Materia Prima": [
    "Café, Matcha y Té",
    "Lácteos y Bebidas Vegetales",
    "Proteínas",
    "Vegetales y Fruta",
    "Panadería y Bollería",
    "Seco y Despensa",
    "Congelado",
  ],
  Elaboraciones: ["Cremas", "Salsas", "Producciones Cocina", "Producciones Barra"],
  "Bebidas Terminadas": ["Refrescos", "Zumos", "RTD M de Materia", "Alcohol"],
  Consumibles: ["Packaging", "Vasos y Tapas", "Etiquetas", "Servilletas", "Material Oficina"],
  "Limpieza y APPCC": ["Químicos", "Desechables", "APPCC", "Uniformidad"],
};
const MACROS = Object.keys(TAXONOMIA);
const DEFECTO = { macro: "Materia Prima", sub: "Seco y Despensa" }; // catch-all real (sin "Sin categoría")

// Clasificador automático por nombre, para migrar el almacén actual sin huecos.
// El primer patrón que casa manda; si un producto tiene macro/sub fijados a mano,
// esos ganan (ver categoriaDe). El orden importa (lácteo antes que crema, etc.).
const CLASIFICADOR = [
  [/matcha|t[eé] verde|sencha|hoji|rooibos/i, "Materia Prima", "Café, Matcha y Té"],
  [/caf[eé]|cold ?brew|espresso|tueste|robusta|ar[aá]bica/i, "Materia Prima", "Café, Matcha y Té"],
  [/leche|l[aá]cteo|avena|nata|yogur|bebida vegetal|soja|crema de leche|mantequilla|queso/i, "Materia Prima", "Lácteos y Bebidas Vegetales"],
  [/pollo|ventresca|jam[oó]n|short ?rib|carne|at[uú]n|salm[oó]n|huevo|gamba|bacon|pavo|cerdo|ternera|anchoa/i, "Materia Prima", "Proteínas"],
  [/congelad|helado|hielo/i, "Materia Prima", "Congelado"],
  [/aguacate|tomate|lima|lim[oó]n|hierba|berenjena|encurtido|lechuga|r[uú]cula|pepino|fruta|verdura|cebolla|zanahoria|manzana|pl[aá]tano|fresa/i, "Materia Prima", "Vegetales y Fruta"],
  [/\bpan\b|bollo|masa|bizcocho|galleta|croissant|brioche|focaccia|chapata/i, "Materia Prima", "Panadería y Bollería"],
  [/crema(?! de leche)/i, "Elaboraciones", "Cremas"],
  [/salsa|alioli|mayonesa|pesto|hummus|guacamole|vinagreta|chimichurri/i, "Elaboraciones", "Salsas"],
  [/aove|aceite|\bsal\b|vinagre|az[uú]car|especia|pistacho|fruto seco|harina|arroz|legumbre|conserva|miel|cacao/i, "Materia Prima", "Seco y Despensa"],
  [/refresco|t[oó]nica|soda|cola\b|fanta|aquarius|nestea/i, "Bebidas Terminadas", "Refrescos"],
  [/zumo|n[eé]ctar/i, "Bebidas Terminadas", "Zumos"],
  [/\brtd\b|botella m|lata m/i, "Bebidas Terminadas", "RTD M de Materia"],
  [/vino|cerveza|\bgin\b|\bron\b|vodka|licor|verm[uú]|alcohol|whisky|cava|sidra/i, "Bebidas Terminadas", "Alcohol"],
  [/agua/i, "Bebidas Terminadas", "Refrescos"],
  [/vaso|tapa\b/i, "Consumibles", "Vasos y Tapas"],
  [/etiqueta/i, "Consumibles", "Etiquetas"],
  [/servilleta/i, "Consumibles", "Servilletas"],
  [/film|papel film|bolsa|caja|packaging|envase|bandeja|portavasos/i, "Consumibles", "Packaging"],
  [/boli|folio|oficina|impresora|t[oó]ner|grapa|cinta/i, "Consumibles", "Material Oficina"],
  [/lej[ií]a|desengrasante|desinfect|detergente|qu[ií]mico|sanitiz|abrillantador/i, "Limpieza y APPCC", "Químicos"],
  [/guante|bayeta|papel sec|desechable|estropajo/i, "Limpieza y APPCC", "Desechables"],
  [/appcc|term[oó]metro|registro|control temp|tira ph/i, "Limpieza y APPCC", "APPCC"],
  [/uniforme|delantal|gorro|camiseta|mandil/i, "Limpieza y APPCC", "Uniformidad"],
];
function clasificar(nombre) {
  const n = String(nombre || "");
  for (const [re, macro, sub] of CLASIFICADOR) if (re.test(n)) return { macro, sub };
  return { ...DEFECTO };
}
// macro/sub efectivos: lo fijado a mano si es válido; si no, clasificación por nombre.
function categoriaDe(m) {
  if (m.macro && TAXONOMIA[m.macro] && TAXONOMIA[m.macro].includes(m.subcategoria)) {
    return { macro: m.macro, sub: m.subcategoria };
  }
  return clasificar(m.nombre);
}

// ── Estado del stock (semáforo) ────────────────────────────────────────────
// Rojo = crítico (≤ mínimo) · Amarillo = por pedir (≤ punto de pedido) · Verde = correcto.
function puntoPedidoDe(m) {
  if (m.punto_pedido != null && m.punto_pedido !== "") return Number(m.punto_pedido);
  return Math.round((Number(m.stock_minimo) || 0) * 1.3); // por defecto, 30% por encima del mínimo
}
function optimoDe(m) {
  if (m.stock_optimo != null && m.stock_optimo !== "") return Number(m.stock_optimo);
  return m.stock_ideal != null ? Number(m.stock_ideal) : null;
}
function estadoStock(m) {
  const disp = Number(m.disponibilidad_actual) || 0;
  const min = Number(m.stock_minimo) || 0;
  const pp = puntoPedidoDe(m);
  if (disp <= min) return { estado: "critico", color: "#b5462a", etiqueta: "Stock crítico" };
  if (disp <= pp) return { estado: "por_pedir", color: "#c79a3a", etiqueta: "Por pedir" };
  return { estado: "correcto", color: "#5b7a4a", etiqueta: "Correcto" };
}

function decorate(m, proveedores) {
  const proveedor = proveedores.find((p) => p.id === m.proveedor_id);
  const cat = categoriaDe(m);
  const est = estadoStock(m);
  return {
    ...m,
    macro: cat.macro,
    subcategoria: cat.sub,
    estado_stock: est.estado,
    estado_stock_color: est.color,
    estado_stock_etiqueta: est.etiqueta,
    stock_bajo: est.estado !== "correcto",
    punto_pedido: puntoPedidoDe(m),
    stock_optimo: optimoDe(m),
    valor_stock_actual: Math.round((Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0) * 100) / 100,
    proveedor_nombre: proveedor ? proveedor.nombre : "Sin proveedor asignado",
    proveedor_whatsapp: proveedor ? proveedor.whatsapp : null,
  };
}

// Árbol del almacén con conteos por macro y subcategoría (para la navegación).
router.get("/arbol", (req, res) => {
  const proveedores = store.readAll("proveedores");
  const materias = store.readAll("materias").map((m) => decorate(m, proveedores));
  const macros = MACROS.map((macro) => {
    const items = materias.filter((m) => m.macro === macro);
    const subs = TAXONOMIA[macro].map((sub) => {
      const li = items.filter((m) => m.subcategoria === sub);
      return {
        subcategoria: sub,
        total: li.length,
        criticos: li.filter((m) => m.estado_stock === "critico").length,
        por_pedir: li.filter((m) => m.estado_stock === "por_pedir").length,
      };
    });
    return {
      macro,
      total: items.length,
      criticos: items.filter((m) => m.estado_stock === "critico").length,
      por_pedir: items.filter((m) => m.estado_stock === "por_pedir").length,
      subcategorias: subs,
    };
  });
  res.json({ taxonomia: TAXONOMIA, macros });
});

// Lista filtrable: ?macro= &sub= &q= (nombre/código/ubicación) &ubicacion= &estado=
router.get("/", (req, res) => {
  const proveedores = store.readAll("proveedores");
  let materias = store.readAll("materias").map((m) => decorate(m, proveedores));
  const { macro, sub, q, ubicacion, estado } = req.query;
  if (macro) materias = materias.filter((m) => m.macro === macro);
  if (sub) materias = materias.filter((m) => m.subcategoria === sub);
  if (estado) materias = materias.filter((m) => m.estado_stock === estado);
  if (ubicacion) {
    const u = String(ubicacion).toLowerCase();
    materias = materias.filter((m) => (m.ubicacion || "").toLowerCase().includes(u));
  }
  if (q) {
    const s = String(q).toLowerCase();
    materias = materias.filter(
      (m) =>
        (m.nombre || "").toLowerCase().includes(s) ||
        (m.codigo_interno || "").toLowerCase().includes(s) ||
        (m.id || "").toLowerCase().includes(s) ||
        (m.ubicacion || "").toLowerCase().includes(s) ||
        (m.proveedor_nombre || "").toLowerCase().includes(s)
    );
  }
  res.json(materias);
});

router.get("/:id", (req, res) => {
  const materia = store.findById("materias", req.params.id);
  if (!materia) return res.status(404).json({ error: "Materia no encontrada" });
  res.json(decorate(materia, store.readAll("proveedores")));
});

// Campos editables del producto (nivel 3). Schema-less: lo que no se use hoy
// queda guardado para automatizaciones futuras (compras, costes, multi-local).
const CAMPOS = [
  "nombre",
  "codigo_interno",
  "proveedor_id",
  "proveedores_alt",
  "macro",
  "subcategoria",
  "unidad", // unidad de consumo (compat con el resto del sistema)
  "unidad_compra",
  "unidad_consumo",
  "conversion", // nº de unidades de consumo por unidad de compra
  "precio_compra",
  "precio_pactado",
  "iva",
  "disponibilidad_actual",
  "stock_minimo",
  "stock_optimo",
  "punto_pedido",
  "fecha_ultima_compra",
  "vida_util_horas",
  "lote",
  "ubicacion",
  "foto_url",
  "foto_etiqueta_url",
  "observaciones",
  "local_id",
];
const NUMERICOS = [
  "conversion",
  "precio_compra",
  "precio_pactado",
  "iva",
  "disponibilidad_actual",
  "stock_minimo",
  "stock_optimo",
  "punto_pedido",
  "vida_util_horas",
];

function recogerCampos(body) {
  const out = {};
  for (const k of CAMPOS) if (body[k] !== undefined) out[k] = body[k];
  for (const k of NUMERICOS) if (out[k] !== undefined && out[k] !== "") out[k] = Number(out[k]) || 0;
  // Unidad de consumo es el "unidad" canónico del sistema.
  if (out.unidad_consumo && !out.unidad) out.unidad = out.unidad_consumo;
  return out;
}

function validarCategoria(out, res) {
  if (out.macro != null && !TAXONOMIA[out.macro]) {
    res.status(400).json({ error: "Esa macrocategoría no existe. Revísalo antes de continuar." });
    return false;
  }
  if (out.subcategoria != null) {
    const macro = out.macro || null;
    if (macro && !TAXONOMIA[macro].includes(out.subcategoria)) {
      res.status(400).json({ error: "Esa subcategoría no pertenece a la macrocategoría. Esto no cuadra." });
      return false;
    }
    if (!macro) {
      // Si solo mandan sub, deducimos la macro a la que pertenece.
      const m = MACROS.find((mm) => TAXONOMIA[mm].includes(out.subcategoria));
      if (!m) {
        res.status(400).json({ error: "Esa subcategoría no existe. Revísalo antes de continuar." });
        return false;
      }
      out.macro = m;
    }
  }
  return true;
}

// Crear producto (nivel 3). Obligatorios: nombre, macro y subcategoría.
router.post("/", (req, res) => {
  const out = recogerCampos(req.body || {});
  if (!out.nombre || !String(out.nombre).trim()) {
    return res.status(400).json({ error: "Indica el nombre del producto." });
  }
  if (!out.macro || !out.subcategoria) {
    return res.status(400).json({ error: "Elige macrocategoría y subcategoría." });
  }
  if (!validarCategoria(out, res)) return;
  const nuevo = {
    id: store.nextId("mat", "materias"),
    nombre: String(out.nombre).trim(),
    unidad: out.unidad || out.unidad_consumo || "ud",
    disponibilidad_actual: out.disponibilidad_actual || 0,
    stock_minimo: out.stock_minimo || 0,
    coste_medio: out.precio_compra ? Number(out.precio_compra) : 0,
    local_id: out.local_id || "principal",
    creado_en: new Date().toISOString(),
    ...out,
  };
  store.insert("materias", nuevo);
  res.status(201).json(decorate(nuevo, store.readAll("proveedores")));
});

// Editar producto (whitelist de campos + validación de categoría).
router.patch("/:id", (req, res) => {
  const existe = store.findById("materias", req.params.id);
  if (!existe) return res.status(404).json({ error: "Materia no encontrada" });
  const out = recogerCampos(req.body || {});
  if (!validarCategoria(out, res)) return;
  const updated = store.update("materias", req.params.id, out);
  res.json(decorate(updated, store.readAll("proveedores")));
});

module.exports = router;
