// INGESTA DE FACTURAS POR CORREO
// ─────────────────────────────────────────────────────────────────────────────
// La fundadora reenvía (automáticamente, con un filtro) las facturas de sus
// proveedores a un buzón del sistema. Un servicio de correo entrante reenvía ese
// email a /facturas/ingesta (webhook, con token). Aquí:
//   1) se normaliza el payload (formato propio o de Resend Inbound),
//   2) por cada adjunto PDF/imagen se LEE con el MISMO OCR que el escaneo de
//      albaranes (ocr.extraerDesdeAdjunto → mismos campos),
//   3) se empareja/da de alta el proveedor (misma lógica que el albarán),
//   4) se crea una RECEPCIÓN "Pendiente de confirmar" con origen "email".
//
// Fuente única: las facturas del correo caen en la MISMA entidad `recepciones`
// que las escaneadas, así que aparecen en Compras para que Mónica las valide y
// el dinero se deriva de un solo sitio. Nada se paga ni se da de alta solo.

const storeDefault = require("./data-store");
const intake = require("./albaran-intake");

// Tipos de adjunto que tratamos como documento (factura/albarán).
const RE_DOC_MIME = /pdf|image\/(jpeg|jpg|png|webp|heic|heif|gif|tiff)/i;
const RE_DOC_EXT = /\.(pdf|jpe?g|png|webp|heic|heif|gif|tif|tiff)$/i;

function b64Limpio(s) { return String(s == null ? "" : s).replace(/^data:[^,]+,/, "").replace(/\s+/g, ""); }

// Normaliza el cuerpo del webhook a { from, subject, attachments:[{filename, mediaType, base64}] }.
// Admite un formato propio (lo que mande Zapier/Make) y el de Resend Inbound.
function normalizarPayload(body) {
  const b = body || {};
  // Algunos proveedores envuelven en { type, data: {...} }.
  const d = (b.data && (b.data.from || b.data.attachments || b.data.subject)) ? b.data : b;
  const from = d.from || d.sender || d.From || d.remitente || "";
  const subject = d.subject || d.Subject || d.asunto || "";
  const raw = d.attachments || d.Attachments || d.adjuntos || [];
  const attachments = (Array.isArray(raw) ? raw : []).map((a) => {
    a = a || {};
    const filename = a.filename || a.name || a.fileName || a.nombre || "";
    const mediaType = a.content_type || a.contentType || a.type || a.mime || a.mimeType || "";
    let base64 = a.content || a.content_b64 || a.base64 || a.data || "";
    // Buffer serializado { type:"Buffer", data:[...] }.
    if (base64 && typeof base64 === "object" && Array.isArray(base64.data)) base64 = Buffer.from(base64.data).toString("base64");
    return { filename: String(filename || ""), mediaType: String(mediaType || ""), base64: b64Limpio(base64) };
  }).filter((a) => a.base64);
  return { from: String(from || ""), subject: String(subject || ""), attachments };
}

function esDocumento(att) {
  if (RE_DOC_MIME.test(String(att.mediaType || ""))) return true;
  return RE_DOC_EXT.test(att.filename || "");
}
function esPdf(att) {
  return String(att.mediaType || "").toLowerCase().includes("pdf") || /\.pdf$/i.test(att.filename || "");
}

// ¿Ya tenemos esta factura? Por proveedor + nº de documento; si no hay número,
// por proveedor + importe + día de la factura (evita duplicar reenvíos del mismo
// correo). Así un reenvío repetido no crea dos recepciones.
function yaExiste(store, { proveedor_id, numero_documento, importe_total, fecha }) {
  const recs = store.readAll("recepciones") || [];
  const num = String(numero_documento || "").trim().toLowerCase();
  const dia = String(fecha || "").slice(0, 10);
  const prov = proveedor_id || null;
  return recs.some((r) => {
    const sameProv = (r.proveedor_id || null) === prov;
    if (num) return sameProv && String(r.numero_documento || "").trim().toLowerCase() === num;
    return sameProv && dia && String(r.fecha || "").slice(0, 10) === dia &&
      Number(importe_total) > 0 && Math.abs(Number(r.importe_total || 0) - Number(importe_total)) < 0.01;
  });
}

