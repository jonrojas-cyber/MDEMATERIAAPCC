// DOSSIER PARA ASESORÍA · reúne TODO lo que el sistema sabe del negocio en un solo
// documento (JSON + Markdown) listo para pegar en Claude y pedir asesoramiento.
//
// Fuente ÚNICA del dinero: costing (escandallo/margen por producto), break-even
// (contribución + punto de equilibrio), fixed-costs (costes fijos), debts (créditos).
// Este módulo solo LEE y COMPONE lo que ya hay en producción — incluidos LOS
// ESCANDALLOS REALES cargados por la dueña — nunca inventa un coste.
//
// `computar(datos)` es puro (inyectable para tests). `generar(opts)` lee el store
// y los motores en vivo y compone el dossier + su Markdown.

const store = require("./data-store");
const costing = require("./costing");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function ymd(f) { return String(f || "").slice(0, 10); }
function pct(n) { return n == null ? null : Math.round(n * 1000) / 10; }

// Agrega las ventas del rango por producto, cruzando con el coste real (costing).
function agregarVentas(ventas, prodById, prodByName, idxMat, desde, hasta) {
  const d0 = ymd(desde), d1 = ymd(hasta);
  let importe = 0, unidades = 0, coste = 0, importeConCoste = 0;
  const tickets = new Set();
  const porProducto = {}, porCategoria = {};
  ventas.forEach((v) => {
    if (v.fuente && v.fuente !== "agora") return;
    const f = ymd(v.fecha);
    if (f < d0 || f > d1) return;
    const cant = Number(v.cantidad) || 0, imp = Number(v.importe) || 0;
    const p = prodById[v.producto_id] || prodByName[String(v.producto || "").toLowerCase()];
    const cu = p ? costing.costeProducto(p, idxMat) : 0;
    importe += imp; unidades += cant;
    if (v.doc_clave) tickets.add(v.doc_clave);
    const cat = (p && p.categoria) || "otros";
    if (!porCategoria[cat]) porCategoria[cat] = { categoria: cat, importe: 0, unidades: 0 };
    porCategoria[cat].importe += imp; porCategoria[cat].unidades += cant;
    const key = v.producto || (p && p.nombre) || v.producto_id || "—";
    if (!porProducto[key]) porProducto[key] = { producto: key, categoria: cat, unidades: 0, importe: 0, coste: 0, coste_conocido: cu > 0 };
    porProducto[key].unidades += cant; porProducto[key].importe += imp; porProducto[key].coste += cu * cant;
    if (cu > 0) { porProducto[key].coste_conocido = true; coste += cu * cant; importeConCoste += imp; }
  });
  const nT = tickets.size || 0;
  const prod = Object.values(porProducto).map((x) => ({
    producto: x.producto, categoria: x.categoria,
    unidades: Math.round(x.unidades * 10) / 10, importe: eur(x.importe),
    coste: x.coste_conocido ? eur(x.coste) : null,
    beneficio: x.coste_conocido ? eur(x.importe - x.coste) : null,
    margen_pct: x.coste_conocido && x.importe > 0 ? Math.round((1 - x.coste / x.importe) * 100) : null,
  })).sort((a, b) => b.importe - a.importe);
  return {
    total: eur(importe), tickets: nT, ticket_medio: nT ? eur(importe / nT) : 0,
    unidades: Math.round(unidades * 10) / 10,
    coste_materia: eur(coste), margen_eur: eur(importeConCoste - coste),
    margen_pct: importeConCoste > 0 ? Math.round((1 - coste / importeConCoste) * 100) : null,
    cobertura_coste_pct: importe > 0 ? Math.round((importeConCoste / importe) * 100) : null,
    por_producto: prod,
    por_categoria: Object.values(porCategoria).map((c) => ({ categoria: c.categoria, importe: eur(c.importe), unidades: Math.round(c.unidades * 10) / 10, pct: importe > 0 ? Math.round((c.importe / importe) * 100) : 0 })).sort((a, b) => b.importe - a.importe),
  };
}

