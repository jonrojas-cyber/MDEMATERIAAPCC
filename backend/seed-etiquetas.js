// SIEMBRA · Catálogo de etiquetas de producción (idempotente por flag).
//
// FUENTE PRINCIPAL del catálogo = PRODUCTOS DE ÁGORA + RECETAS (elaboraciones).
// Eso lo resuelve el endpoint /api/etiquetas/catalogo combinando esas entidades.
//
// Aquí solo se siembran las PREPARACIONES INTERNAS que NO existen en Ágora ni
// como receta (super juices, aguas aromáticas, cordiales…), para que salgan en
// el buscador. SIN vida útil: la vida útil NO se inventa; se introduce en la
// ficha APPCC del producto (entidad appcc_fichas) o viene de la receta.

const store = require("./data-store");

const FLAG = "etiquetas_catalogo_v2_sin_vida";

// Solo nombres de preparaciones internas (lo que no está en Ágora ni en recetas).
const CAT = [
  { nombre: "Super juice de lima", categoria: "Preparación" },
  { nombre: "Super juice de pomelo", categoria: "Preparación" },
  { nombre: "Agua de lima kaffir (concentrado)", categoria: "Preparación" },
  { nombre: "Agua de romero (concentrado)", categoria: "Preparación" },
  { nombre: "Agua de lapsang souchong", categoria: "Preparación" },
  { nombre: "Agua de hierbabuena", categoria: "Preparación" },
  { nombre: "Agua de té verde", categoria: "Preparación" },
  { nombre: "Maracuyá Boiron (a punto)", categoria: "Preparación" },
  { nombre: "Óleo saccharum", categoria: "Preparación" },
  { nombre: "Cordial", categoria: "Preparación" },
  { nombre: "Dukkah", categoria: "Cocina" },
];

function slug(n) {
  return "etc-" + String(n).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function aplicar(st) {
  const cfg = st.readAll("config") || [];
  if (cfg.some((c) => c && c.id === FLAG)) return { ranAny: false, n: 0 };
  let n = 0;
  CAT.forEach((c) => {
    const id = slug(c.nombre);
    if (!st.findById("etiquetas_catalogo", id)) {
      // vida_dias: null → se define explícitamente en la ficha APPCC (no se inventa).
      st.insert("etiquetas_catalogo", { id, nombre: c.nombre, vida_dias: null, categoria: c.categoria, creado_en: new Date().toISOString() });
      n++;
    }
  });
  st.insert("config", { id: FLAG, hecho: true, fecha: new Date().toISOString() });
  return { ranAny: true, n };
}

async function seedEtiquetas() {
  try {
    const r = aplicar(store);
    if (r.ranAny) { await store.flush(); console.log(`Seed catálogo de etiquetas · ${r.n} preparaciones internas (sin vida inventada).`); }
  } catch (e) { console.error("No se pudo sembrar el catálogo de etiquetas:", e.message); }
}

module.exports = { seedEtiquetas, aplicar, CAT, FLAG, slug };
