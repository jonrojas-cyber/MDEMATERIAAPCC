// SIEMBRA DE PRODUCTOS DE VENTA DE ÁGORA (idempotente, por lote con flag).
//
// El conector de Ágora empareja cada línea vendida con un producto de Control M
// por `clave`/`nombre`/`id`/`agora_ref` (minúsculas). Si no lo encuentra, BLOQUEA
// el ticket (no cuenta ni descuenta stock). Control M tenía muy pocos productos,
// así que casi todo lo que se vende en Ágora quedaba bloqueado.
//
// Aquí se crean los artículos del catálogo de Ágora (nombre EXACTO + PVP reales,
// transcritos del back-office) que aún no existen en Control M. NO se inventa
// escandallo: se crean con `ingredientes: []`, así el ticket deja de bloquearse
// y la venta se registra; el descuento de stock por producto se vincula después.
// UPSERT por id + no duplica si ya existe un producto con esa clave/nombre.

const store = require("./data-store");

// Catálogo de venta de Ágora (id Ágora informativo · nombre exacto · categoría · PVP €).
// Matcha latte NO se incluye: ya existe en Control M (prod-005) con su escandallo.
const CATALOGO = [
  ["Espresso", "bebida", 1.80], ["Lungo", "bebida", 1.90], ["Americano", "bebida", 1.90],
  ["Cortado", "bebida", 2.00], ["Flatwhite", "bebida", 2.20], ["Capuccino", "bebida", 2.10],
  ["Latte", "bebida", 2.60], ["Iced Latte", "bebida", 2.60], ["Coldbrew", "bebida", 3.50],
  ["Leche de avena", "bebida", 0.40], ["Leche de coco", "bebida", 0.40], ["Leche fresca", "bebida", 0.00],
  ["Crunch origen", "comida", 4.80], ["Crunch equilibrio", "comida", 6.00], ["Crunch colección", "comida", 7.80],
  ["Tosta origen", "comida", 3.50], ["Tosta equilibrio", "comida", 4.80], ["Tosta colección", "comida", 4.00],
  ["Dulce origen", "comida", 2.20], ["Dulce equilibrio", "comida", 2.80], ["Dulce colección", "comida", 3.80],
  ["Iced matcha origen", "bebida", 3.60], ["Etiopía", "bebida", 0.30], ["Brasil", "bebida", 0.00],
  ["Limonada origen", "bebida", 2.20], ["Limonada equilibrio", "bebida", 2.60], ["Limonada colección", "bebida", 2.20],
  ["Zumo materia", "bebida", 3.50], ["Earl grey", "bebida", 1.80], ["Manzanilla", "bebida", 1.80],
  ["Té verde", "bebida", 1.80], ["Menta", "bebida", 1.80], ["Leche sin lactosa", "bebida", 0.00],
  ["Iced matcha equilibrio", "bebida", 4.00], ["Iced matcha colección", "bebida", 4.00],
  ["Dulce de leche", "comida", 0.00], ["Pistacho", "comida", 0.00], ["Sirope de chai", "bebida", 0.00],
  ["Sirope de caramelo salado", "bebida", 0.00], ["Agua", "bebida", 1.00],
  ["Jamón braseado y queso Edam", "comida", 1.20],
];

function slug(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

const FLAG = "productos_agora_seed_v1";

// Aplica el lote sobre el store dado (inyectable para tests). Idempotente por flag.
// No duplica: si ya existe un producto cuya clave/nombre coincide (sin distinguir
// mayúsculas) con el de Ágora, se salta.
function aplicar(st) {
  const cfg = st.readAll("config") || [];
  if (cfg.some((c) => c && c.id === FLAG)) return { creados: 0, ranAny: false };

  const existentes = st.readAll("productos") || [];
  const yaHay = new Set();
  existentes.forEach((p) => {
    [p.clave, p.nombre, p.agora_ref].forEach((k) => { if (k) yaHay.add(String(k).toLowerCase()); });
  });

  let creados = 0;
  CATALOGO.forEach(([nombre, categoria, pvp]) => {
    if (yaHay.has(nombre.toLowerCase())) return; // ya existe (p. ej. Matcha latte)
    const id = "prod-agora-" + slug(nombre);
    const prod = {
      id, clave: nombre, nombre, agora_ref: nombre,
      categoria, descripcion: "Alta automática desde el catálogo de Ágora",
      precio_venta: pvp, activo: true,
      ingredientes: [],                 // sin escandallo inventado (se vincula después)
      origen: "agora", creado_en: new Date().toISOString(),
    };
    if (st.findById("productos", id)) st.update("productos", id, prod);
    else st.insert("productos", prod);
    yaHay.add(nombre.toLowerCase());
    creados++;
  });

  st.insert("config", { id: FLAG, hecho: true, fecha: new Date().toISOString() });
  return { creados, ranAny: true };
}

async function seedProductosAgora() {
  try {
    const { creados, ranAny } = aplicar(store);
    if (ranAny) { await store.flush(); console.log(`Seed productos Ágora · ${creados} artículos creados.`); }
  } catch (e) {
    console.error("No se pudieron sembrar los productos de Ágora:", e.message);
  }
}

module.exports = { seedProductosAgora, aplicar, CATALOGO, FLAG };