// La carta completa con su escandallo (coste/margen/food cost por producto).
function cartaEscandallo(productos, idxMat) {
  return productos.filter((p) => p.activo !== false && Number(p.precio_venta) > 0).map((p) => {
    const m = costing.margenProducto(p, idxMat);
    return {
      producto: p.nombre, categoria: p.categoria || "otros",
      pvp: m.precio, coste: m.coste, coste_neto: m.coste_neto,
      margen_eur: m.margen_euros, margen_pct: Math.round(m.margen_bruto * 100),
      food_cost_pct: Math.round(m.food_cost * 100),
      tiene_coste: m.coste_neto > 0,
    };
  }).sort((a, b) => a.categoria.localeCompare(b.categoria) || b.pvp - a.pvp);
}

// ── COMPUTAR (puro) ─────────────────────────────────────────────────────────
function computar(datos) {
  const {
    productos = [], materias = [], ventas = [], recepciones = [], proveedores = [],
    desde, hasta, contribucion = null, equilibrio = null,
    fijos = null, fijosPorCat = [], creditos = null, negocio = {},
    comprasAgg = null,
  } = datos;

  const idxMat = costing.indiceMaterias(materias);
  const prodById = {}; productos.forEach((p) => (prodById[p.id] = p));
  const prodByName = {}; productos.forEach((p) => { if (p.nombre) prodByName[p.nombre.toLowerCase()] = p; });

  const vsel = agregarVentas(ventas, prodById, prodByName, idxMat, desde, hasta);
  const carta = cartaEscandallo(productos, idxMat);
  const sinCoste = carta.filter((c) => !c.tiene_coste).map((c) => c.producto);

  return {
    generado_en: new Date().toISOString(),
    negocio,
    rango: { desde: ymd(desde), hasta: ymd(hasta) },
    ventas: vsel,
    carta_escandallo: carta,
    productos_sin_coste: sinCoste,
    contribucion, equilibrio,
    costes_fijos: fijos ? { total_mes: fijos.mensual, total_dia: fijos.diario, por_categoria: fijosPorCat } : null,
    creditos: creditos ? { cuota_mes: creditos.cuota_mensual_total, pendiente_total: creditos.deuda_total, num: creditos.num_deudas } : null,
    compras: comprasAgg,
  };
}

// ── MARKDOWN ────────────────────────────────────────────────────────────────
const PROMPT = [
  "Actúa como asesor financiero y de operaciones especializado en hostelería de",
  "especialidad (café/matcha, local pequeño en Málaga). Te paso el dossier real de",
  "m de materia: escandallo (coste y margen por producto), ventas por producto y",
  "familia, punto de equilibrio, costes fijos y cuotas de préstamos. Asesórame sobre",
  "QUÉ LÍNEA SEGUIR:",
  "1. ¿Cubro fijos + cuotas de crédito con la venta actual? Punto de equilibrio y",
  "   margen de seguridad.",
  "2. Mix de producto: qué potenciar, reformular o retirar (volumen × margen).",
  "3. Ticket medio: cómo subirlo sin dañar la experiencia.",
  "4. Precios: productos infravalorados para su coste/posicionamiento.",
  "5. Plan concreto de 30/60/90 días.",
  "Sé directo y numérico. Si un dato falta, dilo y sigue con supuestos explícitos.",
].join("\n");

function tabla(headers, filas) {
  const h = "| " + headers.join(" | ") + " |";
  const sep = "|" + headers.map(() => "---").join("|") + "|";
  return [h, sep, ...filas.map((f) => "| " + f.join(" | ") + " |")].join("\n");
}
const e2 = (n) => (n == null ? "—" : Number(n).toFixed(2));
const p0 = (n) => (n == null ? "—" : Math.round(n) + "%");

