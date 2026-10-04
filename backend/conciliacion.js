// CONCILIACIÓN DE ALMACÉN · compra vs venta vs stock, desviaciones y escandallos
// ─────────────────────────────────────────────────────────────────────────────
// Reúne, de un vistazo y al milímetro, lo que de verdad importa del almacén:
//   1) RESUMEN: qué deberíamos tener (stock teórico) y cuánto vale.
//   2) COMPRA vs CONSUMO en un periodo (por materia): lo comprado (recepciones)
//      frente a lo consumido por las ventas de Ágora (ledger stock_movements).
//   3) DESVIACIÓN: último recuento físico vs teórico (descuadre € y merma oculta).
//   4) PRODUCTOS SIN ESCANDALLO: los de Ágora que se venden pero NO descuentan
//      stock porque les falta la receta → causa raíz de que el almacén no cuadre.
//   5) ESCANDALLOS AFECTADOS: recetas/productos que usan una materia cuyo precio
//      de compra ha subido (precios_historico) → avisos de escandallo disparado.
//
// Todo se deriva de las entidades existentes (una sola fuente) y del motor de
// coste (costing.js). No escribe nada: es solo lectura/análisis.

const costing = require("./costing");

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function r4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
function dentro(fechaISO, desde, hasta) {
  const t = String(fechaISO || "").slice(0, 10);
  return (!desde || t >= desde) && (!hasta || t <= hasta);
}

// 1) Stock teórico actual y su valor (lo que deberíamos tener).
function resumenAlmacen(store) {
  const materias = store.readAll("materias") || [];
  const items = materias.map((m) => {
    const teorico = r2(m.disponibilidad_actual);
    const coste = Number(m.coste_medio) || 0;
    const min = Number(m.stock_minimo) || 0;
    return {
      materia_id: m.id, nombre: m.nombre, unidad: m.unidad || "",
      teorico, coste_medio: r4(coste), valor: r2(teorico * coste),
      stock_minimo: min, bajo_minimo: min > 0 && teorico < min, sin_coste: !(coste > 0),
    };
  });
  const valor_total = r2(items.reduce((s, i) => s + i.valor, 0));
  return {
    valor_total,
    n_materias: items.length,
    n_bajo_minimo: items.filter((i) => i.bajo_minimo).length,
    n_sin_coste: items.filter((i) => i.sin_coste).length,
    bajo_minimo: items.filter((i) => i.bajo_minimo).sort((a, b) => a.teorico - b.teorico),
    items,
  };
}

// 2) Comprado (recepciones) vs consumido (ventas vía ledger) por materia, en periodo.
function compraVsConsumo(store, desde, hasta) {
  const materias = store.readAll("materias") || [];
  const nombre = {}; materias.forEach((m) => (nombre[m.id] = m));
  const comprado = {}; const consumido = {};

  (store.readAll("recepciones") || []).forEach((r) => {
    if (!dentro(r.fecha, desde, hasta)) return;
    // Solo los ALBARANES mueven cantidad de stock. Las facturas son documento
    // fiscal (dinero/precio), no entrada de mercancía: no cuentan como "comprado"
    // (evita cantidades OCR poco fiables y descuadres fantasma).
    if ((r.tipo_documento || "albaran") === "factura") return;
    (r.lineas || []).forEach((l) => {
      if (!l.materia_id) return;
      const c = Number(l.cantidad) || 0; if (c > 0) comprado[l.materia_id] = (comprado[l.materia_id] || 0) + c;
    });
  });
  (store.readAll("stock_movements") || []).forEach((mv) => {
    if (mv.reason !== "venta") return;
    if (!dentro(mv.created_at, desde, hasta)) return;
    const d = Number(mv.delta) || 0; // negativo al vender
    if (d < 0) consumido[mv.materia_id] = (consumido[mv.materia_id] || 0) + (-d);
  });

  const ids = Array.from(new Set([...Object.keys(comprado), ...Object.keys(consumido)]));
  const lineas = ids.map((id) => {
    const m = nombre[id] || { nombre: id, unidad: "", coste_medio: 0 };
    const comp = r2(comprado[id] || 0), cons = r2(consumido[id] || 0);
    return {
      materia_id: id, nombre: m.nombre, unidad: m.unidad || "",
      comprado: comp, consumido: cons, neto: r2(comp - cons),
      coste_medio: r4(Number(m.coste_medio) || 0), valor_neto: r2((comp - cons) * (Number(m.coste_medio) || 0)),
    };
  }).sort((a, b) => Math.abs(b.valor_neto) - Math.abs(a.valor_neto));
  return { lineas, n: lineas.length };
}

