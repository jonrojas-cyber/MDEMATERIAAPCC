const express = require("express");
const store = require("../data-store");
const compras = require("../compras");
const umbral = require("../umbral");

const router = express.Router();

// ── Unidad de PEDIDO ─────────────────────────────────────────────────────────
// El stock y el escandallo trabajan en la unidad base (g/ml/ud). Pero un pedido
// se hace en unidades "humanas": kg, litros, unidades. Este mapeo convierte una
// a otra sin inventar nada (solo múltiplos exactos).
function unidadPedido(u) {
  const s = String(u || "").toLowerCase().trim();
  if (["g", "gr", "gramo", "gramos"].includes(s)) return { unidad: "kg", factor: 1000, dec: 2 };
  if (["ml", "mililitro", "mililitros"].includes(s)) return { unidad: "L", factor: 1000, dec: 2 };
  if (s === "kg") return { unidad: "kg", factor: 1, dec: 2 };
  if (["l", "litro", "litros"].includes(s)) return { unidad: "L", factor: 1, dec: 2 };
  return { unidad: u || "ud", factor: 1, dec: 0 };
}
function rN(n, d) { const f = Math.pow(10, d == null ? 2 : d); return Math.round((Number(n) || 0) * f) / f; }
// Normaliza un nombre para comparar (minúsculas, sin acentos, sin signos): sirve para
// resolver un proveedor o un artículo por su NOMBRE cuando la IA no manda el id interno.
function normNombre(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }

function esAdmin(req) { return !!(req.user && req.user.rol === "admin"); }
// El equipo NUNCA ve coste/precio de compra (regla de negocio): se le entrega el
// catálogo con cantidades y unidades, pero SIN los euros por artículo.
function sinCostesCat(cat) {
  if (!cat) return cat;
  return Object.assign({}, cat, {
    sin_economico: true,
    articulos: (cat.articulos || []).map((a) => { const { precio_base, precio_pedido, ...resto } = a; return resto; }),
  });
}
// Un pedido lleva el coste recalculado (total + precio por línea): se oculta al equipo.
function sinCostesPedido(p) {
  if (!p) return p;
  const { total_estimado, ...resto } = p;
  if (Array.isArray(resto.lineas)) resto.lineas = resto.lineas.map((l) => { const { precio_esperado, precio_pedido, ...lr } = l; return lr; });
  return resto;
}

