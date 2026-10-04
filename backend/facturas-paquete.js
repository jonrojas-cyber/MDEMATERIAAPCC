// IMPORTADOR DEL PAQUETE DE FACTURAS (ZIP con PDFs + facturas.json canónico)
// ─────────────────────────────────────────────────────────────────────────────
// Carga el paquete "Export Control M · facturas" (data/facturas.json + los PDF
// originales en documentos/ + manifest con sha256). Crea una RECEPCIÓN tipo
// "factura" "Pendiente de confirmar" por registro, con el PDF adjunto, y de forma
// IDEMPOTENTE: deduplica por sha256 y luego por proveedor + nº de factura.
//
// Reglas (del contrato del paquete y de las reglas de negocio de Control M):
//   · No mueve stock, no marca pagado (payment_status "unknown" se respeta).
//   · Conserva el PDF original vinculado al registro; nunca lo altera.
//   · Si la factura YA existe (p. ej. importada antes desde el Excel) y no tenía
//     PDF, se le ADJUNTA el PDF y el sha (se cuenta como "actualizada"); si ya
//     tenía documento, se deja como "duplicada".
//   · dry-run: no escribe nada, solo devuelve el plan (por defecto del manifest).
//
// Vive en la MISMA entidad `recepciones` que el escaneo, el correo y el Excel:
// una sola fuente del dinero.

const crypto = require("crypto");
const storeDefault = require("./data-store");
const intake = require("./albaran-intake");
const fe = require("./facturas-email");
const { unzip } = require("./xlsx-lite");

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function norm(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\\/g, "/").replace(/\s+/g, " ").trim();
}

// Localiza el PDF dentro del ZIP a partir de la "Ruta organizada" del Excel
// (p. ej. "Panamar_Bakery_Group/2026-10-02_..._Factura.PDF"), que es el SUFIJO
// de la ruta real del fichero. Si no casa por sufijo, cae al nombre de archivo
// solo cuando es inequívoco (un único PDF con ese nombre). Devuelve la clave
// real del ZIP (con su prefijo de carpeta) o "".
function localizarPdf(pdfKeys, ruta, archivo) {
  const r = norm(ruta);
  if (r) {
    const hit = pdfKeys.find((k) => norm(k).endsWith(r));
    if (hit) return hit;
  }
  const base = norm(archivo).split("/").pop();
  if (base) {
    const cands = pdfKeys.filter((k) => norm(k).split("/").pop() === base);
    if (cands.length === 1) return cands[0];
  }
  return "";
}

// Abre el ZIP y devuelve { files, prefix, records }. Admite DOS formatos:
//   1) Paquete canónico: data/facturas.json + PDFs en documentos/ (records del JSON).
//   2) Paquete de gestoría: Control_facturas_*.xlsx + PDFs organizados por
//      proveedor (ENTREGA_GESTORIA/...). Los registros se arman desde la hoja de
//      detalle del Excel y cada PDF se localiza por su "Ruta organizada". Así el
//      MISMO importador (y la lectura automática de PDFs) sirve para ambos.
function leerPaquete(zipBuf) {
  const files = unzip(Buffer.isBuffer(zipBuf) ? zipBuf : Buffer.from(zipBuf));
  const fjName = Object.keys(files).find((n) => /(^|\/)data\/facturas\.json$/.test(n));
  if (fjName) {
    const prefix = fjName.replace(/data\/facturas\.json$/, "");
    const fj = JSON.parse(files[fjName].toString("utf8"));
    const records = Array.isArray(fj) ? fj : (fj.records || fj.facturas || []);
    if (!records.length) throw new Error("El paquete no trae registros de factura.");
    return { files, prefix, records, formato: "json" };
  }

  // Formato gestoría: localizar el Excel de control y armar los registros.
  const xlsxName = Object.keys(files).find((n) => /\.xlsx$/i.test(n) && !/^__MACOSX/.test(n) && !/(^|\/)~\$/.test(n));
  if (!xlsxName) throw new Error("El paquete no contiene data/facturas.json ni un Excel de control de facturas.");
  const hojas = require("./xlsx-lite").readXlsxSheets(files[xlsxName]);
  const filas = require("./facturas-control").parseFilas(hojas);
  if (!filas.length) throw new Error("El Excel de control del paquete no trae facturas.");
  const pdfKeys = Object.keys(files).filter((n) => /\.pdf$/i.test(n) && !/^__MACOSX/.test(n));
  const records = filas.map((f) => ({
    supplier_name: f.proveedor,
    invoice_number: f.numero,
    currency: f.moneda || "EUR",
    total_amount: f.total,
    taxable_base: f.base || null,
    vat_amount: f.iva || null,
    invoice_date: f.fecha || "",
    original_filename: f.archivo || "",
    email_subject: f.asunto || "",
    document_path: localizarPdf(pdfKeys, f.ruta, f.archivo), // clave real dentro del ZIP (prefix = "")
    payment_status: "unknown",
    requires_review: true,
  }));
  return { files, prefix: "", records, formato: "gestoria" };
}