// 3) Último recuento físico: desviación real vs teórico.
function desviacionUltimoInventario(store) {
  const invs = store.readAll("inventarios") || [];
  if (!invs.length) return null;
  const last = invs.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).pop();
  return {
    id: last.id, fecha: last.fecha, responsable: last.responsable || "",
    total_lineas: last.total_lineas, lineas_con_descuadre: last.lineas_con_descuadre,
    descuadre_eur: r2(last.descuadre_eur), merma_oculta_eur: r2(last.merma_oculta_eur),
    peores: (last.lineas || []).filter((l) => l.diferencia !== 0)
      .sort((a, b) => Math.abs(b.valor_diferencia) - Math.abs(a.valor_diferencia)).slice(0, 15),
  };
}

// 4) Productos de Ágora vendidos SIN escandallo (no descuentan stock) en periodo.
function productosSinEscandallo(store, desde, hasta) {
  const productos = store.readAll("productos") || [];
  const byId = {}; productos.forEach((p) => (byId[p.id] = p));
  const vendidas = {};
  (store.readAll("ventas") || []).forEach((v) => {
    if (!dentro(v.fecha, desde, hasta)) return;
    const id = v.producto_id; if (!id) return;
    vendidas[id] = (vendidas[id] || 0) + (Number(v.cantidad) || 0);
  });
  const lista = Object.keys(vendidas).map((id) => {
    const p = byId[id];
    const conEscandallo = p && Array.isArray(p.ingredientes) && p.ingredientes.length > 0;
    const costeDirecto = p && Number(p.coste_materia) > 0;
    return { producto_id: id, nombre: p ? p.nombre : id, unidades: r2(vendidas[id]), sin_escandallo: !(conEscandallo || costeDirecto) };
  }).filter((x) => x.sin_escandallo).sort((a, b) => b.unidades - a.unidades);
  return { lista, n: lista.length };
}

// 5) Escandallos afectados por subidas de precio de compra (precios_historico).
// Mapea cada subida a su materia y marca las recetas/productos que la usan.
function escandallosAfectados(store, desde, hasta, umbralPct) {
  const umbral = umbralPct == null ? 5 : umbralPct;
  const materias = store.readAll("materias") || [];
  const comprasProd = store.readAll("compras_productos") || [];
  const artMat = {}; comprasProd.forEach((a) => { if (a.id) artMat[a.id] = a.materia_id || null; });

  // Subida más reciente por materia (resolviendo artículo→materia cuando aplica).
  const subida = {}; // materia_id -> {anterior, nuevo, pct, fecha}
  (store.readAll("precios_historico") || []).forEach((h) => {
    if (!dentro(h.fecha, desde, hasta)) return;
    const ant = Number(h.precio_anterior) || 0, nue = Number(h.precio_nuevo) || 0;
    if (!(ant > 0) || !(nue > ant)) return;
    const pct = Math.round(((nue - ant) / ant) * 100);
    if (pct < umbral) return;
    const matId = h.origen === "factura" ? artMat[h.producto_id] : h.producto_id; // factura→artículo→materia
    if (!matId) return;
    const prev = subida[matId];
    if (!prev || String(h.fecha) > String(prev.fecha)) subida[matId] = { anterior: r4(ant), nuevo: r4(nue), pct, fecha: h.fecha };
  });

  if (!Object.keys(subida).length) return { lista: [], n: 0 };
  const idxMat = costing.indiceMaterias(materias);
  const idxRec = costing.indiceRecetasProduccion(store.readAll("recetas"));
  const nombreMat = (id) => (idxMat[id] ? idxMat[id].nombre : id);

  const afectados = [];
  const escandallos = []
    .concat((store.readAll("productos") || []).filter((p) => Array.isArray(p.ingredientes) && p.ingredientes.length).map((p) => ({ tipo: "producto", nombre: p.nombre, ingredientes: p.ingredientes })))
    .concat((store.readAll("recetas") || []).filter((r) => Array.isArray(r.ingredientes) && r.ingredientes.length).map((r) => ({ tipo: "receta", nombre: r.nombre, ingredientes: r.ingredientes, resultado_base: r.resultado_base })));

  escandallos.forEach((e) => {
    const culpables = (e.ingredientes || []).filter((ing) => subida[ing.materia_id])
      .map((ing) => ({ ingrediente: nombreMat(ing.materia_id), ...subida[ing.materia_id] }));
    if (!culpables.length) return;
    const costeAhora = r4(costing.costeEscandallo(e.ingredientes, idxMat, idxRec));
    afectados.push({ tipo: e.tipo, nombre: e.nombre, coste_escandallo: costeAhora, culpables: culpables.sort((a, b) => b.pct - a.pct) });
  });
  afectados.sort((a, b) => (b.culpables[0] ? b.culpables[0].pct : 0) - (a.culpables[0] ? a.culpables[0].pct : 0));
  return { lista: afectados, n: afectados.length };
}