function markdown(d) {
  const L = [];
  const w = (s = "") => L.push(s);
  w("# DOSSIER m de materia — para asesoría con Claude");
  w("");
  w(`> Generado por Control M el ${ymd(d.generado_en)} con datos reales del sistema (escandallos, ventas, costes fijos y créditos). No hay ningún número inventado.`);
  w("");
  w("---");
  w("## 0) PROMPT — pega esto y debajo el resto del documento");
  w("");
  w("```"); w(PROMPT); w("```");
  w("");
  w("---");
  w(`## 1) VENTAS (${d.rango.desde} → ${d.rango.hasta})`);
  const v = d.ventas;
  w("");
  w(`- Facturación: **${e2(v.total)} €** · Tickets: **${v.tickets}** · Ticket medio: **${e2(v.ticket_medio)} €** · Unidades: **${v.unidades}**`);
  if (v.margen_pct != null) w(`- Margen sobre la venta con coste cargado: **${p0(v.margen_pct)}** (coste materia ${e2(v.coste_materia)} €, cobertura ${p0(v.cobertura_coste_pct)} de la venta)`);
  w("");
  w("**Por familia:**");
  w("");
  w(tabla(["Familia", "Importe €", "%", "Uds"], v.por_categoria.map((c) => [c.categoria, e2(c.importe), c.pct + "%", String(c.unidades)])));
  w("");
  w("**Por producto (con beneficio real donde hay escandallo):**");
  w("");
  w(tabla(["Producto", "Fam", "Uds", "Venta €", "Coste €", "Beneficio €", "Margen %"],
    v.por_producto.map((p) => [p.producto, p.categoria, String(p.unidades), e2(p.importe), e2(p.coste), e2(p.beneficio), p0(p.margen_pct)])));
  w("");
  w("## 2) ESCANDALLO — carta completa (coste, margen y food cost por producto)");
  w("");
  w(tabla(["Producto", "Fam", "PVP €", "Coste €", "Margen €", "Margen %", "Food cost %"],
    d.carta_escandallo.map((c) => [c.producto, c.categoria, e2(c.pvp), c.tiene_coste ? e2(c.coste) : "pend.", c.tiene_coste ? e2(c.margen_eur) : "pend.", c.tiene_coste ? p0(c.margen_pct) : "pend.", c.tiene_coste ? p0(c.food_cost_pct) : "pend."])));
  if (d.productos_sin_coste.length) {
    w("");
    w(`> Sin escandallo cargado (${d.productos_sin_coste.length}): ${d.productos_sin_coste.join(", ")}.`);
  }
  if (d.contribucion) {
    w("");
    w("## 3) CONTRIBUCIÓN Y FOOD COST MEDIO");
    w("");
    w(`- Margen de contribución medio de la carta: **${d.contribucion.ratio_contribucion_pct}%**`);
    w(`- Food cost medio: **${d.contribucion.food_cost_medio_pct != null ? Math.round(d.contribucion.food_cost_medio_pct * 100) + "%" : "—"}**`);
    if (d.contribucion.por_categoria) {
      w("");
      w(tabla(["Categoría", "Productos", "Contribución media %"], d.contribucion.por_categoria.map((c) => [c.categoria, String(c.productos), Math.round(c.contribucion_media_pct * 100) + "%"])));
    }
  }
  if (d.equilibrio && d.equilibrio.disponible) {
    const q = d.equilibrio;
    w("");
    w("## 4) PUNTO DE EQUILIBRIO (real, en vivo)");
    w("");
    w(`- Base fija diaria: **${e2(q.base_fija_diaria)} €** · Ratio contribución: **${q.ratio_contribucion_pct}%**`);
    w(`- Venta de equilibrio por día abierto: **${e2(q.ingreso_equilibrio_dia_abierto)} €**`);
    w(`- Venta de equilibrio al mes: **${e2(q.ingreso_equilibrio_mes)} €**`);
    w(`- Con créditos incluidos: **${e2(q.ingreso_equilibrio_con_creditos_mes)} €/mes**`);
    if (q.margen_seguridad_pct != null) w(`- Margen de seguridad actual: **${q.margen_seguridad_pct}%** ${q.en_perdidas ? "(⚠️ EN PÉRDIDAS)" : ""}`);
  }
  if (d.costes_fijos) {
    w("");
    w("## 5) COSTES FIJOS");
    w("");
    w(`- Total: **${e2(d.costes_fijos.total_mes)} €/mes** (${e2(d.costes_fijos.total_dia)} €/día)`);
    if (d.costes_fijos.por_categoria && d.costes_fijos.por_categoria.length) {
      w("");
      w(tabla(["Categoría", "€/mes"], d.costes_fijos.por_categoria.map((c) => [c.label, e2(c.value)])));
    }
  }
  if (d.creditos) {
    w("");
    w("## 6) CRÉDITOS");
    w("");
    w(`- Cuota total: **${e2(d.creditos.cuota_mes) } €/mes** · Pendiente: **${e2(d.creditos.pendiente_total)} €** · Préstamos activos: ${d.creditos.num}`);
  }
  if (d.compras && d.compras.recepciones) {
    w("");
    w(`## 7) COMPRAS (${d.rango.desde} → ${d.rango.hasta})`);
    w("");
    w(`- Albaranes: ${d.compras.recepciones} · Total: **${e2(d.compras.gran_total)} €**`);
    if (d.compras.por_proveedor && d.compras.por_proveedor.length) {
      w("");
      w(tabla(["Proveedor", "Importe €"], d.compras.por_proveedor.slice(0, 15).map((x) => [x.proveedor, e2(x.importe)])));
    }
  }
  w("");
  w("---");
  w(`*Fuente: Control M (escandallos, costes fijos, créditos) + ventas de Ágora. Lo no cargado se marca 'pend.', nunca se inventa.*`);
  return L.join("\n");
}

