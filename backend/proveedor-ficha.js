// FICHA DE PROVEEDOR (estilo Gstock)
// ─────────────────────────────────────────────────────────────────────────────
// Reúne, para un proveedor, lo que de verdad importa de un vistazo:
//   · sus ARTÍCULOS de compra con la tarifa (precio con IVA, unitario, estado),
//   · las FACTURAS/ALBARANES cargados en un MES, con su total y lo pendiente.
// Lee de las entidades existentes (proveedores, compras_productos, recepciones):
// no duplica datos ni cálculos (el precio sale de compras-productos-calc, única
// fuente del precio de compra).

const { calcular, evaluarEstado } = require("./compras-productos-calc");

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function mesDe(fecha) { return String(fecha || "").slice(0, 7); }

// Vista ligera del artículo para la ficha (sin la foto en base64).
function articuloSlim(p) {
  const { foto_url, ...resto } = evaluarEstado(calcular(p));
  return { ...resto, tiene_foto: !!foto_url };
}

// Vista ligera de la factura/albarán (sin fotos ni PDF pesados).
function facturaSlim(r) {
  return {
    id: r.id,
    tipo_documento: r.tipo_documento || "albaran",
    numero_documento: r.numero_documento || "",
    fecha: r.fecha,
    importe_total: r2(r.importe_total),
    pendiente_pago: r2(r.pendiente_pago != null ? r.pendiente_pago : r.importe_total),
    estado: r.estado || "",
    moneda: r.moneda || "EUR",
    origen: r.origen || "",
    rectificativa: !!r.rectificativa,
    tiene_documento_pdf: !!r.documento_pdf_url,
    tiene_foto: !!r.foto_albaran_url,
  };
}

// Devuelve la ficha del proveedor. `mes` en formato YYYY-MM (por defecto, el mes
// con facturas más reciente del proveedor, o el mes actual si no hay ninguna).
function ficha(store, id, mes, hoyISO) {
  const proveedor = store.findById("proveedores", id);
  if (!proveedor) return null;

  const articulos = (store.readAll("compras_productos") || [])
    .filter((p) => p.proveedor_id === id)
    .map(articuloSlim)
    .sort((a, b) => (a.pendiente ? 0 : 1) - (b.pendiente ? 0 : 1) || String(a.nombre || "").localeCompare(String(b.nombre || "")));

  const todas = (store.readAll("recepciones") || []).filter((r) => r.proveedor_id === id);

  // Meses con documentos (para el navegador de meses de la ficha).
  const meses = Array.from(new Set(todas.map((r) => mesDe(r.fecha)).filter(Boolean))).sort().reverse();
  const mesSel = /^\d{4}-\d{2}$/.test(mes || "") ? mes : (meses[0] || String(hoyISO || new Date().toISOString()).slice(0, 7));

  const delMes = todas.filter((r) => mesDe(r.fecha) === mesSel)
    .map(facturaSlim)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  // Totales del mes (solo EUR; otras monedas se cuentan aparte para no mezclar).
  const eur = delMes.filter((f) => f.moneda === "EUR");
  const resumen = {
    mes: mesSel,
    n_documentos: delMes.length,
    n_facturas: delMes.filter((f) => f.tipo_documento === "factura").length,
    n_albaranes: delMes.filter((f) => f.tipo_documento !== "factura").length,
    total_mes: r2(eur.reduce((s, f) => s + f.importe_total, 0)),
    pendiente_mes: r2(eur.reduce((s, f) => s + (f.pendiente_pago > 0 ? f.pendiente_pago : 0), 0)),
    otras_monedas: delMes.filter((f) => f.moneda !== "EUR").length,
  };

  // Resumen del AÑO del mes seleccionado + pendiente de pago TOTAL (todo el
  // histórico): es el saldo que de verdad se le debe al proveedor.
  const anio = mesSel.slice(0, 4);
  const delAnio = todas.filter((r) => mesDe(r.fecha).slice(0, 4) === anio && (r.moneda || "EUR") === "EUR");
  const resumen_anio = {
    anio,
    n_documentos: todas.filter((r) => mesDe(r.fecha).slice(0, 4) === anio).length,
    total_anio: r2(delAnio.reduce((s, r) => s + (Number(r.importe_total) || 0), 0)),
  };
  const pendiente_total = r2(todas
    .filter((r) => (r.moneda || "EUR") === "EUR")
    .reduce((s, r) => { const p = Number(r.pendiente_pago != null ? r.pendiente_pago : r.importe_total) || 0; return s + (p > 0 ? p : 0); }, 0));

  return {
    proveedor: { id: proveedor.id, nombre: proveedor.nombre, estado: proveedor.estado || "Activo", categoria: proveedor.categoria || "", contacto: proveedor.contacto || "", telefono: proveedor.telefono || proveedor.whatsapp || "", cif: proveedor.cif || "" },
    meses, mes: mesSel,
    n_articulos: articulos.length,
    n_articulos_pendientes: articulos.filter((a) => a.pendiente).length,
    articulos,
    facturas: delMes,
    resumen,
    resumen_anio,
    pendiente_total,
  };
}

// Agregados por proveedor para la LISTA (admin): nº de artículos, documentos y
// gasto del año, y pendiente de pago total. Lee las entidades una vez y agrupa.
function resumenProveedores(store, anio) {
  const an = /^\d{4}$/.test(String(anio || "")) ? String(anio) : new Date().toISOString().slice(0, 4);
  const arts = store.readAll("compras_productos") || [];
  const recs = store.readAll("recepciones") || [];
  const out = {};
  const get = (id) => (out[id] || (out[id] = { n_articulos: 0, n_articulos_pendientes: 0, n_documentos_anio: 0, gasto_anio: 0, pendiente_total: 0 }));
  arts.forEach((a) => { if (!a.proveedor_id) return; const o = get(a.proveedor_id); o.n_articulos++; if (evaluarEstado(a).pendiente) o.n_articulos_pendientes++; });
  recs.forEach((r) => {
    if (!r.proveedor_id) return; const o = get(r.proveedor_id);
    const eur = (r.moneda || "EUR") === "EUR";
    if (mesDe(r.fecha).slice(0, 4) === an) { o.n_documentos_anio++; if (eur) o.gasto_anio += Number(r.importe_total) || 0; }
    if (eur) { const p = Number(r.pendiente_pago != null ? r.pendiente_pago : r.importe_total) || 0; if (p > 0) o.pendiente_total += p; }
  });
  Object.values(out).forEach((o) => { o.gasto_anio = r2(o.gasto_anio); o.pendiente_total = r2(o.pendiente_total); });
  return { anio: an, porProveedor: out };
}

module.exports = { ficha, resumenProveedores, articuloSlim, facturaSlim };
