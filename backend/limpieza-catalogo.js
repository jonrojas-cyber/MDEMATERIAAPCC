// LIMPIEZA DEL CATÁLOGO DE VENTA (reversible).
// Regla de la fundadora: lo que no está en la CARTA real ni se ha vendido en Ágora
// no lo quiere. Aquí se ARCHIVAN (baja lógica activo:false, recuperable, conserva
// el histórico de ventas) los productos creados SOLO para casar con el conector de
// Ágora (id "prod-agora-*" u origen "agora") que NUNCA se han vendido, y las
// recetas/elaboraciones que, al quitarlos, dejan de servir a ningún producto
// vendible (cierre transitivo del escandallo, reutilizando limpieza-produccion).
//
// La carta REAL (café, matcha, limonadas, spritz, comida…) y TODO lo que tenga
// ventas en Ágora se conservan siempre. `computar(datos)` es puro (test).

const limpiezaProd = require("./limpieza-produccion");

function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); }
const MOTIVO = "No está en la carta real ni se ha vendido en Ágora (limpieza de catálogo)";

// ¿Producto creado solo para casar con el conector de Ágora? (no es carta "real").
function conectorOnly(p) {
  return String((p && p.id) || "").startsWith("prod-agora-") || p.origen === "agora" || p.origen === "agora_auto";
}

// Índice de lo VENDIDO en Ágora (por id y por nombre normalizado).
function indiceVentas(ventas) {
  const s = new Set();
  (ventas || []).forEach((v) => {
    if (v && v.producto_id) s.add("id:" + String(v.producto_id));
    if (v && v.producto) s.add("n:" + norm(v.producto));
  });
  return s;
}
function vendido(p, idx) { return idx.has("id:" + String(p.id)) || (p.nombre && idx.has("n:" + norm(p.nombre))); }

// Plan de limpieza: qué productos y qué recetas se archivarían.
function computar(datos) {
  const productos = datos.productos || [];
  const recetas = datos.recetas || [];
  const materias = datos.materias || [];
  const idxV = indiceVentas(datos.ventas);

  // Productos a archivar: SOLO conector-only, activos y sin ninguna venta.
  const productosBaja = productos
    .filter((p) => p && p.activo !== false && conectorOnly(p) && !vendido(p, idxV))
    .map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria || "—", motivo: MOTIVO }));

  // Recetas a archivar = SOLO las que dejan de usarse POR haber quitado esos
  // productos (diferencia antes/después). Nunca pre-existentes huérfanas (esas son
  // tarea de limpieza-produccion y podrían ser elaboraciones reales con escandallo
  // aún incompleto): así jamás se archiva por error una elaboración de la carta.
  const bajaSet = new Set(productosBaja.map((x) => x.id));
  const antes = new Set((limpiezaProd.computar({ productos, materias, recetas }).recetasBaja) || []);
  const productosTrasBaja = productos.map((p) => (bajaSet.has(p.id) ? Object.assign({}, p, { activo: false }) : p));
  const despues = (limpiezaProd.computar({ productos: productosTrasBaja, materias, recetas }).recetasBaja) || [];
  const recetasById = {}; recetas.forEach((r) => (recetasById[r.id] = r));
  const recetasBaja = despues.filter((id) => !antes.has(id)).map((id) => ({ id, nombre: (recetasById[id] && recetasById[id].nombre) || id, motivo: MOTIVO }));

  return { productosBaja, recetasBaja };
}

// Lista de ya archivados por esta limpieza (para poder recuperar).
function archivados(st) {
  const prod = (st.readAll("productos") || []).filter((p) => p.activo === false && p.archivado_motivo === MOTIVO)
    .map((p) => ({ id: p.id, nombre: p.nombre, categoria: p.categoria || "—", archivado_en: p.archivado_en || null }));
  const rec = (st.readAll("recetas") || []).filter((r) => r.activo === false && r.archivado_motivo === MOTIVO)
    .map((r) => ({ id: r.id, nombre: r.nombre, archivado_en: r.archivado_en || null }));
  return { productos: prod, recetas: rec };
}

function estado(st) {
  const plan = computar({
    productos: st.readAll("productos") || [], recetas: st.readAll("recetas") || [],
    materias: st.readAll("materias") || [], ventas: st.readAll("ventas") || [],
  });
  return {
    candidatos_productos: plan.productosBaja, candidatos_recetas: plan.recetasBaja,
    n_productos: plan.productosBaja.length, n_recetas: plan.recetasBaja.length,
    archivados: archivados(st), motivo: MOTIVO,
  };
}

// Archiva (baja lógica) productos y recetas. `seleccion` opcional ({productos:[],
// recetas:[]}); si no se pasa, archiva TODO el plan. Por seguridad SOLO toca ids
// que son candidatos reales (nunca archiva algo fuera del plan). Reversible.
async function aplicar(st, seleccion, now = Date.now()) {
  const plan = computar({
    productos: st.readAll("productos") || [], recetas: st.readAll("recetas") || [],
    materias: st.readAll("materias") || [], ventas: st.readAll("ventas") || [],
  });
  const candP = new Set(plan.productosBaja.map((x) => x.id));
  const candR = new Set(plan.recetasBaja.map((x) => x.id));
  const pedP = seleccion && Array.isArray(seleccion.productos) && seleccion.productos.length ? seleccion.productos.filter((id) => candP.has(id)) : [...candP];
  const pedR = seleccion && Array.isArray(seleccion.recetas) && seleccion.recetas.length ? seleccion.recetas.filter((id) => candR.has(id)) : [...candR];
  const ahora = new Date(now).toISOString();
  let nP = 0, nR = 0;
  pedP.forEach((id) => { st.update("productos", id, { activo: false, archivado_motivo: MOTIVO, archivado_en: ahora }); nP++; });
  pedR.forEach((id) => { st.update("recetas", id, { activo: false, archivado_motivo: MOTIVO, archivado_en: ahora }); nR++; });
  if (nP || nR) await st.flush();
  return { productos: nP, recetas: nR };
}

// Recupera (reactiva) productos/recetas archivados por esta limpieza.
async function recuperar(st, ids = [], tipo = "productos", now = Date.now()) {
  const ent = tipo === "recetas" ? "recetas" : "productos";
  const lista = Array.isArray(ids) ? ids : [ids];
  let n = 0;
  lista.forEach((id) => {
    const x = st.findById(ent, id);
    if (x && x.activo === false && x.archivado_motivo === MOTIVO) {
      st.update(ent, id, { activo: true, archivado_motivo: null, archivado_en: null, recuperado_en: new Date(now).toISOString() });
      n++;
    }
  });
  if (n) await st.flush();
  return n;
}

module.exports = { computar, estado, aplicar, recuperar, archivados, conectorOnly, vendido, norm, MOTIVO };
