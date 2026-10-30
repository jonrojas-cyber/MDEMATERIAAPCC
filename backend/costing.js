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

// Coste EFECTIVO por unidad de una materia + si se pudo RESOLVER (datos.7).
// `resuelto=false` marca que el coste 0 proviene de FALTA DE DATO (materia
// inexistente, o sin coste_medio y sin receta que la produzca), NO de un coste
// real de 0. Es la diferencia clave: "no lo sé" ≠ "cuesta 0". Si la materia la
// produce una receta sin coste_medio propio, se deriva de la receta (recursivo,
// con guardia anti-ciclos) y hereda el `resuelto` de sus ingredientes.
function costeMateriaDetalle(materiaId, idxMat, idxRecProd, visitando) {
  const m = idxMat[materiaId];
  if (!m) return { coste: 0, resuelto: false };                 // materia inexistente → desconocido
  const costeDirecto = Number(m.coste_medio) || 0;
  if (costeDirecto > 0) return { coste: costeDirecto, resuelto: true };
  const rec = idxRecProd && idxRecProd[materiaId];
  if (rec && !(visitando && visitando.has(materiaId))) {
    const base = Number(rec.resultado_base) || 0;
    if (base > 0) {
      const vis = new Set(visitando || []);
      vis.add(materiaId);
      let resuelto = true;
      const costeLote = (rec.ingredientes || []).reduce((s, ing) => {
        const d = costeMateriaDetalle(ing.materia_id, idxMat, idxRecProd, vis);
        const cant = Number(ing.cantidad) || 0;
        if (!d.resuelto && cant > 0) resuelto = false;          // una materia sin coste contamina la elaboración
        return s + d.coste * cant;
      }, 0);
      return { coste: costeLote / base, resuelto };             // €/unidad producida
    }
  }
  return { coste: costeDirecto, resuelto: false };              // sin coste_medio ni receta → desconocido
}

// Compat: solo el número (lo que usaban los consumidores previos).
function costeMateriaEfectivo(materiaId, idxMat, idxRecProd, visitando) {
  return costeMateriaDetalle(materiaId, idxMat, idxRecProd, visitando).coste;
}

// Coste de UN escandallo + cobertura. Encadena el coste de las elaboraciones
// (materias producidas por receta) para que sea food cost vivo, y además reporta
// si quedó INCOMPLETO: `sin_coste` lista las materias cuyo coste no se pudo
// determinar (y que por tanto entraron como 0). Un escandallo incompleto NO debe
// presentarse como un margen cerrado (datos.7).
function costeEscandalloDetalle(ingredientes, idxMat, idxRecProd) {
  const idx = idxMat || indiceMaterias();
  const idxRec = idxRecProd || indiceRecetasProduccion();
  let coste = 0;
  const sin_coste = [];
  (ingredientes || []).forEach((ing) => {
    const cant = Number(ing.cantidad) || 0;
    const d = costeMateriaDetalle(ing.materia_id, idx, idxRec);
    coste += d.coste * cant;
    if (!d.resuelto && cant > 0 && !sin_coste.includes(ing.materia_id)) sin_coste.push(ing.materia_id);
  });
  return { coste, incompleto: sin_coste.length > 0, sin_coste };
}

