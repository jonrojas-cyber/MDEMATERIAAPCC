// ANÁLISIS DIARIO · rayos X de un día de m de materia.
// Diseca TODO lo relevante de la VENTA y la COMPRA de un día concreto, con datos
// reales (cero inventos): si un dato no está en el sistema, se dice, no se rellena.
//
// Fuente única del dinero: costing.js (coste de producto) y break-even.js (punto
// de equilibrio). Este módulo solo LEE y AGREGA lo que ya hay:
//   · ventas   → entidad "ventas" (importe = base de la línea de Ágora, no PVP nuestro)
//   · compras  → entidad "recepciones" (albaranes ya registrados)
//   · precios  → entidad "precios_historico" (cambios de coste de proveedor)
//
// `computar(datos, fecha)` es puro (inyectable para tests). `analizar(fecha)` lee
// del store y compone con el motor de equilibrio en vivo.

const store = require("./data-store");
const costing = require("./costing");

const DAY = 86400000;
function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function pct1(n) { return Math.round((Number(n) || 0) * 1000) / 10; }
function ymd(f) { return String(f || "").slice(0, 10); }
function restarDias(fecha, n) {
  const d = new Date(ymd(fecha) + "T12:00:00Z");
  return new Date(d.getTime() - n * DAY).toISOString().slice(0, 10);
}
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function nombreDia(fecha) { return DIAS_SEMANA[new Date(ymd(fecha) + "T12:00:00Z").getUTCDay()]; }

// ── VENTA DE UN DÍA ─────────────────────────────────────────────────────────
// Resume la venta de `dia` a partir de las líneas de "ventas" (fuente Ágora).
// El importe es la base real cobrada por Ágora; el coste sale de costing (coste
// real conocido). Un producto sin coste cargado NO inventa coste: se contabiliza
// aparte para que el margen del día sea honesto (solo sobre lo que sí sabemos).
function ventaDia(dia, ventas, prodById, prodByName, idxMat) {
  const lineas = ventas.filter((v) => {
    if (v.fuente && v.fuente !== "agora") return false;
    return ymd(v.fecha) === dia;
  });

  let importe = 0, unidades = 0, coste = 0, importeConCoste = 0, importeSinCoste = 0;
  const tickets = new Set();
  const porProducto = {};
  const porCategoria = {};
  const sinCoste = {};

  lineas.forEach((v) => {
    const cant = Number(v.cantidad) || 0;
    const imp = Number(v.importe) || 0;
    const p = prodById[v.producto_id] || prodByName[String(v.producto || "").toLowerCase()];
    const cu = p ? costing.costeProducto(p, idxMat) : 0;   // coste unitario real (0 si no se conoce)
    const cLinea = cu * cant;
    importe += imp; unidades += cant;
    if (v.doc_clave) tickets.add(v.doc_clave);

    const cat = (p && p.categoria) || "otros";
    if (!porCategoria[cat]) porCategoria[cat] = { categoria: cat, importe: 0, unidades: 0 };
    porCategoria[cat].importe += imp; porCategoria[cat].unidades += cant;

    const key = v.producto || (p && p.nombre) || v.producto_id || "—";
    if (!porProducto[key]) porProducto[key] = { producto: key, unidades: 0, importe: 0, coste: 0, coste_conocido: cu > 0, categoria: cat };
    porProducto[key].unidades += cant; porProducto[key].importe += imp; porProducto[key].coste += cLinea;
    if (cu > 0) porProducto[key].coste_conocido = true;

    if (cu > 0) { coste += cLinea; importeConCoste += imp; }
    else {
      importeSinCoste += imp;
      if (!sinCoste[key]) sinCoste[key] = { producto: key, unidades: 0, importe: 0 };
      sinCoste[key].unidades += cant; sinCoste[key].importe += imp;
    }
  });

  const nTickets = tickets.size || (lineas.length ? 1 : 0);
  const prod = Object.values(porProducto).map((x) => ({
    producto: x.producto, categoria: x.categoria,
    unidades: Math.round(x.unidades * 10) / 10, importe: eur(x.importe),
    coste: x.coste_conocido ? eur(x.coste) : null,
    beneficio: x.coste_conocido ? eur(x.importe - x.coste) : null,
    margen_pct: x.coste_conocido && x.importe > 0 ? Math.round((1 - x.coste / x.importe) * 100) : null,
  }));

  return {
    fecha: dia,
    total: eur(importe),
    tickets: nTickets,
    ticket_medio: nTickets ? eur(importe / nTickets) : 0,
    unidades: Math.round(unidades * 10) / 10,
    unidades_por_ticket: nTickets ? Math.round((unidades / nTickets) * 10) / 10 : 0,
    lineas: lineas.length,
    // Margen del día SOLO sobre lo que tiene coste real cargado (honesto).
    coste_materia: eur(coste),
    margen_eur: eur(importeConCoste - coste),
    margen_pct: importeConCoste > 0 ? Math.round((1 - coste / importeConCoste) * 100) : null,
    cobertura_coste_pct: importe > 0 ? Math.round((importeConCoste / importe) * 100) : null,
    importe_sin_coste: eur(importeSinCoste),
    por_categoria: Object.values(porCategoria).map((c) => ({
      categoria: c.categoria, importe: eur(c.importe), unidades: Math.round(c.unidades * 10) / 10,
      pct: importe > 0 ? Math.round((c.importe / importe) * 100) : 0,
    })).sort((a, b) => b.importe - a.importe),
    top_por_importe: [...prod].sort((a, b) => b.importe - a.importe).slice(0, 12),
    top_por_unidades: [...prod].sort((a, b) => b.unidades - a.unidades).slice(0, 12),
    top_por_beneficio: prod.filter((x) => x.beneficio != null).sort((a, b) => b.beneficio - a.beneficio).slice(0, 8),
    menor_margen: prod.filter((x) => x.margen_pct != null).sort((a, b) => a.margen_pct - b.margen_pct).slice(0, 6),
    sin_coste: Object.values(sinCoste).map((x) => ({ producto: x.producto, unidades: Math.round(x.unidades * 10) / 10, importe: eur(x.importe) }))
      .sort((a, b) => b.importe - a.importe),
    productos_distintos: prod.length,
  };
}

