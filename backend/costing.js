// MOTOR DE COSTE Y MARGEN · única fuente de verdad del dinero.
//
// Todo el cálculo de coste/margen/valor de la app pasa por aquí. Ninguna ruta
// debe volver a hacer "coste_medio × cantidad" por su cuenta: así, si cambia la
// fórmula, cambia en todos los sitios a la vez (KPIs, carta, previsión, avisos).

const store = require("./data-store");

function indiceMaterias(materias) {
  const idx = {};
  (materias || store.readAll("materias")).forEach((m) => (idx[m.id] = m));
  return idx;
}

// Índice de recetas por la materia que PRODUCEN (elaboraciones). Permite que el
// coste de una materia elaborada (p. ej. "Salsa M") se derive de SUS ingredientes
// en vez de un coste_medio fijo: así el food cost fluctúa con las facturas.
function indiceRecetasProduccion(recetas) {
  const idx = {};
  (recetas || store.readAll("recetas")).forEach((r) => {
    if (r && r.produce_materia_id) idx[r.produce_materia_id] = r;
  });
  return idx;
}

// Coste EFECTIVO por unidad de una materia. Si la materia la produce una receta
// y NO tiene coste_medio propio (>0), se calcula desde la receta (recursivo, con
// guardia anti-ciclos). Si tiene coste_medio, manda ese (no cambia lo existente).
function costeMateriaEfectivo(materiaId, idxMat, idxRecProd, visitando) {
  const m = idxMat[materiaId];
  const costeDirecto = m ? Number(m.coste_medio) || 0 : 0;
  if (costeDirecto > 0) return costeDirecto;
  const rec = idxRecProd && idxRecProd[materiaId];
  if (rec && !(visitando && visitando.has(materiaId))) {
    const base = Number(rec.resultado_base) || 0;
    if (base > 0) {
      const vis = new Set(visitando || []);
      vis.add(materiaId);
      const costeLote = (rec.ingredientes || []).reduce(
        (s, ing) => s + costeMateriaEfectivo(ing.materia_id, idxMat, idxRecProd, vis) * (Number(ing.cantidad) || 0),
        0
      );
      return costeLote / base; // €/unidad producida
    }
  }
  return costeDirecto;
}

// Coste de UN escandallo (lista de {materia_id, cantidad}). Encadena el coste de
// las elaboraciones (materias producidas por receta) para que sea food cost vivo.
function costeEscandallo(ingredientes, idxMat, idxRecProd) {
  const idx = idxMat || indiceMaterias();
  const idxRec = idxRecProd || indiceRecetasProduccion();
  return (ingredientes || []).reduce((s, ing) => {
    return s + costeMateriaEfectivo(ing.materia_id, idx, idxRec) * (Number(ing.cantidad) || 0);
  }, 0);
}

// Coste total de un lote de receta (para su resultado_base).
function costeReceta(receta, idxMat) {
  return Math.round(costeEscandallo(receta.ingredientes, idxMat) * 10000) / 10000;
}

// Coste por unidad de resultado (ej. € por gramo de producto terminado).
function costePorUnidad(receta, idxMat) {
  const base = Number(receta.resultado_base) || 0;
  return base > 0 ? costeEscandallo(receta.ingredientes, idxMat) / base : 0;
}

// Coste de una unidad de producto de carta (neto, sin IVA de compra).
// Si el producto trae un coste de materia DIRECTO (€/unidad) se usa ese —sirve
// para productos cuyo escandallo no está mapeado a materias (p. ej. lo que se
// vende en Ágora)—; si no, se calcula desde sus ingredientes.
function costeProducto(producto, idxMat) {
  const directo = Number(producto && producto.coste_materia);
  if (Number.isFinite(directo) && directo > 0) return Math.round(directo * 10000) / 10000;
  return Math.round(costeEscandallo(producto.ingredientes, idxMat) * 10000) / 10000;
}

// IVA de venta por defecto en hostelería (España): 10%. Editable por producto.
const IVA_DEF = 0.10;
function ivaDe(producto) {
  const v = producto && producto.iva != null ? Number(producto.iva) : IVA_DEF;
  return v >= 0 && v < 1 ? v : IVA_DEF;
}