// Catálogo de un proveedor: sus artículos con precio ACTUALIZADO (coste real) en
// unidad de pedido, estado de stock y CANTIDAD SUGERIDA para reponer. Reutiliza el
// mismo cerebro de umbral que el aviso de las 16:00 (una sola fuente de verdad).
function catalogoProveedor(st, provId) {
  const prov = st.findById("proveedores", provId);
  if (!prov) return null;
  const aso = prov.productos_asociados || [];
  const materias = st.readAll("materias") || [];
  let mats = materias.filter((m) => m.proveedor_id === provId || aso.includes(m.id));
  mats = mats.slice().sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  const articulos = mats.map((m) => {
    const up = unidadPedido(m.unidad);
    const precioBase = Number(m.coste_medio) || 0;          // €/unidad base (g/ml/ud)
    const precioPedido = rN(precioBase * up.factor, 4);     // €/unidad de pedido (kg/L/ud)
    const estado = umbral.estadoStock(m);
    // Solo se sugiere reponer lo que de verdad lo necesita (por pedir / crítico);
    // lo que está por encima del punto de pedido se marca "stock ok", sin número.
    const sugBase = estado === "correcto" ? 0 : umbral.cantidadSugerida(m);
    return {
      materia_id: m.id,
      nombre: m.nombre,
      unidad_base: m.unidad || "ud",
      factor: up.factor,
      unidad_pedido: up.unidad,
      dec: up.dec,
      precio_base: precioBase,
      precio_pedido: precioPedido,
      disponibilidad_base: Number(m.disponibilidad_actual) || 0,
      disponibilidad_pedido: rN((Number(m.disponibilidad_actual) || 0) / up.factor, up.dec),
      stock_minimo: Number(m.stock_minimo) || 0,
      stock_ideal: Number(m.stock_ideal) || 0,
      estado,
      cantidad_sugerida: rN(sugBase / up.factor, up.dec),    // en unidad de pedido (0 si está ok)
    };
  });
  // Catálogo de COMPRA del proveedor (compras_productos, p.ej. extraído de facturas):
  // artículos que se le compran aunque no sean materias de stock. Se añaden si no los
  // cubre ya una materia (mismo nombre normalizado). Son pedibles con su precio.
  const norm = (s) => String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const vistos = new Set(articulos.map((a) => norm(a.nombre)));
  let calc = null; try { calc = require("../compras-productos-calc"); } catch (e) {}
  (st.readAll("compras_productos") || []).filter((c) => c.proveedor_id === provId && c.archivado !== true).forEach((c0) => {
    const c = calc && calc.calcular ? Object.assign({}, c0, calc.calcular(c0)) : c0;
    const nn = norm(c.nombre);
    if (!c.nombre || vistos.has(nn)) return;
    vistos.add(nn);
    const formato = c.formato || c.unidad || "ud";
    const precioPedido = c.precio_con_iva != null ? Number(c.precio_con_iva)
      : (Number(c.precio_sin_iva) || 0) * (1 + (Number(c.iva) || 0) / 100);
    const dec = /^(kg|l|litro|litros)$/i.test(formato) ? 2 : 0;
    articulos.push({
      compra_id: c.id,
      nombre: c.nombre,
      unidad_base: formato, factor: 1, unidad_pedido: formato, dec,
      precio_base: rN(precioPedido, 4), precio_pedido: rN(precioPedido, 4),
      disponibilidad_base: null, disponibilidad_pedido: null,
      stock_minimo: 0, stock_ideal: 0,
      estado: "catalogo", cantidad_sugerida: 0,
    });
  });
  articulos.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
  return {
    proveedor: {
      id: prov.id, nombre: prov.nombre, contacto: prov.contacto || "",
      whatsapp: prov.whatsapp || "", email: prov.email || "",
      dias_reparto: prov.dias_reparto || prov.dias_entrega || prov.dias_pedido || [],
      pedido_minimo: prov.pedido_minimo != null ? prov.pedido_minimo : null,
      hora_limite: prov.hora_limite || null,
      categoria: prov.categoria || null,
      // Canal por el que se hace el pedido: "whatsapp" (por defecto) o "web" (p. ej.
      // Black BasCo: se pide en su web y se paga con tarjeta). Lo decide el canal del
      // proveedor; la URL es a dónde abre la dirección para cargar y pagar el pedido.
      canal_pedido: prov.canal_pedido === "web" ? "web" : "whatsapp",
      url_pedido: prov.url_pedido || "",
    },
    articulos,
    n_articulos: articulos.length,
    n_por_pedir: articulos.filter((a) => a.estado !== "correcto").length,
  };
}

// ── Configuración de pedidos (WhatsApp de m de materia + copia) ──────────────
// Dos números, una sola fuente (entidad `config`, id `pedidos_config`):
//   · whatsapp_negocio → el WhatsApp de m de materia. Es el que se instala en la
//     tablet (WhatsApp Business) y desde el que salen los pedidos. Vacío hasta que
//     la fundadora dé de alta la línea (no es inventable: es una línea real).
//   · copia_whatsapp   → a quién llega una copia de cada pedido (por defecto Jon).
const CFG_ID = "pedidos_config";
const COPIA_DEFAULT = "34682250373"; // Jon — copia de cada pedido por WhatsApp
const COPIA_NOMBRE_DEFAULT = "Jon";
function leerConfig(st) {
  const c = st.findById("config", CFG_ID) || {};
  return {
    whatsapp_negocio: c.whatsapp_negocio || "",
    copia_whatsapp: c.copia_whatsapp || COPIA_DEFAULT,
    copia_nombre: c.copia_nombre || COPIA_NOMBRE_DEFAULT,
  };
}
// Normaliza un teléfono a solo dígitos (prefijo incluido). Devuelve "" si vacío.
function soloDigitos(v) { return String(v == null ? "" : v).replace(/[^0-9]/g, ""); }