// Delta % entre hoy y una referencia (null si no hay referencia comparable).
function delta(hoy, ref) {
  if (!(ref > 0)) return null;
  return Math.round(((hoy - ref) / ref) * 1000) / 10;
}

// ── COMPRA DE UN DÍA ────────────────────────────────────────────────────────
// Todo lo comprado ese día (albaranes registrados) por proveedor / familia /
// producto, más los cambios de precio de proveedor con esa fecha.
function familiaDe(m) {
  if (!m) return "Sin clasificar";
  return m.subcategoria || m.macro || m.categoria || "Sin clasificar";
}
function compraDia(dia, recepciones, matById, provById, prodComprasById, preciosHist) {
  const recs = recepciones.filter((r) => ymd(r.fecha) === dia);
  let total = 0, totalLineas = 0;
  const porProveedor = {}, porFamilia = {}, porProducto = {};

  recs.forEach((r) => {
    total += Number(r.importe_total) || 0;
    const prov = provById[r.proveedor_id];
    (r.lineas || []).forEach((l) => {
      const imp = Number(l.importe) || 0;
      const cant = Number(l.cantidad) || 0;
      totalLineas += imp;
      const m = l.materia_id ? matById[l.materia_id] : null;
      const fam = familiaDe(m);
      const kProv = r.proveedor_id || "—";
      if (!porProveedor[kProv]) porProveedor[kProv] = { proveedor: prov ? prov.nombre : kProv, importe: 0, lineas: 0 };
      porProveedor[kProv].importe += imp; porProveedor[kProv].lineas += 1;
      if (!porFamilia[fam]) porFamilia[fam] = { familia: fam, importe: 0, lineas: 0 };
      porFamilia[fam].importe += imp; porFamilia[fam].lineas += 1;
      const kProd = l.materia_id || `desc:${(l.descripcion || "—").toLowerCase()}`;
      if (!porProducto[kProd]) porProducto[kProd] = { producto: m ? m.nombre : (l.descripcion || "—"), familia: fam, cantidad: 0, importe: 0 };
      porProducto[kProd].cantidad += cant; porProducto[kProd].importe += imp;
    });
  });

  // Cambios de precio de proveedor registrados ese día (subidas y bajadas).
  const cambios = (preciosHist || [])
    .filter((h) => ymd(h.fecha) === dia && Number(h.precio_anterior) > 0 && Number(h.precio_nuevo) > 0 && Number(h.precio_nuevo) !== Number(h.precio_anterior))
    .map((h) => ({
      producto: (prodComprasById[h.producto_id] && prodComprasById[h.producto_id].nombre) || h.producto_id,
      proveedor: (provById[h.proveedor_id] && provById[h.proveedor_id].nombre) || h.proveedor_id || null,
      precio_anterior: eur(h.precio_anterior), precio_nuevo: eur(h.precio_nuevo),
      variacion_pct: Math.round(((h.precio_nuevo - h.precio_anterior) / h.precio_anterior) * 1000) / 10,
    }))
    .sort((a, b) => Math.abs(b.variacion_pct) - Math.abs(a.variacion_pct));

  const norm = (o, extra) => Object.values(o).map((x) => ({ ...x, importe: eur(x.importe), ...(extra ? extra(x) : {}) })).sort((a, b) => b.importe - a.importe);

  return {
    fecha: dia,
    recepciones: recs.length,
    total: eur(total),
    total_lineas: eur(totalLineas),
    por_proveedor: norm(porProveedor),
    por_familia: norm(porFamilia),
    top_productos: norm(porProducto, (x) => ({ cantidad: Math.round(x.cantidad * 100) / 100 })).slice(0, 12),
    cambios_precio: cambios,
  };
}