// Coste de materia por UNIDAD de un producto (directo o por escandallo, con
// elaboraciones). Usa los costes de materia ACTUALES (que siguen a las compras).
function costeUnidadProducto(p, idxMat, idxRec) {
  const directo = Number(p && p.coste_materia);
  if (Number.isFinite(directo) && directo > 0) return directo;
  return costing.costeEscandallo((p && p.ingredientes) || [], idxMat, idxRec);
}

// PÉRDIDAS Y GANANCIAS (P&L) por VENTAS REALES del periodo, diario y total.
//   Ingresos  = Σ importe neto de las ventas (del export de Ágora).
//   Coste     = Σ cantidad × coste de materia del producto (escandallo × compras).
//   Mermas    = Σ coste estimado de los ajustes/mermas del periodo.
//   Margen    = Ingresos − Coste − Mermas · Food cost % = Coste / Ingresos.
// El food cost % SÍ varía: depende del coste real (que sigue a las compras) y del
// mix de ventas de cada día.
function pyl(store, desde, hasta) {
  const productos = store.readAll("productos") || [];
  const byId = {}; productos.forEach((p) => (byId[p.id] = p));
  const idxMat = costing.indiceMaterias(store.readAll("materias"));
  const idxRec = costing.indiceRecetasProduccion(store.readAll("recetas"));

  const dias = {};
  let ingTot = 0, cosTot = 0;
  (store.readAll("ventas") || []).forEach((v) => {
    if (!dentro(v.fecha, desde, hasta)) return;
    const dia = String(v.fecha).slice(0, 10);
    const ing = Number(v.importe) || 0;
    const cu = byId[v.producto_id] ? costeUnidadProducto(byId[v.producto_id], idxMat, idxRec) : 0;
    const cos = cu * (Number(v.cantidad) || 0);
    const d = (dias[dia] = dias[dia] || { fecha: dia, ingresos: 0, coste: 0, uds: 0 });
    d.ingresos += ing; d.coste += cos; d.uds += Number(v.cantidad) || 0;
    ingTot += ing; cosTot += cos;
  });

  // Mermas del periodo (coste estimado) desde la entidad `ajustes`.
  let mermas = 0; const mermasDia = {};
  (store.readAll("ajustes") || []).forEach((a) => {
    const f = a.fecha || a.created_at; if (!dentro(f, desde, hasta)) return;
    const c = Number(a.coste_estimado) || 0; mermas += c;
    const dia = String(f).slice(0, 10); mermasDia[dia] = (mermasDia[dia] || 0) + c;
  });

  const serie = Object.values(dias).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((d) => {
    const mer = r2(mermasDia[d.fecha] || 0);
    return {
      fecha: d.fecha, uds: Math.round(d.uds),
      ingresos: r2(d.ingresos), coste: r2(d.coste), mermas: mer,
      margen: r2(d.ingresos - d.coste - mer),
      food_cost_pct: d.ingresos > 0 ? r2(d.coste / d.ingresos * 100) : 0,
    };
  });

  return {
    ingresos: r2(ingTot), coste_ventas: r2(cosTot), mermas: r2(mermas),
    margen: r2(ingTot - cosTot - mermas),
    food_cost_pct: ingTot > 0 ? r2(cosTot / ingTot * 100) : 0,
    margen_pct: ingTot > 0 ? r2((ingTot - cosTot - mermas) / ingTot * 100) : 0,
    n_dias: serie.length, dias: serie,
  };
}