// Coste de UN escandallo (lista de {materia_id, cantidad}). Compat: solo el número.
function costeEscandallo(ingredientes, idxMat, idxRecProd) {
  return costeEscandalloDetalle(ingredientes, idxMat, idxRecProd).coste;
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
const _costeProductoMemo = new WeakMap(); // idxMat -> Map(prodId -> {coste,incompleto,sin_coste})
function costeProductoDetalle(producto, idxMat, idxRecProd) {
  // Coste DIRECTO (€/unidad) declarado en el producto (p. ej. lo que vende Ágora
  // sin escandallo mapeado): se considera completo y fiable.
  const directo = Number(producto && producto.coste_materia);
  if (Number.isFinite(directo) && directo > 0) {
    return { coste: Math.round(directo * 10000) / 10000, incompleto: false, sin_coste: [] };
  }
  // Memoización POR PASADA (rendimiento.5): costeProducto se llamaba de forma
  // recursiva por cada línea de venta en cada escaneo. La caché va atada al objeto
  // idxMat, que se reconstruye en cada cálculo (financials, cierre-mes, dashboard…),
  // así que NO envejece entre pasadas y devuelve el MISMO valor. Al liberarse idxMat
  // (fin de la pasada) la caché se recolecta sola (WeakMap).
  const idxRec = idxRecProd || indiceRecetasProduccion();
  const calc = () => {
    const d = costeEscandalloDetalle(producto && producto.ingredientes, idxMat, idxRec);
    // RESPALDO del food cost automático: si el producto no tiene escandallo mapeado
    // (coste 0 o incompleto), usa el coste de materia base por nombre. Así lo que
    // vende Ágora sin escandallo propio igualmente aporta coste → el food cost se
    // calcula solo. En cuanto se cargue el escandallo/coste real, ese manda.
    if (!(d.coste > 0) || d.incompleto) {
      const base = require("./escandallos-base").coste(producto && producto.nombre);
      if (base && base.coste > 0) {
        return { coste: Math.round(base.coste * 10000) / 10000, incompleto: false, sin_coste: [], fuente_coste: base.fuente };
      }
    }
    return { coste: Math.round(d.coste * 10000) / 10000, incompleto: d.incompleto, sin_coste: d.sin_coste };
  };
  const pid = producto && producto.id;
  if (idxMat && pid) {
    let cache = _costeProductoMemo.get(idxMat);
    if (!cache) { cache = new Map(); _costeProductoMemo.set(idxMat, cache); }
    if (cache.has(pid)) return cache.get(pid);
    const v = calc();
    cache.set(pid, v);
    return v;
  }
  return calc();
}

// Compat: solo el número (consumidores que solo quieren el coste unitario).
function costeProducto(producto, idxMat) {
  return costeProductoDetalle(producto, idxMat).coste;
}

// IVA de venta: 10% ÚNICO para TODOS los productos (decisión de la fundadora, Mónica
// 2026-10). No se usa producto.iva en el lado de ventas; el PVP se netea siempre a 1,10.
const IVA_DEF = require("./iva").IVA_VENTA; // fuente única (dinero.8)
function ivaDe(_producto) {
  return IVA_DEF;
}

// Margen de un producto de carta, en base NETA (sin IVA), igual que el P&L
// (dinero.3/4/5). El coste de materia ya es neto; el PVP se lleva a su base
// imponible (precio_neto = PVP / (1+IVA de venta)). Así el coste € y el margen €
// por producto cuadran con la cuenta de resultados (antes el coste se "engrosaba"
// con el IVA de VENTA, lo que inflaba el margen y no casaba con el P&L neto).
// NOTA: los RATIOS (margen_bruto y food_cost) son idénticos en ambas convenciones
// —(P − c(1+i))/P = (P/(1+i) − c)/(P/(1+i))—, así que los % no cambian; solo se
// corrigen los importes en €.
function margenProducto(producto, idxMat) {
  const det = costeProductoDetalle(producto, idxMat);
  const costeNeto = det.coste;
  const iva = ivaDe(producto);
  const precio = Number(producto.precio_venta) || 0; // PVP, BRUTO (con IVA)
  const precioNeto = precio / (1 + iva);              // base imponible del PVP
  const margenBruto = precioNeto > 0 ? (precioNeto - costeNeto) / precioNeto : 0;
  const foodCost = precioNeto > 0 ? costeNeto / precioNeto : 0;
  return {
    coste: Math.round(costeNeto * 10000) / 10000,     // coste NETO (fuente única, como el P&L)
    coste_neto: Math.round(costeNeto * 10000) / 10000,
    iva,
    precio,                                           // PVP bruto (titular)
    precio_neto: Math.round(precioNeto * 10000) / 10000,
    margen_bruto: Math.round(margenBruto * 1000) / 1000,
    margen_euros: Math.round((precioNeto - costeNeto) * 100) / 100, // margen NETO en €
    food_cost: Math.round(foodCost * 1000) / 1000,
    // datos.7 · un escandallo con materias sin coste da un coste INFRAVALORADO
    // (las desconocidas entran como 0). Se marca explícito para que el margen NO
    // se lea como cerrado: `incompleto` + las materias que faltan por costear.
    incompleto: det.incompleto,
    coste_fiable: !det.incompleto,
    materias_sin_coste: det.sin_coste,
  };
}

// Margen bruto medio de la carta (productos activos con precio).
// Solo se promedian productos con coste REAL (>0) y COMPLETO. Incluir los que aún
// no tienen escandallo (coste 0) los cuenta como 0 % de food cost / 100 % de
// margen y falsea la media (bajaba el food cost al 21 % en vez del 28 % real).
// Y los INCOMPLETOS (datos.7: alguna materia sin coste → coste infravalorado)
// también se excluyen: un margen basado en un coste a medias no es un margen
// real, así que no debe arrastrar la media como si lo fuera. Se señalan aparte
// con cartaIncompleta().
function cartaCosteada(productos, idx) {
  return (productos || store.readAll("productos"))
    .filter((p) => p.activo !== false && Number(p.precio_venta) > 0)
    .map((p) => ({ p, mm: margenProducto(p, idx) }))
    .filter((x) => x.mm.coste > 0 && !x.mm.incompleto);
}

// Productos activos con precio cuyo escandallo está INCOMPLETO (alguna materia sin
// coste). Son los que quedan fuera de la media de carta: su margen es parcial y
// debe revisarse, no promediarse. (datos.7)
function cartaIncompleta(productos, idx) {
  const idxMat = idx || indiceMaterias();
  return (productos || store.readAll("productos"))
    .filter((p) => p.activo !== false && Number(p.precio_venta) > 0)
    .map((p) => ({ p, mm: margenProducto(p, idxMat) }))
    .filter((x) => x.mm.incompleto)
    .map((x) => ({
      producto_id: x.p.id, nombre: x.p.nombre, categoria: x.p.categoria || null,
      coste_parcial: x.mm.coste, materias_sin_coste: x.mm.materias_sin_coste,
    }));
}

function margenMedioCarta(productos, idxMat) {
  const idx = idxMat || indiceMaterias();
  const items = cartaCosteada(productos, idx);
  if (!items.length) return 0;
  const suma = items.reduce((s, x) => s + x.mm.margen_bruto, 0);
  return Math.round((suma / items.length) * 1000) / 1000;
}

// Food cost medio de la carta (%). Devuelve número tipo 32.5 o null.
function foodCostMedioCarta(productos, idxMat) {
  const idx = idxMat || indiceMaterias();
  const items = cartaCosteada(productos, idx);
  if (!items.length) return null;
  const suma = items.reduce((s, x) => s + x.mm.food_cost, 0);
  return Math.round((suma / items.length) * 1000) / 10;
}

// Margen de contribución PONDERADO POR VENTAS (dinero.7). margenMedioCarta trata
// todos los productos de la carta por igual (margen de CATÁLOGO); esta pondera por
// lo que de verdad se vendió: ratio = Σ(margen € · uds) / Σ(ingreso neto · uds).
// Es el margen REALIZADO (el del mix real), distinto del teórico de carta. Ignora
// productos sin coste fiable o con escandallo incompleto (datos.7). Devuelve un
// ratio 0..1, o null si no hay ventas costeables.
function margenPonderadoVentas(productos, ventas, idxMat) {
  const idx = idxMat || indiceMaterias();
  const prodById = {};
  (productos || store.readAll("productos")).forEach((p) => { if (p && p.id != null) prodById[p.id] = p; });
  let netoTotal = 0, margenTotal = 0;
  (ventas || store.readAll("ventas")).forEach((v) => {
    const p = prodById[v.producto_id];
    if (!p) return;
    const mm = margenProducto(p, idx);
    if (!(mm.coste > 0) || mm.incompleto) return; // sin coste fiable no pondera
    const cant = Number(v.cantidad) || 0;
    if (cant <= 0) return; // devoluciones/invitaciones no definen el margen de carta
    netoTotal += mm.precio_neto * cant;
    margenTotal += mm.margen_euros * cant;
  });
  return netoTotal > 0 ? Math.round((margenTotal / netoTotal) * 10000) / 10000 : null;
}

// Valor en euros del stock (disponibilidad × coste_medio) · fuente ÚNICA
// (dinero.10). El producto por ítem vive aquí una sola vez; las rutas y la
// analítica NO deben recalcularlo inline (antes se duplicaba en reportes/inicio/
// materias/analitica/inventory-capital con redondeos dispares).
function valorStockRaw(m) {
  return (Number(m && m.disponibilidad_actual) || 0) * (Number(m && m.coste_medio) || 0);
}
// Valor de UNA materia, redondeado a 2 decimales (para mostrar por ítem).
function valorStockMateria(m) {
  return Math.round(valorStockRaw(m) * 100) / 100;
}
// Valor total del stock. Suma en crudo y redondea UNA vez (no acumula el error de
// redondear por ítem), así el agregado cuadra con el P&L.
function valorStock(materias) {
  return Math.round((materias || store.readAll("materias")).reduce((s, m) => s + valorStockRaw(m), 0) * 100) / 100;
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
  indiceMaterias, indiceRecetasProduccion, costeMateriaEfectivo, costeMateriaDetalle,
  costeEscandallo, costeEscandalloDetalle, costeReceta, costePorUnidad,
  costeProducto, costeProductoDetalle,
  margenProducto, margenMedioCarta, foodCostMedioCarta, margenPonderadoVentas, cartaCosteada, cartaIncompleta,
  valorStock, valorStockMateria, valorStockRaw, valorProduccion, costeMermas, tamanosLote, ivaDe, IVA_DEF,
};