// Margen de un producto de carta. El COSTE se muestra CON IVA (lo que pagas de
// verdad al comprar la materia: neto + IVA de compra). El precio, el margen y el
// food cost se calculan contra ese coste con IVA.
function margenProducto(producto, idxMat) {
  const costeNeto = costeProducto(producto, idxMat);
  const iva = ivaDe(producto);
  const coste = Math.round(costeNeto * (1 + iva) * 10000) / 10000; // coste CON IVA
  const precio = Number(producto.precio_venta) || 0;
  const margenBruto = precio > 0 ? (precio - coste) / precio : 0;
  const foodCost = precio > 0 ? coste / precio : 0;
  return {
    coste,
    coste_neto: Math.round(costeNeto * 10000) / 10000,
    iva,
    precio,
    margen_bruto: Math.round(margenBruto * 1000) / 1000,
    margen_euros: Math.round((precio - coste) * 100) / 100,
    food_cost: Math.round(foodCost * 1000) / 1000,
  };
}

// Margen bruto medio de la carta (productos activos con precio).
function margenMedioCarta(productos, idxMat) {
  const idx = idxMat || indiceMaterias();
  const items = (productos || store.readAll("productos")).filter((p) => p.activo !== false && Number(p.precio_venta) > 0);
  if (!items.length) return 0;
  const suma = items.reduce((s, p) => s + margenProducto(p, idx).margen_bruto, 0);
  return Math.round((suma / items.length) * 1000) / 1000;
}

// Food cost medio de la carta (%). Devuelve número tipo 32.5 o null.
function foodCostMedioCarta(productos, idxMat) {
  const idx = idxMat || indiceMaterias();
  const items = (productos || store.readAll("productos")).filter((p) => p.activo !== false && Number(p.precio_venta) > 0);
  if (!items.length) return null;
  const suma = items.reduce((s, p) => s + margenProducto(p, idx).food_cost, 0);
  return Math.round((suma / items.length) * 1000) / 10;
}

// Valor en euros del stock de materias primas.
function valorStock(materias) {
  return Math.round((materias || store.readAll("materias"))
    .reduce((s, m) => s + (Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0), 0) * 100) / 100;
}

// Valor en euros de la producción terminada disponible (lotes vigentes con stock).
function valorProduccion(lotes, recetas, idxMat) {
  const idx = idxMat || indiceMaterias();
  const recById = {};
  (recetas || store.readAll("recetas")).forEach((r) => (recById[r.id] = r));
  const ahora = Date.now();
  return Math.round((lotes || store.readAll("lotes"))
    .filter((l) => l.estado !== "Fuera de servicio" && (l.cantidad_restante == null || l.cantidad_restante > 0))
    .filter((l) => !l.caduca_en || new Date(l.caduca_en).getTime() > ahora)
    .reduce((s, l) => {
      const r = recById[l.receta_id];
      return s + (r ? costePorUnidad(r, idx) * (Number(l.cantidad_restante) || 0) : 0);
    }, 0) * 100) / 100;
}

// Coste total de una lista de ajustes/mermas.
function costeMermas(ajustes) {
  return Math.round((ajustes || store.readAll("ajustes"))
    .reduce((s, a) => s + (Number(a.coste_estimado) || 0), 0) * 100) / 100;
}

// Tamaños de lote fijos por receta.
function tamanosLote(receta) {
  if (receta.tamanos_lote && receta.tamanos_lote.length) return receta.tamanos_lote;
  const base = Number(receta.resultado_base) || 0;
  return [Math.round(base / 2), base];
}

module.exports = {
  indiceMaterias, indiceRecetasProduccion, costeMateriaEfectivo,
  costeEscandallo, costeReceta, costePorUnidad, costeProducto,
  margenProducto, margenMedioCarta, foodCostMedioCarta, valorStock, valorProduccion,
  costeMermas, tamanosLote, ivaDe, IVA_DEF,
};