// ── Rutas ────────────────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  const peds = store.readAll("pedidos").slice().reverse();
  res.json(esAdmin(req) ? peds : peds.map(sinCostesPedido));
});

// Sugerencias de compra agrupadas por proveedor (lo mismo que el aviso de 16:00).
router.get("/sugerencias", (req, res) => {
  res.json(compras.sugerencias());
});

// Configuración (copia por WhatsApp). GET lo usa todo el mundo (admin-only ya por ruta).
router.get("/config", (req, res) => res.json(leerConfig(store)));
router.put("/config", (req, res) => {
  const b = req.body || {};
  // Solo se tocan los campos presentes en el cuerpo (merge parcial).
  const patch = {};
  if ("whatsapp_negocio" in b) patch.whatsapp_negocio = soloDigitos(b.whatsapp_negocio);
  if ("copia_whatsapp" in b) patch.copia_whatsapp = soloDigitos(b.copia_whatsapp);
  if ("copia_nombre" in b) patch.copia_nombre = String(b.copia_nombre || "").trim().slice(0, 40);
  if (store.findById("config", CFG_ID)) store.update("config", CFG_ID, patch);
  else store.insert("config", { id: CFG_ID, ...patch });
  res.json(leerConfig(store));
});

// Catálogo de un proveedor (artículos + precio en unidad de pedido + sugerido).
router.get("/proveedor/:id", (req, res) => {
  const prov = store.findById("proveedores", req.params.id);
  if (!prov) return res.status(404).json({ error: "Proveedor no encontrado" });
  // Un proveedor ARCHIVADO está fuera del flujo de pedidos: no se puede pedir.
  if (prov.archivado) return res.status(410).json({ error: "Este proveedor está archivado. Recupéralo en Proveedores para volver a pedirle." });
  const cat = catalogoProveedor(store, req.params.id);
  if (!cat) return res.status(404).json({ error: "Proveedor no encontrado" });
  res.json(esAdmin(req) ? cat : sinCostesCat(cat));
});

router.get("/:id", (req, res) => {
  const p = store.findById("pedidos", req.params.id);
  if (!p) return res.status(404).json({ error: "Pedido no encontrado" });
  res.json(esAdmin(req) ? p : sinCostesPedido(p));
});