function dataUriPdf(buf) { return "data:application/pdf;base64," + buf.toString("base64"); }

// Importa (o simula con dryRun) el paquete.
function importar(zipBuf, opts = {}) {
  const store = opts.store || storeDefault;
  const dryRun = !!opts.dryRun;
  const { files, prefix, records, formato } = leerPaquete(zipBuf);
  const proveedores = store.readAll("proveedores") || [];

  const rep = {
    modo: dryRun ? "dry-run" : "importar", formato: formato || "json",
    leidas: records.length, importadas: 0, actualizadas: 0, duplicadas: 0, errores: 0, sin_pdf: 0,
    por_moneda: {}, por_estado: {}, detalles: [],
  };
  const marca = (e) => { rep.por_estado[e] = (rep.por_estado[e] || 0) + 1; };
  let mutado = false;

  // Overlay para que el dry-run deduplique también dentro del propio paquete.
  const shaVistos = new Set();
  const provNuevos = new Map(); // nombre normalizado → id simulado/real

  for (const rec of records) {
    const detalle = { import_id: rec.import_id, proveedor: rec.supplier_name, numero: rec.invoice_number };
    try {
      const supplier = String(rec.supplier_name || "").trim();
      const numero = String(rec.invoice_number || "").trim();
      const moneda = String(rec.currency || "EUR").toUpperCase();
      const total = Number(rec.total_amount);
      if (!Number.isFinite(total)) { rep.errores++; marca("error"); detalle.estado = "error"; detalle.error = "total no numérico"; rep.detalles.push(detalle); continue; }

      // Totales del dataset por moneda (coincidan o no con lo nuevo).
      rep.por_moneda[moneda] = r2((rep.por_moneda[moneda] || 0) + total);

      // Localizar el PDF y su sha (verificando integridad si el paquete lo trae).
      const pdfName = prefix + String(rec.document_path || "").replace(/^\/+/, "");
      const pdfBuf = files[pdfName];
      let sha = String(rec.sha256 || "");
      if (pdfBuf) { const calc = sha256(pdfBuf); if (!sha) sha = calc; else if (calc !== sha) detalle.aviso = "sha256 del PDF no coincide con el manifest"; }
      else { rep.sin_pdf++; detalle.aviso = "PDF no encontrado en el paquete"; }

      // 1) Dedupe por sha256 (clave primaria de idempotencia).
      let existente = sha ? (store.readAll("recepciones") || []).find((x) => x.factura_sha256 === sha) : null;
      // 2) Si no, por proveedor + nº de factura.
      let proveedor = intake.buscarProveedor({ proveedor: supplier, proveedor_cif: "" }, proveedores);
      if (!existente && proveedor && numero) {
        existente = (store.readAll("recepciones") || []).find((x) => (x.proveedor_id || null) === proveedor.id && String(x.numero_documento || "").trim().toLowerCase() === numero.toLowerCase());
      }

      if (existente) {
        // ¿Le falta el PDF? → se lo adjuntamos (actualiza). Si ya lo tiene → dup.
        if (pdfBuf && !existente.documento_pdf_url) {
          if (!dryRun) {
            store.update("recepciones", existente.id, { documento_pdf_url: dataUriPdf(pdfBuf), factura_sha256: sha, import_id: rec.import_id, gmail_message_id: rec.gmail_message_id || "", archivo_original: existente.archivo_original || rec.original_filename || "" });
            mutado = true;
          }
          rep.actualizadas++; marca("actualizada"); detalle.estado = "actualizada"; detalle.id = existente.id;
        } else {
          rep.duplicadas++; marca("duplicada"); detalle.estado = "duplicada"; detalle.id = existente.id;
        }
        rep.detalles.push(detalle);
        continue;
      }

      // Dedupe dentro del propio paquete (dos registros con el mismo sha).
      if (sha && shaVistos.has(sha)) { rep.duplicadas++; marca("duplicada"); detalle.estado = "duplicada"; rep.detalles.push(detalle); continue; }
      if (sha) shaVistos.add(sha);

      // Resolver / crear proveedor.
      let provNuevo = false;
      if (!proveedor) {
        const clave = intake.normNombre(supplier);
        if (provNuevos.has(clave)) { proveedor = { id: provNuevos.get(clave), nombre: supplier }; }
        else {
          const id = store.nextId("prov", "proveedores");
          proveedor = intake.construirProveedorDesdeOCR({ proveedor: supplier }, id);
          proveedor.notas = "Alta automática al importar el paquete de facturas.";
          proveedor.origen = "gmail_paquete";
          provNuevos.set(clave, id);
          provNuevo = true;
          // En commit se persiste; en dry-run NO se toca el almacén (la reutilización
          // de un mismo proveedor dentro del paquete la cubre provNuevos).
          if (!dryRun) { store.insert("proveedores", proveedor); if (!proveedores.some((p) => p.id === proveedor.id)) proveedores.push(proveedor); mutado = true; }
        }
      }

      // Construir la recepción (mismo builder que correo/Excel).
      const datos = { tipo_documento: "factura", numero_documento: numero, proveedor: supplier, fecha: rec.invoice_date || "", importe_total: total, lineas: [] };
      const nueva = fe.construirRecepcion(store, datos, { documento: pdfBuf ? { esImagen: false, dataUri: dataUriPdf(pdfBuf) } : null, email: { from: "", subject: rec.email_subject || "" } });
      nueva.proveedor_id = proveedor.id;
      nueva.origen = "gmail_paquete";
      nueva.moneda = moneda;
      const imp = r2(total); nueva.importe_total = imp; nueva.pendiente_pago = imp; if (imp < 0) nueva.rectificativa = true;
      if (rec.taxable_base != null) nueva.base_imponible = Number(rec.taxable_base) || 0;
      if (rec.vat_amount != null) nueva.iva = Number(rec.vat_amount) || 0;
      nueva.archivo_original = rec.original_filename || "";
      nueva.factura_sha256 = sha;
      nueva.import_id = rec.import_id || "";
      nueva.gmail_message_id = rec.gmail_message_id || "";
      nueva.payment_status = rec.payment_status || "unknown"; // "unknown" → nunca se marca pagada
      nueva.requiere_revision = rec.requires_review !== false;

      if (!dryRun) { store.insert("recepciones", nueva); mutado = true; }
      rep.importadas++;
      marca(provNuevo ? "importada_proveedor_nuevo" : "importada");
      detalle.estado = provNuevo ? "importada (proveedor nuevo)" : "importada";
      detalle.id = nueva.id;
      rep.detalles.push(detalle);
    } catch (e) {
      rep.errores++; marca("error"); detalle.estado = "error"; detalle.error = e.message || String(e); rep.detalles.push(detalle);
    }
  }

  rep._mutado = mutado;
  return { store, rep };
}

module.exports = { importar, leerPaquete, sha256 };
