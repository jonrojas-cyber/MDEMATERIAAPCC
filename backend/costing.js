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

// Coste de UN escandallo (lista de {materia_id, cantidad}).
function costeEscandallo(ingredientes, idxMat) {
  const idx = idxMat || indiceMaterias();
  return (ingredientes || []).reduce((s, ing) => {
    const m = idx[ing.materia_id];
    return s + (m ? (Number(m.coste_medio) || 0) * (Number(ing.cantidad) || 0) : 0);
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

// Coste de una unidad de producto de carta.
function costeProducto(producto, idxMat) {
  return Math.round(costeEscandallo(producto.ingredientes, idxMat) * 10000) / 10000;
}

// IVA de venta por defecto en hostelería (España): 10%. Editable por producto.
const IVA_DEF = 0.10;
function ivaDe(producto) {
  const v = producto && producto.iva != null ? Number(producto.iva) : IVA_DEF;
  return v >= 0 && v < 1 ? v : IVA_DEF;
}

// Margen de un producto de carta: coste (NETO), precio (PVP con IVA), margen y
// food cost. El precio_venta es lo que paga el cliente (con IVA); para el margen
// y el food cost se usa el precio SIN IVA (base imponible), que es lo comparable
// con el coste neto de las materias.
function margenProducto(producto, idxMat) {
  const coste = costeProducto(producto, idxMat);
  const iva = ivaDe(producto);
  const precio = Number(producto.precio_venta) || 0;      // PVP con IVA
  const precioNeto = precio > 0 ? precio / (1 + iva) : 0;  // base imponible
  const margenBruto = precioNeto > 0 ? (precioNeto - coste) / precioNeto : 0;
  const foodCost = precioNeto > 0 ? coste / precioNeto : 0;
  return {
    coste,
    precio,
    iva,
    precio_neto: Math.round(precioNeto * 100) / 100,
    margen_bruto: Math.round(margenBruto * 1000) / 1000,
    margen_euros: Math.round((precioNeto - coste) * 100) / 100,
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
  indiceMaterias, costeEscandallo, costeReceta, costePorUnidad, costeProducto,
  margenProducto, margenMedioCarta, foodCostMedioCarta, valorStock, valorProduccion,
  costeMermas, tamanosLote, ivaDe, IVA_DEF,
};