// ── COMPUTAR (puro) ─────────────────────────────────────────────────────────
function computar(datos, fecha) {
  const dia = ymd(fecha);
  const {
    ventas = [], productos = [], materias = [], recepciones = [],
    proveedores = [], compras_productos = [], precios_historico = [], equilibrio = null,
  } = datos;

  const idxMat = costing.indiceMaterias(materias);
  const prodById = {}; productos.forEach((p) => (prodById[p.id] = p));
  const prodByName = {}; productos.forEach((p) => { if (p.nombre) prodByName[p.nombre.toLowerCase()] = p; });
  const matById = {}; materias.forEach((m) => (matById[m.id] = m));
  const provById = {}; proveedores.forEach((p) => (provById[p.id] = p));
  const prodComprasById = {}; compras_productos.forEach((p) => (prodComprasById[p.id] = p));

  const hoy = ventaDia(dia, ventas, prodById, prodByName, idxMat);
  const ayer = ventaDia(restarDias(dia, 1), ventas, prodById, prodByName, idxMat);
  const semanaPasada = ventaDia(restarDias(dia, 7), ventas, prodById, prodByName, idxMat);
  const compras = compraDia(dia, recepciones, matById, provById, prodComprasById, precios_historico);

  const comparativa = {
    vs_ayer: {
      fecha: ayer.fecha,
      total: delta(hoy.total, ayer.total), tickets: delta(hoy.tickets, ayer.tickets),
      ticket_medio: delta(hoy.ticket_medio, ayer.ticket_medio), unidades: delta(hoy.unidades, ayer.unidades),
      total_ref: ayer.total,
    },
    vs_semana_pasada: {
      fecha: semanaPasada.fecha, dia_semana: nombreDia(semanaPasada.fecha),
      total: delta(hoy.total, semanaPasada.total), tickets: delta(hoy.tickets, semanaPasada.tickets),
      ticket_medio: delta(hoy.ticket_medio, semanaPasada.ticket_medio), unidades: delta(hoy.unidades, semanaPasada.unidades),
      total_ref: semanaPasada.total,
    },
  };

  // Rentabilidad del día: ¿cubrió el punto de equilibrio?
  let rentabilidad = null;
  if (equilibrio && equilibrio.disponible && equilibrio.ingreso_equilibrio_dia_abierto != null) {
    const objetivo = equilibrio.ingreso_equilibrio_dia_abierto;
    rentabilidad = {
      disponible: true,
      ingreso_equilibrio_dia: objetivo,
      ratio_contribucion_pct: equilibrio.ratio_contribucion_pct,
      base_fija_diaria: equilibrio.base_fija_diaria,
      cubierto: hoy.total >= objetivo,
      diferencia_eur: eur(hoy.total - objetivo),
      cobertura_pct: objetivo > 0 ? Math.round((hoy.total / objetivo) * 100) : null,
    };
  } else {
    rentabilidad = { disponible: false, motivo: "Falta el punto de equilibrio (carta con coste, costes fijos y sueldos)." };
  }

  return {
    fecha: dia,
    dia_semana: nombreDia(dia),
    generado_en: new Date().toISOString(),
    ventas: hoy,
    comparativa,
    compras,
    rentabilidad,
    alertas: alertasDia(hoy, comparativa, compras, rentabilidad),
  };
}

