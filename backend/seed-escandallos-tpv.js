// SIEMBRA DE ESCANDALLOS DEL TPV (café, leche, tés, iced matcha)
// ─────────────────────────────────────────────────────────────────────────────
// Los productos del catálogo de Ágora se crearon SIN receta (ingredientes: []),
// así que al venderse no descuentan stock y el almacén no cuadra. Aquí se rellenan
// las recetas que podemos fijar con seguridad a partir de un dato real de la casa:
//   · Café: 17 g por taza (dato de la fundadora), origen Brasil por defecto.
//   · Leche (fresca) por bebida con leche, en ml estándar de cafetería.
//   · Té: 1 bolsa/infusión por taza.
//   · Iced matcha: 2 g de matcha + 200 ml de leche.
// NO se inventan recetas complejas (Crunch/Tosta/Dulce/Limonadas/Zumo): esas se
// enlazan desde sus propios datos. Solo se RELLENA lo que está vacío: nunca pisa
// una receta ya puesta a mano. Idempotente (se puede correr en cada arranque).

const store = require("./data-store");

// Materias base (ids existentes en el almacén).
const CAFE = "mat-cafe-brasil";          // Café Brasil (espresso), g
const CAFE_COLD = "mat-018";             // Café (tueste cold brew), g
const CAFE_DESCAF = "mat-cafe-descafeinado"; // Café descafeinado (México), g (se crea si falta)
const LECHE = "mat-leche-fresca";        // Leche fresca, ml
const MATCHA = "mat-007";                // Matcha base, g
const TE = "mat-te-bolsa";               // Té en bolsa, ud (se crea si falta)
const CROISSANT = "mat-coc-croissant";   // Croissant, ud
const COOKIE = "mat-coc-cookie";         // Cookie, ud (se crea si falta)

const GRAMOS_CAFE = 17;

// Dulces con enlace directo (producto comprado hecho): su coste lo fijan las
// facturas. Equilibrio NO va aquí: usa su receta real (croissant pistacho) vía COMIDA_SRC.
const COMIDA_DIRECT = {
  "dulce origen": [{ materia_id: CROISSANT, cantidad: 1 }],
  "dulce coleccion": [{ materia_id: COOKIE, cantidad: 1 }],
};

// nombre exacto del TPV → ingredientes [{materia_id, cantidad}]
function recetas() {
  return {
    "Espresso": [{ materia_id: CAFE, cantidad: GRAMOS_CAFE }],
    "Lungo": [{ materia_id: CAFE, cantidad: GRAMOS_CAFE }],
    "Americano": [{ materia_id: CAFE, cantidad: GRAMOS_CAFE }],
    "Cortado": [{ materia_id: CAFE, cantidad: GRAMOS_CAFE }, { materia_id: LECHE, cantidad: 100 }],
    "Flatwhite": [{ materia_id: CAFE, cantidad: GRAMOS_CAFE }, { materia_id: LECHE, cantidad: 150 }],
    "Capuccino": [{ materia_id: CAFE, cantidad: GRAMOS_CAFE }, { materia_id: LECHE, cantidad: 150 }],
    "Latte": [{ materia_id: CAFE, cantidad: GRAMOS_CAFE }, { materia_id: LECHE, cantidad: 200 }],
    "Iced Latte": [{ materia_id: CAFE, cantidad: GRAMOS_CAFE }, { materia_id: LECHE, cantidad: 200 }],
    "Ices americano": [{ materia_id: CAFE, cantidad: GRAMOS_CAFE }],
    "México descafeinado": [{ materia_id: CAFE_DESCAF, cantidad: GRAMOS_CAFE }],
    "Coldbrew": [{ materia_id: CAFE_COLD, cantidad: GRAMOS_CAFE }],
    "Iced matcha origen": [{ materia_id: MATCHA, cantidad: 2 }, { materia_id: LECHE, cantidad: 200 }],
    "Iced matcha equilibrio": [{ materia_id: MATCHA, cantidad: 2 }, { materia_id: LECHE, cantidad: 200 }],
    "Iced matcha colección": [{ materia_id: MATCHA, cantidad: 2 }, { materia_id: LECHE, cantidad: 200 }],
    "Earl grey": [{ materia_id: TE, cantidad: 1 }],
    "Manzanilla": [{ materia_id: TE, cantidad: 1 }],
    "Té verde": [{ materia_id: TE, cantidad: 1 }],
    "Menta": [{ materia_id: TE, cantidad: 1 }],
  };
}

