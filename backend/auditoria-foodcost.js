// AUDITORÍA DE FOOD COST POR PRODUCTO VENDIDO (Ágora/TPV)
// ─────────────────────────────────────────────────────────────────────────────
// Para cada producto vendido en el periodo: su coste de materia REAL por unidad y
// por volumen vendido, con la FUENTE del coste y el food cost %. Es una vista de
// AUDITORÍA: no recalcula el dinero por su cuenta —usa EXACTAMENTE el mismo motor
// que el P&L (costing.costeProducto + financials.netoDeVenta + la resolución
// byId/byName de lo vendido)—, así el coste total cuadra con la cuenta de resultados
// (financials.costeMateriaVendidaEnRango). Fuente única del dinero (dinero.1).
//
// Estado por producto (de mejor a peor, para priorizar lo accionable):
//   real      → coste de su escandallo / coste declarado, o de la receta base × tus
//               materias reales (facturas). Food cost fiable.
//   estimado  → coste de respaldo estimado (receta aún sin materia emparejada).
//   parcial   → tiene escandallo pero alguna materia no tiene coste → coste INFRAvalorado.
//   sin_coste → está en el catálogo pero sin escandallo ni coste → coste 0.
//   sin_ficha → Ágora lo vende pero NO existe en el catálogo → no se puede costear.

const store = require("./data-store");
const costing = require("./costing");
const financials = require("./financials");

function enRango(fecha, r) {
  const t = new Date(fecha).getTime();
  return Number.isFinite(t) && t >= r.desde && t < r.hasta;
}

// Clasifica el coste de un producto del catálogo en (fuente, estado).
function fuenteEstado(p, det) {
  if (!(det.coste > 0)) return { fuente: "sin_coste", estado: "sin_coste" };
  const fuente = det.fuente_coste || (Number(p && p.coste_materia) > 0 ? "directo" : "escandallo");
  if (det.incompleto) return { fuente, estado: "parcial" };
  return { fuente, estado: fuente === "estimado" ? "estimado" : "real" };
}

const RANK = { sin_ficha: 0, sin_coste: 1, parcial: 2, estimado: 3, real: 4 };
const ESTADOS = ["real", "estimado", "parcial", "sin_coste", "sin_ficha"];

