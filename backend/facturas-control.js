// IMPORTADOR DEL "CONTROL DE FACTURAS" (Excel)
// ─────────────────────────────────────────────────────────────────────────────
// Carga en bloque una hoja de control de facturas (la extracción del Gmail de
// facturación) como RECEPCIONES tipo "factura" en estado "Pendiente de confirmar"
// (origen "gmail_control"). Así las facturas del año entran en Compras, en el
// archivo trimestral y en los pendientes de pago, sin duplicar el dinero: viven
// en la MISMA entidad `recepciones` que las escaneadas o las del correo.
//
// La hoja de detalle tiene estas columnas (el orden se detecta por cabecera):
//   Fecha factura · Proveedor · N.º factura · Asunto del correo · Fecha correo ·
//   Moneda · Base imponible · IVA · Total · Archivo original
// Puede venir en la 2ª hoja (la 1ª suele ser un resumen): se busca la hoja cuya
// cabecera tenga Proveedor + Total + (N.º) factura.

const storeDefault = require("./data-store");
const intake = require("./albaran-intake");
const fe = require("./facturas-email");

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}
function num(x) {
  if (x == null || x === "") return 0;
  let s = String(x).trim().replace(/[€$\s]/g, "");
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.indexOf(",") > -1) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Resuelve el índice de cada columna a partir de la fila de cabecera.
function mapearColumnas(cab) {
  const h = (cab || []).map(norm);
  const find = (fn) => { const i = h.findIndex(fn); return i; };
  return {
    fecha: find((x) => x.includes("fecha") && x.includes("factura")),
    proveedor: find((x) => x.includes("proveedor")),
    numero: find((x) => (x.startsWith("n") && x.includes("factura")) || x === "nº factura" || x.includes("num") && x.includes("factura")),
    asunto: find((x) => x.includes("asunto")),
    fecha_correo: find((x) => x.includes("fecha") && x.includes("correo")),
    moneda: find((x) => x.includes("moneda")),
    base: find((x) => x.includes("base")),
    iva: find((x) => x === "iva" || x.includes("i.v.a")),
    total: find((x) => x === "total" || (x.includes("total") && !x.includes("usd") && !x.includes("eur"))),
    archivo: find((x) => x.includes("archivo")),
  };
}

// ¿Esta fila de cabecera corresponde a la hoja de DETALLE (una factura por fila)?
// Se exige una columna que solo tiene el detalle (Asunto del correo / Archivo
// original) para no confundirla con la tabla-resumen por proveedor, que también
// tiene "Proveedor" y "Total".
function esCabeceraDetalle(cab) {
  const h = (cab || []).map(norm).join(" | ");
  return h.includes("proveedor") && h.includes("factura") && (h.includes("asunto") || h.includes("archivo") || h.includes("base"));
}

// Dado un conjunto de hojas [{name, rows}], localiza la de detalle y devuelve
// { cols, filas } (filas sin la cabecera). Si recibe una sola matriz, la usa.
function localizarDetalle(hojas) {
  const lista = Array.isArray(hojas) && hojas[0] && hojas[0].rows ? hojas : [{ name: "hoja", rows: hojas }];
  for (const hoja of lista) {
    const rows = hoja.rows || [];
    const idx = rows.findIndex((r) => esCabeceraDetalle(r));
    if (idx !== -1) return { cols: mapearColumnas(rows[idx]), filas: rows.slice(idx + 1) };
  }
  throw new Error("No se encontró la hoja de detalle (cabecera con Proveedor, N.º factura y Total).");
}

// Convierte una fila en un registro de factura limpio.
function filaAFactura(c, cols) {
  const g = (k) => (cols[k] >= 0 ? c[cols[k]] : "");
  const fechaRaw = String(g("fecha") || "").trim();
  const fecha = (fechaRaw.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || "";
  return {
    fecha,
    proveedor: String(g("proveedor") || "").trim(),
    numero: String(g("numero") || "").trim(),
    asunto: String(g("asunto") || "").trim(),
    moneda: (String(g("moneda") || "EUR").trim().toUpperCase()) || "EUR",
    base: num(g("base")),
    iva: num(g("iva")),
    total: num(g("total")),
    archivo: String(g("archivo") || "").trim(),
  };
}

function parseFilas(hojas) {
  const { cols, filas } = localizarDetalle(hojas);
  return filas
    .map((c) => filaAFactura(c, cols))
    .filter((f) => f.proveedor && (f.total > 0 || f.numero)); // descarta filas vacías
}

// Importa las facturas del control al almacén. Reutiliza el emparejado de
// proveedor y el dedupe de la ingesta por correo (misma forma del dato).
function importar(hojas, opts = {}) {
  const store = opts.store || storeDefault;
  const facturas = parseFilas(hojas);
  const proveedores = store.readAll("proveedores") || [];
  const res = { leidas: facturas.length, creadas: 0, duplicadas: 0, sin_total: 0, no_eur: 0, total_eur: 0, por_proveedor: {} };
  let mutado = false;

  for (const f of facturas) {
    // Se admiten importes negativos: son rectificativas / abonos (reducen lo que
    // se debe). Solo se descarta la fila sin importe alguno.
    if (!(Math.abs(f.total) > 0)) { res.sin_total++; continue; }
    const datosProv = { proveedor: f.proveedor, proveedor_cif: "", proveedor_email: "", proveedor_telefono: "", proveedor_direccion: "" };
    let proveedor = intake.buscarProveedor(datosProv, proveedores);
    if (!proveedor) {
      proveedor = intake.construirProveedorDesdeOCR(datosProv, store.nextId("prov", "proveedores"));
      proveedor.notas = "Alta automática al importar el control de facturas.";
      proveedor.origen = "gmail_control";
      store.insert("proveedores", proveedor);
      if (!proveedores.some((p) => p.id === proveedor.id)) proveedores.push(proveedor);
      mutado = true;
    }
    const provId = proveedor.id;

    if (fe.yaExiste(store, { proveedor_id: provId, numero_documento: f.numero, importe_total: f.total, fecha: f.fecha })) {
      res.duplicadas++;
      continue;
    }

    // Construir la recepción con el mismo builder de la ingesta por correo.
    const datos = {
      tipo_documento: "factura",
      numero_documento: f.numero,
      proveedor: f.proveedor,
      fecha: f.fecha,
      importe_total: f.total,
      lineas: [],
    };
    const rec = fe.construirRecepcion(store, datos, { documento: null, email: { from: "", subject: f.asunto } });
    rec.proveedor_id = provId;
    rec.origen = "gmail_control";
    rec.moneda = f.moneda;
    // construirRecepcion recorta importes negativos a 0 (protección del OCR); en
    // el control sí queremos conservar el abono, así que lo fijamos aquí.
    const importe = Math.round(f.total * 100) / 100;
    rec.importe_total = importe;
    rec.pendiente_pago = importe;
    if (importe < 0) rec.rectificativa = true;
    if (f.base) rec.base_imponible = f.base;
    if (f.iva) rec.iva = f.iva;
    if (f.archivo) rec.archivo_original = f.archivo;
    store.insert("recepciones", rec);
    mutado = true;
    res.creadas++;
    if (f.moneda !== "EUR") res.no_eur++; else res.total_eur = Math.round((res.total_eur + f.total) * 100) / 100;
    res.por_proveedor[f.proveedor] = (res.por_proveedor[f.proveedor] || 0) + 1;
  }

  res._mutado = mutado;
  return { store, res };
}

module.exports = { parseFilas, importar, localizarDetalle, mapearColumnas, esCabeceraDetalle };
