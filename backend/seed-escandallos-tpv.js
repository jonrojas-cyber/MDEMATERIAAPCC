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
const LECHE = "mat-leche-fresca";        // Leche fresca, ml
const MATCHA = "mat-007";                // Matcha base, g
const TE = "mat-te-bolsa";               // Té en bolsa, ud (se crea si falta)

const GRAMOS_CAFE = 17;

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

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function aplicar(st) {
  st = st || store;
  // Asegura que el catálogo de Ágora existe (idempotente) antes de rellenar.
  try { require("./seed-productos-agora").aplicar(st); } catch (e) {}

  // Crea la materia "Té en bolsa" si no existe (coste pendiente: lo fija la factura).
  if (!st.findById("materias", TE)) {
    st.insert("materias", { id: TE, nombre: "Té en bolsa", unidad: "ud", macro: "Bebidas", subcategoria: "Infusiones", disponibilidad_actual: 0, stock_minimo: 0, coste_medio: 0, precio_compra: 0, pendiente_coste: true, local_id: "principal", origen: "seed", creado_en: new Date().toISOString() });
  }

  const mats = {}; (st.readAll("materias") || []).forEach((m) => (mats[m.id] = true));
  const mapa = recetas();
  const porNombre = {}; Object.keys(mapa).forEach((n) => (porNombre[norm(n)] = mapa[n]));

  let rellenados = 0;
  (st.readAll("productos") || []).forEach((p) => {
    const ing = porNombre[norm(p.nombre)];
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