// ── GENERAR (lee store + motores en vivo) ───────────────────────────────────
function generar(opts = {}) {
  const dias = Number(opts.dias) > 0 ? Number(opts.dias) : 90;
  const hasta = opts.hasta ? new Date(opts.hasta) : new Date();
  const desde = opts.desde ? new Date(opts.desde) : new Date(hasta.getTime() - dias * 86400000);

  let contribucion = null, equilibrio = null, fijos = null, fijosPorCat = [], creditos = null, comprasAgg = null;
  try { contribucion = require("./break-even").contribucion(); } catch (e) {}
  try { equilibrio = require("./break-even").puntoEquilibrio(); } catch (e) {}
  try { fijos = require("./fixed-costs").totales(); fijosPorCat = require("./fixed-costs").porCategoria(); } catch (e) {}
  try { creditos = require("./debts").resumen(); } catch (e) {}
  try {
    comprasAgg = require("./routes/compras-informe").agregar({
      recepciones: store.readAll("recepciones"), materias: store.readAll("materias"), proveedores: store.readAll("proveedores"),
    }, { desde: ymd(desde), hasta: ymd(hasta) });
  } catch (e) {}

  const cfg = (store.readAll("config") || []).find((c) => c && c.id === "negocio");
  const negocio = { nombre: "m de materia", concepto: "Café de especialidad y matcha · El Palo / Pedregalejo, Málaga", ...(cfg && cfg.valor ? cfg.valor : {}) };

  const dossier = computar({
    productos: store.readAll("productos"), materias: store.readAll("materias"),
    ventas: store.readAll("ventas"), recepciones: store.readAll("recepciones"), proveedores: store.readAll("proveedores"),
    desde, hasta, contribucion, equilibrio, fijos, fijosPorCat, creditos, negocio, comprasAgg,
  });
  return { dossier, markdown: markdown(dossier) };
}

module.exports = { computar, markdown, generar, agregarVentas, cartaEscandallo };
