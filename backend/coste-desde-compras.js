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
const intake = require("./albaran-intake");

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
  // Las elaboraciones (materias que produce una receta) NO se tocan: su coste lo
  // calcula el motor desde sus ingredientes.
  const elaboracion = {};
  (st.readAll("recetas") || []).forEach((r) => { if (r && r.produce_materia_id) elaboracion[r.produce_materia_id] = true; });

  let fijados = 0;
  const detalle = [];
  (st.readAll("compras_productos") || []).forEach((a) => {
    let m = a.materia_id ? byId[a.materia_id] : null;
    if (!m) m = byName[norm(a.nombre)];
    if (!m) m = intake.mejorPorPalabras(a.nombre, materias); // empareja por palabras
    if (!m || elaboracion[m.id]) return;
    const c = costeUnidad(a, m);
    if (!(c > 0)) return;
    const actual = Number(m.coste_medio) || 0;
    // Food cost VIVO: el coste sigue al último precio de compra. Si ya había un
    // coste y cambia, se registra la variante en el histórico (como Gstock).
    if (actual > 0 && Math.abs(c - actual) / actual < 0.01) return; // sin cambio relevante
    if (actual > 0) {
      try {
        st.insert("precios_historico", { id: st.nextId ? st.nextId("ph", "precios_historico") : "ph-" + Date.now() + "-" + m.id, producto_id: m.id, proveedor_id: a.proveedor_id || null, fecha: new Date().toISOString(), precio_anterior: actual, precio_nuevo: c, motivo: "Precio de compra", responsable: "Enlace compras", origen: "compra" });
      } catch (e) {}
    }
    st.update("materias", m.id, { coste_medio: c, precio_compra: c, pendiente_coste: false });
    m.coste_medio = c;
    fijados++;
    detalle.push({ materia: m.nombre, coste: c, desde: a.nombre });
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