// ── ALERTAS DEL DÍA (solo si hay señal real) ────────────────────────────────
function alertasDia(v, comp, compras, rent) {
  const out = [];
  if (v.total === 0 && v.lineas === 0) {
    out.push({ severidad: "info", titulo: "Sin ventas registradas este día", detalle: "No hay líneas de Ágora para esta fecha. Puede ser un día cerrado o que el conector aún no haya sincronizado." });
    return out;
  }
  // Rentabilidad: por debajo del equilibrio.
  if (rent && rent.disponible && !rent.cubierto) {
    out.push({ severidad: "critico", titulo: `El día NO cubrió el punto de equilibrio`, detalle: `Vendiste ${v.total} € y necesitabas ${rent.ingreso_equilibrio_dia} € para no perder (${rent.cobertura_pct}%). Faltaron ${eur(-rent.diferencia_eur)} €.` });
  } else if (rent && rent.disponible && rent.cubierto) {
    out.push({ severidad: "ok", titulo: `Día por encima del equilibrio`, detalle: `${v.total} € vendidos, ${rent.diferencia_eur} € por encima del mínimo para no perder.` });
  }
  // Cobertura de coste (cuánta venta no podemos evaluar en margen).
  if (v.cobertura_coste_pct != null && v.cobertura_coste_pct < 60 && v.importe_sin_coste > 0) {
    out.push({ severidad: "importante", titulo: `El ${100 - v.cobertura_coste_pct}% de la venta no tiene coste cargado`, detalle: `${v.importe_sin_coste} € vendidos en productos sin escandallo/coste real → su margen no se puede calcular. Carga su coste para ver el beneficio real.` });
  }
  // Caída fuerte respecto a la semana pasada (mismo día).
  const s = comp.vs_semana_pasada;
  if (s.total != null && s.total <= -20) {
    out.push({ severidad: "importante", titulo: `Ventas ${Math.abs(s.total)}% por debajo del mismo día de la semana pasada`, detalle: `${v.total} € hoy frente a ${s.total_ref} € el ${s.dia_semana} pasado. Mira qué cambió.` });
  } else if (s.total != null && s.total >= 25) {
    out.push({ severidad: "ok", titulo: `Ventas ${s.total}% por encima del mismo día de la semana pasada`, detalle: `${v.total} € hoy frente a ${s.total_ref} € el ${s.dia_semana} pasado.` });
  }
  // Producto estrella del día.
  if (v.top_por_importe.length) {
    const e = v.top_por_importe[0];
    out.push({ severidad: "info", titulo: `Producto estrella: ${e.producto}`, detalle: `${e.importe} € (${e.unidades} uds), el ${v.total > 0 ? Math.round((e.importe / v.total) * 100) : 0}% de la venta del día.` });
  }
  // Margen bajo con volumen.
  const flojo = v.menor_margen.find((x) => x.margen_pct != null && x.margen_pct < 50 && x.importe >= 5);
  if (flojo) {
    out.push({ severidad: "importante", titulo: `${flojo.producto} deja poco margen`, detalle: `${flojo.margen_pct}% de margen (${flojo.importe} € vendidos hoy). Revisa su precio o su coste.` });
  }
  // Compra fuerte del día.
  if (compras.total > 0) {
    out.push({ severidad: "info", titulo: `Compras del día: ${compras.total} €`, detalle: `${compras.recepciones} albarán(es)${compras.por_proveedor[0] ? `, el mayor de ${compras.por_proveedor[0].proveedor} (${compras.por_proveedor[0].importe} €)` : ""}.` });
  }
  // Cambios de precio de proveedor.
  if (compras.cambios_precio.length) {
    const c = compras.cambios_precio[0];
    out.push({ severidad: c.variacion_pct > 0 ? "importante" : "ok", titulo: `${c.producto} ${c.variacion_pct > 0 ? "subió" : "bajó"} un ${Math.abs(c.variacion_pct)}%`, detalle: `De ${c.precio_anterior} € a ${c.precio_nuevo} €${c.proveedor ? ` (${c.proveedor})` : ""}.${compras.cambios_precio.length > 1 ? ` Y ${compras.cambios_precio.length - 1} cambio(s) más.` : ""}` });
  }
  const orden = { critico: 0, importante: 1, ok: 2, info: 3 };
  return out.sort((a, b) => (orden[a.severidad] ?? 4) - (orden[b.severidad] ?? 4));
}

// ── ANALIZAR (lee del store + equilibrio en vivo) ───────────────────────────
function analizar(fecha) {
  const dia = ymd(fecha) || ymd(new Date());
  let equilibrio = null;
  try { equilibrio = require("./break-even").puntoEquilibrio(); } catch (e) { equilibrio = null; }
  return computar({
    ventas: store.readAll("ventas"),
    productos: store.readAll("productos"),
    materias: store.readAll("materias"),
    recepciones: store.readAll("recepciones"),
    proveedores: store.readAll("proveedores"),
    compras_productos: store.readAll("compras_productos"),
    precios_historico: store.readAll("precios_historico"),
    equilibrio,
  }, dia);
}

module.exports = { analizar, computar, ventaDia, compraDia, restarDias, nombreDia };