// P&L POR PRODUCTO del periodo: para CADA producto vendido, uds, ingresos, coste
// de materia, margen y food cost %. Marca el que no tiene coste cargado para que
// nada quede "al azar". Ordenado por ingresos.
function pylPorProducto(store, desde, hasta) {
  const productos = store.readAll("productos") || [];
  const byId = {}; productos.forEach((p) => (byId[p.id] = p));
  const idxMat = costing.indiceMaterias(store.readAll("materias"));
  const idxRec = costing.indiceRecetasProduccion(store.readAll("recetas"));

  const agg = {};
  (store.readAll("ventas") || []).forEach((v) => {
    if (!dentro(v.fecha, desde, hasta)) return;
    const id = v.producto_id || ("n:" + (v.producto || ""));
    const a = (agg[id] = agg[id] || { producto_id: v.producto_id || null, nombre: (byId[v.producto_id] && byId[v.producto_id].nombre) || v.producto || id, uds: 0, ingresos: 0 });
    a.uds += Number(v.cantidad) || 0; a.ingresos += Number(v.importe) || 0;
  });

  const lista = Object.values(agg).map((a) => {
    const p = a.producto_id ? byId[a.producto_id] : null;
    const tieneEsc = !!(p && ((Array.isArray(p.ingredientes) && p.ingredientes.length) || Number(p.coste_materia) > 0));
    const cu = p ? costeUnidadProducto(p, idxMat, idxRec) : 0;
    const coste = r2(cu * a.uds);
    const ing = r2(a.ingresos);
    return {
      nombre: a.nombre, uds: Math.round(a.uds), ingresos: ing,
      coste, coste_unitario: Math.round(cu * 10000) / 10000,
      margen: r2(ing - coste),
      food_cost_pct: ing > 0 ? r2(coste / ing * 100) : 0,
      modificador: !tieneEsc,                 // sin escandallo propio (leches, orígenes…)
      sin_coste: tieneEsc && !(cu > 0),         // tiene escandallo pero su coste es 0 → revisar
    };
  }).sort((x, y) => y.ingresos - x.ingresos);

  return { lista, n: lista.length, n_sin_coste: lista.filter((x) => x.sin_coste).length };
}

// Informe completo. `dias` define la ventana (por defecto 90). Admite desde/hasta.
function informe(store, opts = {}) {
  let { desde, hasta, dias } = opts;
  if (!desde) {
    const d = new Date(); const h = new Date();
    d.setDate(d.getDate() - (Number(dias) > 0 ? Number(dias) : 90));
    desde = d.toISOString().slice(0, 10); hasta = hasta || h.toISOString().slice(0, 10);
  }
  return {
    periodo: { desde, hasta },
    pyl: pyl(store, desde, hasta),
    por_producto: pylPorProducto(store, desde, hasta),
    resumen: resumenAlmacen(store),
    compra_consumo: compraVsConsumo(store, desde, hasta),
    desviacion: desviacionUltimoInventario(store),
    sin_escandallo: productosSinEscandallo(store, desde, hasta),
    escandallos_afectados: escandallosAfectados(store, desde, hasta),
  };
}

module.exports = { informe, pyl, pylPorProducto, resumenAlmacen, compraVsConsumo, desviacionUltimoInventario, productosSinEscandallo, escandallosAfectados };
