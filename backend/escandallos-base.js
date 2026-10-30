// COSTE DE MATERIA BASE POR PRODUCTO (respaldo del food cost automático)
// ─────────────────────────────────────────────────────────────────────────────
// Hace que el food cost se calcule solo aunque el producto que vende Ágora no tenga
// un escandallo propio mapeado. Dos vías, por prioridad:
//
//  1) RECETAS de bebidas (café, matcha): se valoran con el coste_medio REAL de tus
//     materias —el que cargaron tus facturas (café ~€/g, matcha €/g, leche €/ml)—
//     multiplicado por las cantidades por taza. Así el coste del café y el matcha sale
//     de tus facturas, no de una estimación. Si falta la materia, cae a (2).
//  2) PLANO: coste €/ud fijo. La comida (sándwiches/tostas) viene del escandallo real
//     del LAB; café/matcha/limonadas tienen un valor estimado de respaldo por si aún
//     no hay materia emparejada.
//
// Precedencia en costing: coste_materia propio del producto > escandallo de ingredientes
// > esta base. En cuanto se cargue el escandallo real de un producto, manda ese.

const store = require("./data-store");

// Coste €/unidad fijo por nombre normalizado. Comida = real (LAB); resto = respaldo.
const PLANO = {
  // Comida (coste real de los escandallos del LAB)
  "crunch origen": { c: 1.48, f: "escandallo" }, "crunch equilibrio": { c: 1.50, f: "escandallo" },
  "crunch coleccion": { c: 1.95, f: "estimado" },
  "tosta origen": { c: 0.99, f: "escandallo" }, "tosta equilibrio": { c: 1.35, f: "estimado" },
  "tosta coleccion": { c: 1.43, f: "escandallo" },
  "dulce origen": { c: 0.55, f: "estimado" }, "dulce equilibrio": { c: 0.80, f: "estimado" },
  "dulce coleccion": { c: 0.75, f: "estimado" },
  "jamon braseado y queso edam": { c: 0.55, f: "estimado" }, "aguacate": { c: 0.40, f: "estimado" },
  // Suplementos de leche vegetal (coste extra sobre la leche fresca de la receta base)
  "leche de avena": { c: 0.25, f: "estimado" }, "leche de coco": { c: 0.25, f: "estimado" },
  "leche sin lactosa": { c: 0.15, f: "estimado" },
  // Infusiones y limonadas (respaldo estimado; receta compleja)
  "menta": { c: 0.12, f: "estimado" }, "earl grey": { c: 0.15, f: "estimado" },
  "manzanilla": { c: 0.12, f: "estimado" }, "te verde": { c: 0.15, f: "estimado" },
  "limonada origen": { c: 0.45, f: "estimado" }, "limonada equilibrio": { c: 0.50, f: "estimado" },
  "limonada coleccion": { c: 0.45, f: "estimado" },
  // Café / matcha: respaldo si no se puede valorar la receta con tus materias
  "espresso": { c: 0.22, f: "estimado" }, "lungo": { c: 0.24, f: "estimado" },
  "americano": { c: 0.25, f: "estimado" }, "iced americano": { c: 0.28, f: "estimado" },
  "cortado": { c: 0.30, f: "estimado" }, "capuccino": { c: 0.38, f: "estimado" },
  "flatwhite": { c: 0.55, f: "estimado" }, "latte": { c: 0.60, f: "estimado" },
  "iced latte": { c: 0.58, f: "estimado" }, "coldbrew": { c: 0.95, f: "estimado" },
  "matcha latte": { c: 0.60, f: "estimado" }, "iced matcha origen": { c: 0.60, f: "estimado" },
  "iced matcha equilibrio": { c: 0.62, f: "estimado" }, "iced matcha coleccion": { c: 0.65, f: "estimado" },
};

// Recetas de bebidas: [palabra-clave-materia, cantidad] (g para café/matcha, ml para leche).
// Cantidades estándar de especialidad; se ajustan aquí en una línea si cambian.
const RECETAS = {
  "espresso": [["cafe", 9]], "lungo": [["cafe", 9]],
  "americano": [["cafe", 18]], "iced americano": [["cafe", 18]],
  "cortado": [["cafe", 18], ["leche", 60]],
  "capuccino": [["cafe", 18], ["leche", 150]],
  "flatwhite": [["cafe", 18], ["leche", 180]],
  "latte": [["cafe", 18], ["leche", 220]],
  "iced latte": [["cafe", 18], ["leche", 200]],
  "coldbrew": [["cafe", 40]],
  "matcha latte": [["matcha", 2], ["leche", 200]],
  "iced matcha origen": [["matcha", 2], ["leche", 200]],
  "iced matcha equilibrio": [["matcha", 2], ["leche", 200]],
  "iced matcha coleccion": [["matcha", 2], ["leche", 150]],
};