// Comida: el escandallo real vive en los productos del LAB (prod-crunch-*,
// prod-tosta-*), ya escandallados (gramos de jamón braseado, etc.). La receta del
// TPV se SACA de ahí (fuente única): se copia del producto del LAB homónimo.
const COMIDA_SRC = {
  "crunch origen": "prod-crunch-origen",
  "crunch equilibrio": "prod-crunch-equilibrio",
  "crunch coleccion": "prod-crunch-coleccion",
  "tosta origen": "prod-tosta-origen",
  "tosta equilibrio": "prod-tosta-equilibrio",
  "tosta coleccion": "prod-tosta-coleccion",
  // Dulce equilibrio = croissant pistacho (su receta está metida). Origen y
  // colección van por enlace directo (COMIDA_DIRECT): croissant / cookie.
  "dulce equilibrio": "prod-croissant-pistacho",
};

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
}

function aplicar(st) {
  st = st || store;
  // Asegura que existen el catálogo de Ágora y la carta de cocina (escandallos
  // reales de crunch/tostas) antes de rellenar. Idempotente.
  try { require("./seed-cocina").aplicar(st); } catch (e) {}
  try { require("./seed-productos-agora").aplicar(st); } catch (e) {}

  // Materias auxiliares que crea esta siembra si faltan (coste pendiente: lo fijan
  // las facturas): té en bolsa, café descafeinado (México) y cookie.
  const crearMat = (id, nombre, unidad, macro, sub) => {
    if (!st.findById("materias", id)) st.insert("materias", { id, nombre, unidad, macro, subcategoria: sub, disponibilidad_actual: 0, stock_minimo: 0, coste_medio: 0, precio_compra: 0, pendiente_coste: true, local_id: "principal", origen: "seed", creado_en: new Date().toISOString() });
  };
  crearMat(TE, "Té en bolsa", "ud", "Bebidas", "Infusiones");
  crearMat(CAFE_DESCAF, "Café descafeinado (México)", "g", "Bebidas", "Café");
  crearMat(COOKIE, "Cookie", "ud", "Panadería", "Repostería");

  const mats = {}; (st.readAll("materias") || []).forEach((m) => (mats[m.id] = true));
  const mapa = recetas();
  const porNombre = {}; Object.keys(mapa).forEach((n) => (porNombre[norm(n)] = mapa[n]));
  const productos = st.readAll("productos") || [];
  const byId = {}; productos.forEach((p) => (byId[p.id] = p));

  // Resuelve los ingredientes para un producto: bebidas desde el mapa fijo;
  // comida copiando el escandallo del producto del LAB (fuente única).
  function ingredientesPara(p) {
    const n = norm(p.nombre);
    if (porNombre[n]) return porNombre[n];
    if (COMIDA_DIRECT[n] || COMIDA_DIRECT[norm(p.clave)]) return COMIDA_DIRECT[n] || COMIDA_DIRECT[norm(p.clave)];
    const srcId = COMIDA_SRC[n] || COMIDA_SRC[norm(p.clave)];
    if (srcId && srcId !== p.id) {
      const src = byId[srcId];
      if (src && Array.isArray(src.ingredientes) && src.ingredientes.length) {
        return src.ingredientes.map((i) => ({ materia_id: i.materia_id, cantidad: i.cantidad }));
      }
    }
    return null;
  }

  let rellenados = 0;
  productos.forEach((p) => {
    const ing = ingredientesPara(p);
    if (!ing) return;
    const yaTiene = (Array.isArray(p.ingredientes) && p.ingredientes.length) || Number(p.coste_materia) > 0;
    if (yaTiene) return; // nunca pisa una receta ya puesta
    const limpio = ing.filter((x) => mats[x.materia_id]); // solo materias existentes
    if (!limpio.length) return;
    st.update("productos", p.id, { ingredientes: limpio });
    rellenados++;
  });
  return { rellenados };
}

async function seedEscandallosTpv() {
  try {
    const { rellenados } = aplicar(store);
    if (rellenados) { await store.flush(); console.log(`Seed escandallos TPV · ${rellenados} recetas rellenadas (café 17 g + leche/té).`); }
  } catch (e) {
    console.error("No se pudieron sembrar los escandallos del TPV:", e.message);
  }
}

module.exports = { seedEscandallosTpv, aplicar, recetas };
