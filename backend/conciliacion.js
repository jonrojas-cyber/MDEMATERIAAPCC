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
    resumen: resumenAlmacen(store),
    compra_consumo: compraVsConsumo(store, desde, hasta),
    desviacion: desviacionUltimoInventario(store),
    sin_escandallo: productosSinEscandallo(store, desde, hasta),
    escandallos_afectados: escandallosAfectados(store, desde, hasta),
  };
}

module.exports = { informe, resumenAlmacen, compraVsConsumo, desviacionUltimoInventario, productosSinEscandallo, escandallosAfectados };