// Crear pedido: proveedor + líneas. Cada línea lleva la cantidad en UNIDAD BASE
// (para stock/recepciones) y, si viene del nuevo flujo, también en unidad de
// pedido (kg/L/ud) para el mensaje de WhatsApp y la ficha del pedido.
router.post("/", (req, res) => {
  let { proveedor_id, lineas } = req.body || {};
  const lineasArr = Array.isArray(lineas) ? lineas : [];
  const materias = store.readAll("materias");
  const comprasP = store.readAll("compras_productos") || [];
  const todosProv = store.readAll("proveedores") || [];
  // Casa un nombre contra una lista por nombre normalizado. Primero por contención directa
  // (uno contiene al otro); si no, por SOLAPE DE PALABRAS significativas (≥4 letras), para
  // que "café de Brasil" case con "Brasil Sitio Amoreira" (comparten «brasil»), como haría
  // una persona. Evita palabras cortas de relleno (de, la, kg, dos…).
  const casa = (nom, lista) => {
    const qn = normNombre(nom); if (qn.length < 2) return null;
    let hit = lista.find((x) => { const xn = normNombre(x.nombre); return xn && (xn.includes(qn) || qn.includes(xn)); });
    if (hit) return hit;
    const toks = qn.split(" ").filter((w) => w.length >= 4);
    if (!toks.length) return null;
    return lista.find((x) => { const xt = normNombre(x.nombre).split(" "); return toks.some((t) => xt.includes(t)); }) || null;
  };

  // 1) Resolver el PROVEEDOR por id O por nombre (la IA puede mandar "Mercadona"/"Nomad Coffee").
  let prov = proveedor_id ? (store.findById("proveedores", proveedor_id) || null) : null;
  if (!prov && proveedor_id) prov = casa(proveedor_id, todosProv.filter((p) => !p.archivado));
  // 2) Si NO se indicó proveedor, DEDUCIRLO del primer producto que sea una materia con
  //    proveedor (como un responsable de compras: "un kilo de café" → su proveedor habitual).
  if (!prov && !proveedor_id) {
    for (const l of lineasArr) {
      let m = l && l.materia_id ? materias.find((x) => x.id === l.materia_id) : null;
      if (!m && l && (l.nombre || l.materia_nombre)) m = casa(l.nombre || l.materia_nombre, materias.filter((x) => x.proveedor_id));
      if (m && m.proveedor_id) { const p = store.findById("proveedores", m.proveedor_id); if (p && !p.archivado) { prov = p; break; } }
    }
  }
  if (prov) proveedor_id = prov.id;
  // 3) Ni proveedor indicado ni deducible: pedirlo con un mensaje claro y accionable.
  if (!proveedor_id) return res.status(400).json({ error: "¿A qué proveedor se lo pido? Dime el proveedor, o asegúrate de que el producto está dado de alta con su proveedor habitual." });
  // No se crean pedidos a proveedores archivados (fuera del flujo).
  if (prov && prov.archivado) return res.status(410).json({ error: "Este proveedor está archivado. Recupéralo en Proveedores para pedirle." });

  // Artículos pedibles del proveedor (para resolver líneas por NOMBRE, como el catálogo).
  const aso = (prov && prov.productos_asociados) || [];
  const materiasProv = prov ? materias.filter((m) => m.proveedor_id === prov.id || aso.includes(m.id)) : [];
  const comprasProv = prov ? comprasP.filter((c) => c.proveedor_id === prov.id && c.archivado !== true) : [];

  // Resuelve cada línea: si la IA manda solo {nombre, cantidad}, intentamos casarlo con un
  // artículo del proveedor (materia o catálogo de compra); si no, se guarda como texto libre.
  const resueltas = (Array.isArray(lineas) ? lineas : []).map((l0) => {
    const l = Object.assign({}, l0);
    if (!l.materia_id && !l.compra_id && l.nombre) {
      const m = casa(l.nombre, materiasProv);
      if (m) l.materia_id = m.id;
      else { const c = casa(l.nombre, comprasProv); if (c) l.compra_id = c.id; }
    }
    return l;
  });
  // Acepta líneas con materia_id, compra_id O nombre (texto libre), y cantidad > 0.
  const candidatas = resueltas.filter((l) => (l.materia_id || l.compra_id || (l.nombre && String(l.nombre).trim())) && Number(l.cantidad) > 0);
  if (!candidatas.length) return res.status(400).json({ error: "Añade al menos un producto con cantidad" });

  const lineasN = candidatas.map((l) => {
    let linea;
    if (l.materia_id) {
      const m = materias.find((x) => x.id === l.materia_id);
      linea = {
        materia_id: l.materia_id,
        nombre: m ? m.nombre : (l.nombre || l.materia_id),
        unidad: m ? m.unidad : (l.unidad_pedido || l.unidad || ""),
        cantidad: Number(l.cantidad), // unidad base
        precio_esperado: l.precio_esperado != null ? Number(l.precio_esperado) : m ? m.coste_medio : 0,
      };
    } else if (l.compra_id) {
      // Artículo del catálogo de compra (sin materia de stock): se guarda tal cual.
      const c = comprasP.find((x) => x.id === l.compra_id);
      linea = {
        compra_id: l.compra_id,
        nombre: l.nombre || (c ? c.nombre : l.compra_id),
        unidad: l.unidad_pedido || (c ? c.formato || c.unidad || "ud" : "ud"),
        cantidad: Number(l.cantidad),
        precio_esperado: l.precio_esperado != null ? Number(l.precio_esperado) : c && c.precio_con_iva != null ? Number(c.precio_con_iva) : 0,
      };
    } else {
      // Línea de TEXTO LIBRE (no está en el catálogo): se guarda para el mensaje de pedido.
      linea = {
        nombre: String(l.nombre).trim(),
        unidad: l.unidad_pedido || l.unidad || "ud",
        cantidad: Number(l.cantidad),
        precio_esperado: l.precio_esperado != null ? Number(l.precio_esperado) : 0,
      };
    }
    // Unidad de pedido (amigable) — opcional, del flujo nuevo.
    if (l.unidad_pedido) linea.unidad_pedido = String(l.unidad_pedido);
    if (l.cantidad_pedido != null) linea.cantidad_pedido = Number(l.cantidad_pedido);
    if (l.precio_pedido != null) linea.precio_pedido = Number(l.precio_pedido);
    return linea;
  });

  // Quién puede ENVIAR un pedido: solo dirección (Moni/Jon, rol admin). El equipo
  // PROPONE: su pedido nace como "propuesto" y espera a que dirección lo revise y
  // lo envíe. Un admin crea un "borrador" listo para enviar (como hasta ahora).
  const esPropuesta = !esAdmin(req);
  const ahora = new Date();
  const pedido = {
    id: store.nextId("ped", "pedidos"),
    codigo: `PED-${ahora.toISOString().slice(0, 10).replace(/-/g, "")}-${String(store.readAll("pedidos").length + 1).padStart(3, "0")}`,
    proveedor_id,
    proveedor_nombre: prov ? prov.nombre : proveedor_id,
    fecha: ahora.toISOString(),
    estado: esPropuesta ? "propuesto" : "borrador",
    lineas: lineasN,
    total_estimado: Math.round(lineasN.reduce((s, l) => s + l.cantidad * l.precio_esperado, 0) * 100) / 100,
  };
  if (esPropuesta) {
    pedido.propuesto_por = (req.user && (req.user.nombre || req.user.key)) || "equipo";
    pedido.propuesto_en = ahora.toISOString();
  }
  store.insert("pedidos", pedido);

  // Aviso a dirección de que hay una propuesta por revisar: push a los dispositivos
  // suscritos (llega aunque la app esté cerrada). No bloquea ni rompe la respuesta
  // si el push falla o no hay suscripciones; el aviso directo a Jon por WhatsApp lo
  // dispara el front (un toque del equipo) como refuerzo.
  if (esPropuesta) {
    try {
      require("../push").enviarATodos(
        { title: "Nueva propuesta de pedido", body: `${pedido.proveedor_nombre} · ${lineasN.length} artículo(s) — revísala y envíala`, url: "/", tag: "propuesta-pedido" },
        { urgency: "high", topic: "propuesta", ttl: 86400 }
      );
    } catch (e) {}
  }

  res.status(201).json(esAdmin(req) ? pedido : sinCostesPedido(pedido));
});

// Marcar un pedido como enviado al proveedor. SOLO dirección (Moni/Jon): el equipo
// propone pero no envía (regla de negocio · Mónica). Enviar también "aprueba" una
// propuesta: pasa de "propuesto" a "enviado".
router.post("/:id/enviado", (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo Moni o Jon pueden enviar pedidos. El pedido del equipo queda como propuesta." });
  const p = store.update("pedidos", req.params.id, { estado: "enviado", enviado_en: new Date().toISOString() });
  if (!p) return res.status(404).json({ error: "Pedido no encontrado" });
  res.json(p);
});

module.exports = router;
module.exports.catalogoProveedor = catalogoProveedor;
module.exports.unidadPedido = unidadPedido;
module.exports.leerConfig = leerConfig;