// Auditoría por producto para un rango { desde, hasta }.
function auditar(r) {
  const idxMat = costing.indiceMaterias(store.readAll("materias"));
  const idxProd = financials.indicesProducto();
  const { byId, byName } = idxProd;
  const ventas = store.readAll("ventas").filter((v) => v.fecha && enRango(v.fecha, r));

  // Agrupa las ventas por el producto vendido (resuelto a su ficha, o por nombre si no existe).
  const map = new Map();
  for (const v of ventas) {
    // Misma resolución y misma clave normalizada que el P&L (financials): un nombre con
    // espacios/mayúsculas resuelve igual, y la agrupación no parte un producto en dos.
    const p = byId[v.producto_id] || byName[financials.claveNombre(v.producto)];
    const key = p ? "id:" + p.id : "nom:" + financials.claveNombre(v.producto);
    let row = map.get(key);
    if (!row) {
      row = { nombre: p ? p.nombre : (v.producto || "(sin nombre)"), producto_id: p ? p.id : null, en_catalogo: !!p, _p: p || null, unidades: 0, ventas_netas: 0 };
      map.set(key, row);
    }
    row.unidades += Number(v.cantidad) || 0;
    row.ventas_netas += financials.netoDeVenta(v);
  }

  const filas = [];
  for (const row of map.values()) {
    let costeUnit = 0, fuente = "sin_ficha", estado = "sin_ficha";
    if (row._p) {
      const det = costing.costeProductoDetalle(row._p, idxMat);
      costeUnit = det.coste || 0;
      ({ fuente, estado } = fuenteEstado(row._p, det));
    }
    const ventasNetas = Math.round(row.ventas_netas * 100) / 100;
    const costeTotal = Math.round(costeUnit * row.unidades * 100) / 100;
    filas.push({
      nombre: row.nombre,
      producto_id: row.producto_id,
      en_catalogo: row.en_catalogo,
      unidades: Math.round(row.unidades * 100) / 100,
      ventas_netas: ventasNetas,
      pvp_unit_neto: row.unidades > 0 ? Math.round((ventasNetas / row.unidades) * 100) / 100 : 0,
      coste_unit: Math.round(costeUnit * 10000) / 10000,
      coste_total: costeTotal,
      // Food cost % solo con unidades netas positivas: una devolución que deja el neto
      // en 0 o negativo no es "0% de food cost" (margen infinito falso), es no medible.
      food_cost_pct: (ventasNetas > 0 && row.unidades > 0) ? Math.round((costeTotal / ventasNetas) * 1000) / 1000 : null,
      fuente,
      estado,
    });
  }

  // Primero lo accionable (sin ficha, sin coste, parcial, estimado), luego por coste total €.
  filas.sort((a, b) => (RANK[a.estado] - RANK[b.estado]) || (b.coste_total - a.coste_total));

  // Titulares = suma EXACTA de las líneas: una auditoría debe cuadrar consigo misma
  // (la columna por producto suma el titular). Coincide con el P&L salvo redondeo de
  // céntimos, porque usa el MISMO motor y la MISMA resolución producto↔venta.
  const ventasNetas = Math.round(filas.reduce((s, f) => s + f.ventas_netas, 0) * 100) / 100;
  const costeMateria = Math.round(filas.reduce((s, f) => s + f.coste_total, 0) * 100) / 100;

  const porEstado = {};
  for (const e of ESTADOS) {
    const fs = filas.filter((f) => f.estado === e);
    porEstado[e] = {
      productos: fs.length,
      ventas_netas: Math.round(fs.reduce((s, f) => s + f.ventas_netas, 0) * 100) / 100,
    };
  }

  // Base COSTEADA: ventas de productos con coste (real + estimado + parcial). El food
  // cost REAL se mide SOBRE lo costeado; meter en el denominador lo que aún no tiene
  // coste (sin_coste/sin_ficha, que aportan 0) diluiría el % a la baja y engañaría.
  const COSTEADO = new Set(["real", "estimado", "parcial"]);
  const ventasCosteadas = Math.round(filas.filter((f) => COSTEADO.has(f.estado)).reduce((s, f) => s + f.ventas_netas, 0) * 100) / 100;
  // Cobertura sobre ventas POSITIVAS (las devoluciones no deben dar >100% ni negativos).
  const ventasPos = filas.reduce((s, f) => s + Math.max(0, f.ventas_netas), 0);
  const ventasRealPos = filas.filter((f) => f.estado === "real").reduce((s, f) => s + Math.max(0, f.ventas_netas), 0);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));

  return {
    desde: r.desde,
    hasta: r.hasta,
    ventas_netas: ventasNetas,
    ventas_costeadas: ventasCosteadas,
    coste_materia: costeMateria,
    // Food cost REAL: coste / ventas de lo COSTEADO (lo que de verdad tiene coste).
    food_cost_pct: ventasCosteadas > 0 ? Math.round((costeMateria / ventasCosteadas) * 1000) / 1000 : null,
    // Food cost sobre TODA la venta (lo no costeado cuenta como 0) — informativo, NO es el real.
    food_cost_pct_total: ventasNetas > 0 ? Math.round((costeMateria / ventasNetas) * 1000) / 1000 : null,
    // Cobertura: qué % de tu facturación tiene food cost REAL (acotada a 0–100%).
    cobertura_real_pct: ventasPos > 0 ? Math.round(clamp01(ventasRealPos / ventasPos) * 1000) / 1000 : null,
    total_productos: filas.length,
    por_estado: porEstado,
    productos: filas,
  };
}

module.exports = { auditar, enRango, fuenteEstado };
