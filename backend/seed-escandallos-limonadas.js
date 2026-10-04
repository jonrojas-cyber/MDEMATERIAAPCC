// SIEMBRA DE ESCANDALLOS DE LIMONADAS (Burbujas) + Zumo Materia
// ─────────────────────────────────────────────────────────────────────────────
// Las recetas de limonadas viven en Burbujas por LITRO de producto terminado
// (rendimiento 5 L). Aquí se derivan a escandallo POR VASO y se enlazan a los
// productos del TPV (Limonada origen/equilibrio/colección, Zumo materia), para
// que la venta descuente stock y calcule food cost.
//
// Asunción documentada: 1 vaso = 300 ml (factor 0,30 sobre las cantidades por
// litro). Fácil de cambiar aquí (SERVICIO_ML). Las materias de limonada se crean
// con coste pendiente: el coste real lo fijan las facturas (fuente única).
// Fill-only: nunca pisa una receta ya puesta y solo enlaza materias existentes.

const store = require("./data-store");

const SERVICIO_ML = 200;

// Materias de limonada (se reutiliza la existente si ya hay una con ese nombre).
const RAW = [
  { key: "azucar", nombre: "Azúcar" },
  { key: "fructosa", nombre: "Fructosa" },
  { key: "acido-citrico", nombre: "Ácido cítrico" },
  { key: "acido-malico", nombre: "Ácido málico" },
  { key: "sal", nombre: "Sal" },
  { key: "glutamato", nombre: "Glutamato" },
  { key: "pectinasa", nombre: "Pectinasa" },
  { key: "piel-lima", nombre: "Piel de lima" },
  { key: "hoja-kaffir", nombre: "Hoja de lima kaffir" },
  { key: "zumo-pomelo", nombre: "Zumo de pomelo rosa" },
  { key: "piel-pomelo", nombre: "Piel de pomelo rosa" },
  { key: "lapsang", nombre: "Té Lapsang Souchong" },
  { key: "romero", nombre: "Romero" },
  { key: "puree-maracuya", nombre: "Puré de maracuyá" },
  { key: "hierbabuena", nombre: "Hierbabuena" },
  { key: "zumo-naranja", nombre: "Zumo de naranja" },
  { key: "jengibre", nombre: "Jengibre" },
  { key: "acido-ascorbico", nombre: "Ácido ascórbico" },
];

// Receta por LITRO (g/L) de cada producto del TPV → se escala por vaso.
const POR_LITRO = {
  "limonada origen": [["azucar", 61], ["fructosa", 43], ["acido-citrico", 11.1], ["acido-malico", 1.22], ["glutamato", 0.25], ["sal", 0.61], ["pectinasa", 2], ["piel-lima", 10.36], ["hoja-kaffir", 2.21]],
  "limonada equilibrio": [["puree-maracuya", 150], ["hierbabuena", 6], ["azucar", 60], ["fructosa", 40], ["acido-citrico", 7], ["acido-malico", 1], ["sal", 0.6], ["glutamato", 0.2], ["pectinasa", 1]],
  "limonada coleccion": [["zumo-pomelo", 200], ["piel-pomelo", 7], ["lapsang", 2.4], ["romero", 1.2], ["azucar", 64], ["fructosa", 36], ["acido-citrico", 7], ["acido-malico", 1], ["sal", 0.6], ["glutamato", 0.2], ["pectinasa", 1]],
  "zumo materia": [["zumo-naranja", 450], ["zumo-pomelo", 250], ["jengibre", 20], ["pectinasa", 0.5], ["acido-ascorbico", 0.2]],
};

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
}

function aplicar(st) {
  st = st || store;
  try { require("./seed-productos-agora").aplicar(st); } catch (e) {} // asegura el catálogo del TPV

  // Resuelve/crea las materias de limonada (coste pendiente: lo fijan las facturas).
  const materias = st.readAll("materias") || [];
  const byName = {}; materias.forEach((m) => (byName[norm(m.nombre)] = m.id));
  const idOf = {};
  RAW.forEach((r) => {
    const ex = byName[norm(r.nombre)];
    if (ex) { idOf[r.key] = ex; return; }
    const id = "mat-lim-" + r.key;
    const existente = st.findById("materias", id);
    if (existente) {
      // Renombra si el nombre cambió (para que empareje mejor con las compras).
      if (norm(existente.nombre) !== norm(r.nombre)) st.update("materias", id, { nombre: r.nombre });
    } else {
      st.insert("materias", { id, nombre: r.nombre, unidad: "g", macro: "Bebidas", subcategoria: "Limonadas", disponibilidad_actual: 0, stock_minimo: 0, coste_medio: 0, precio_compra: 0, pendiente_coste: true, local_id: "principal", origen: "seed-limonadas", creado_en: new Date().toISOString() });
    }
    idOf[r.key] = id; byName[norm(r.nombre)] = id;
  });

  const factor = SERVICIO_ML / 1000;
  let rellenados = 0;
  (st.readAll("productos") || []).forEach((p) => {
    const def = POR_LITRO[norm(p.nombre)] || POR_LITRO[norm(p.clave)];
    if (!def) return;
    const ingActual = Array.isArray(p.ingredientes) ? p.ingredientes : [];
    const tieneReceta = ingActual.length || Number(p.coste_materia) > 0;
    // "Mío" = lo sembró esta receta (marca) o referencia materias mat-lim-*.
    const mio = p.escandallo_origen === "seed-limonadas" || ingActual.some((i) => /^mat-lim-/.test(String(i.materia_id)));
    if (tieneReceta && !mio) return;                 // receta puesta a mano → nunca se toca
    if (mio && p.escandallo_servicio_ml === SERVICIO_ML) return; // ya al día con este vaso
    const ing = def.map(([k, gL]) => ({ materia_id: idOf[k], cantidad: Math.round(gL * factor * 10000) / 10000 })).filter((x) => x.materia_id);
    if (!ing.length) return;
    st.update("productos", p.id, { ingredientes: ing, escandallo_origen: "seed-limonadas", escandallo_servicio_ml: SERVICIO_ML });
    rellenados++;
  });
  return { rellenados };
}

async function seedEscandallosLimonadas() {
  try {
    const { rellenados } = aplicar(store);
    if (rellenados) { await store.flush(); console.log(`Seed escandallos limonadas · ${rellenados} recetas (vaso ${SERVICIO_ML} ml).`); }
  } catch (e) {
    console.error("No se pudieron sembrar los escandallos de limonadas:", e.message);
  }
}

module.exports = { seedEscandallosLimonadas, aplicar, RAW, POR_LITRO, SERVICIO_ML };