// Construye la recepción a partir de los datos leídos. Para las facturas del
// correo la FECHA es la de la factura (no la de recepción), que es lo que agrupa
// el archivo trimestral para la gestoría.
function construirRecepcion(store, datos, { documento, email }) {
  const tipoDoc = intake.clasificarTipoDocumento(datos);
  let importe = Number(datos.importe_total);
  if (!Number.isFinite(importe) || importe < 0) importe = 0;
  importe = Math.round(importe * 100) / 100;
  const fechaDoc = /^\d{4}-\d{2}-\d{2}/.test(String(datos.fecha || ""))
    ? new Date(String(datos.fecha).slice(0, 10) + "T12:00:00Z").toISOString()
    : new Date().toISOString();
  const lineas = (datos.lineas || []).map((l) => ({
    descripcion: String(l.descripcion || "").trim(),
    cantidad_albaran: Number(l.cantidad) || 0,
    unidad_detectada: l.unidad || null,
    cantidad: Number(l.cantidad) || 0,
    precio_unitario: Number(l.precio_unitario) || 0,
    importe: Number(l.importe) || 0,
    materia_id: null, // las facturas no dan de alta stock; Mónica valida en Compras
  }));
  return {
    id: store.nextId("rcp", "recepciones"),
    proveedor_id: null, // lo fija quien llama tras emparejar
    pedido_id: null,
    tipo_documento: tipoDoc,
    numero_documento: String(datos.numero_documento || "").trim(),
    fecha: fechaDoc,
    foto_albaran_url: documento && documento.esImagen ? documento.dataUri : null,
    documento_pdf_url: documento && !documento.esImagen ? documento.dataUri : null,
    lote_proveedor: "",
    caducidad: "",
    lineas,
    estado: "Pendiente de confirmar",
    importe_total: importe,
    pendiente_pago: importe,
    origen: "email",
    email_remitente: (email && email.from) || "",
    email_asunto: (email && email.subject) || "",
    recibido_en: new Date().toISOString(),
  };
}

// Procesa un correo reenviado. ocrFn se inyecta (async {base64,mediaType,filename}→datos)
// para poder probar sin llamar a la IA. Devuelve un resumen de lo ingerido.
async function ingestar(payload, opts = {}) {
  const store = opts.store || storeDefault;
  const ocrFn = opts.ocrFn;
  if (typeof ocrFn !== "function") throw new Error("ingestar necesita opts.ocrFn");

  const { from, subject, attachments } = normalizarPayload(payload);
  const docs = attachments.filter(esDocumento);
  const res = { recibidos: attachments.length, documentos: docs.length, creadas: 0, duplicadas: 0, errores: 0, detalles: [] };
  if (!docs.length) { res.detalles.push({ nota: "El correo no traía adjuntos PDF o imagen." }); return res; }

  const proveedores = store.readAll("proveedores") || [];
  let mutado = false;

  for (const att of docs) {
    try {
      const datos = await ocrFn({ base64: att.base64, mediaType: att.mediaType, filename: att.filename });
      if (!datos) throw new Error("lectura vacía");

      // Emparejar o dar de alta el proveedor (misma lógica que el albarán).
      let proveedor = intake.buscarProveedor(datos, proveedores);
      if (!proveedor && String(datos.proveedor || "").trim()) {
        proveedor = intake.construirProveedorDesdeOCR(datos, store.nextId("prov", "proveedores"));
        store.insert("proveedores", proveedor);
        // Mantener visible el alta para los siguientes adjuntos del mismo correo,
        // sin duplicar si readAll ya devolvió la misma referencia que muta insert.
        if (!proveedores.some((p) => p.id === proveedor.id)) proveedores.push(proveedor);
        mutado = true;
      }
      const provId = proveedor ? proveedor.id : null;
      const importe = Math.round((Number(datos.importe_total) || 0) * 100) / 100;

      if (yaExiste(store, { proveedor_id: provId, numero_documento: datos.numero_documento, importe_total: importe, fecha: datos.fecha })) {
        res.duplicadas++;
        res.detalles.push({ filename: att.filename, estado: "duplicada", proveedor: proveedor ? proveedor.nombre : (datos.proveedor || ""), numero: String(datos.numero_documento || "") });
        continue;
      }

      const pdf = esPdf(att);
      const dataUri = att.base64 ? `data:${att.mediaType || (pdf ? "application/pdf" : "image/jpeg")};base64,${att.base64}` : null;
      const rec = construirRecepcion(store, datos, { documento: { esImagen: !pdf, dataUri }, email: { from, subject } });
      rec.proveedor_id = provId;
      store.insert("recepciones", rec);
      mutado = true;
      res.creadas++;
      res.detalles.push({ filename: att.filename, estado: "creada", id: rec.id, tipo: rec.tipo_documento, proveedor: proveedor ? proveedor.nombre : (datos.proveedor || ""), numero: rec.numero_documento, importe: rec.importe_total });
    } catch (e) {
      res.errores++;
      res.detalles.push({ filename: att.filename, estado: "error", error: e.message || String(e) });
    }
  }

  if (mutado && typeof store.flush === "function") await store.flush();
  return res;
}

module.exports = { ingestar, normalizarPayload, esDocumento, esPdf, yaExiste, construirRecepcion };