function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Encuentra la materia de referencia para una palabra clave, por su nombre.
// café: el de espresso/Brasil (no el cold brew ni el de coco). leche: la fresca.
function buscarMateria(clave, materias) {
  const con = (m, t) => norm(m.nombre).includes(t);
  const conCoste = (m) => Number(m && m.coste_medio) > 0;
  if (clave === "cafe") {
    const cafes = materias.filter((m) => conCoste(m) && (con(m, "cafe") || con(m, "café")) && !con(m, "cold brew") && !con(m, "coco"));
    return cafes.find((m) => con(m, "brasil")) || cafes.find((m) => con(m, "espresso")) || cafes[0] || null;
  }
  if (clave === "matcha") return materias.find((m) => conCoste(m) && con(m, "matcha")) || null;
  if (clave === "leche") {
    const vetado = (m) => con(m, "avena") || con(m, "coco") || con(m, "vegetal") || con(m, "lactosa");
    const leches = materias.filter((m) => conCoste(m) && con(m, "leche") && !vetado(m));
    return leches.find((m) => con(m, "fresca")) || leches[0] || null;
  }
  return null;
}

// Valora una receta con el coste_medio REAL de las materias. Devuelve coste o null
// si falta alguna materia (entonces el llamador cae al respaldo PLANO).
function costeReceta(receta, materias) {
  let total = 0;
  for (const [clave, cant] of receta) {
    const m = buscarMateria(clave, materias);
    if (!m) return null; // sin materia emparejada → no se puede valorar la receta
    total += (Number(m.coste_medio) || 0) * cant; // coste_medio en €/g o €/ml · cant en g/ml
  }
  return Math.round(total * 10000) / 10000;
}

// Unidades "por pieza": la materia se compra y se vende tal cual (agua, refrescos,
// botellas…), sin receta. Se valora 1:1 con su coste de compra. Las de peso/volumen
// (g/ml) NO entran aquí: necesitan una receta con cantidades.
const UNIDADES_PIEZA = new Set([
  "ud", "uds", "u", "un", "und", "unidad", "unidades",
  "pza", "pzas", "pieza", "piezas", "bote", "botes", "lata", "latas",
  "botella", "botellas", "brick", "bricks",
]);

function normU(u) {
  return String(u == null ? "" : u)
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, "");
}

// Coste de una materia vendida tal cual (reventa): nombre EXACTO (normalizado) y
// unidad por pieza. Nombre exacto a propósito, para no casar por error (p. ej. "agua"
// con "agua de coco"). Devuelve el coste de compra (el más barato si hay formatos) o null.
function costeReventa(nombre, materias) {
  const k = norm(nombre);
  if (!k) return null;
  const cand = (materias || []).filter((m) =>
    Number(m && m.coste_medio) > 0 && UNIDADES_PIEZA.has(normU(m.unidad)) && norm(m.nombre) === k);
  if (!cand.length) return null;
  return cand.reduce((a, b) => (Number(b.coste_medio) < Number(a.coste_medio) ? b : a)).coste_medio;
}

// Coste de materia base de un producto por su nombre. Devuelve { coste, fuente } o null.
// fuente: "facturas" (receta o reventa × coste real de tus materias) · "escandallo" (LAB) · "estimado".
function coste(nombre) {
  const k = norm(nombre);
  const materias = store.readAll("materias") || [];
  const receta = RECETAS[k];
  if (receta) {
    const c = costeReceta(receta, materias);
    if (c != null && c > 0) return { coste: c, fuente: "facturas" };
  }
  // Reventa: lo que compras y vendes tal cual → coste real de compra (de tus facturas).
  const rev = costeReventa(nombre, materias);
  if (rev != null && rev > 0) return { coste: Math.round(rev * 10000) / 10000, fuente: "facturas" };
  const p = PLANO[k];
  return p ? { coste: p.c, fuente: p.f } : null;
}

module.exports = { coste, norm, PLANO, RECETAS, buscarMateria, costeReceta, costeReventa };
