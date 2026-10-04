// COSTE DE MATERIA DESDE COMPRAS
// ─────────────────────────────────────────────────────────────────────────────
// El precio de compra vive en los artículos de Compras (compras_productos) y en
// las facturas. Aquí se VUELCA ese precio al coste de la materia (coste_medio),
// que es de donde el motor de coste (costing.js) saca el food cost de cada
// escandallo. Sin este enlace, una materia con compra registrada seguiría a 0.
//
// Convierte el precio del formato de compra (kg, litro, ud, caja…) a € por unidad
// de consumo de la materia (g, ml, ud). Regla de seguridad: solo rellena costes
// PENDIENTES (0); nunca pisa un coste ya establecido (las subidas se avisan
// aparte). Idempotente. Enlaza el artículo a su materia por materia_id o por
// nombre normalizado.

const store = require("./data-store");
const { convertir } = require("./unidades");

function r(n, d) { const p = Math.pow(10, d || 6); return Math.round((Number(n) || 0) * p) / p; }
function norm(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
}
// Normaliza el formato de compra a una unidad que entienda el conversor.
const FMT = { litro: "l", litros: "l", unidad: "ud", unidades: "ud", ud: "ud" };

// € por unidad de consumo de la materia a partir de un artículo de compra.
function costeUnidad(art, materia) {
  const iva = Number(art.iva) || 0;
  const conIva = Number(art.precio_con_iva) > 0 ? Number(art.precio_con_iva) : (Number(art.precio_sin_iva) || 0) * (1 + iva / 100);
  if (!(conIva > 0)) return 0;
  // 1) contenido_base: unidades de materia por formato → €/unidad base directo.
  const cb = Number(art.contenido_base) || 0;
  if (cb > 0) return r(conIva / cb);
  // 2) convertir el contenido del formato a la unidad de la materia.
  const fmt = FMT[norm(art.formato)] || art.formato;
  const conv = convertir(Number(art.cantidad_formato) || 1, fmt, materia);
  if (conv && conv.ok && conv.cantidad > 0) return r(conIva / conv.cantidad);
  return 0;
}

function aplicar(st) {
  st = st || store;
  const materias = st.readAll("materias") || [];
  const byId = {}; const byName = {};
  materias.forEach((m) => { byId[m.id] = m; if (!byName[norm(m.nombre)]) byName[norm(m.nombre)] = m; });

  let fijados = 0;
  const detalle = [];
  (st.readAll("compras_productos") || []).forEach((a) => {
    let m = a.materia_id ? byId[a.materia_id] : null;
    if (!m) m = byName[norm(a.nombre)];
    if (!m) return;
    if (Number(m.coste_medio) > 0) return; // solo pendientes; no pisa coste real
    const c = costeUnidad(a, m);
    if (c > 0) {
      st.update("materias", m.id, { coste_medio: c, precio_compra: Number(m.precio_compra) > 0 ? m.precio_compra : c, pendiente_coste: false });
      m.coste_medio = c; // refleja en el índice por si otro artículo apunta igual
      fijados++;
      detalle.push({ materia: m.nombre, coste: c, desde: a.nombre });
    }
  });
  return { fijados, detalle };
}

async function seedCosteDesdeCompras() {
  try {
    const { fijados } = aplicar(store);
    if (fijados) { await store.flush(); console.log(`Coste desde compras · ${fijados} materias con coste fijado.`); }
  } catch (e) {
    console.error("No se pudo volcar el coste desde compras:", e.message);
  }
}

module.exports = { seedCosteDesdeCompras, aplicar, costeUnidad };
