// Generación del PDF del justificante de pago (pdfkit, sin navegador).

const PDFDocument = require("pdfkit");

const OLIVE = "#5C6145";
const INK = "#111009";
const GREY = "#777777";

function eur(n) {
  return Number(n || 0).toFixed(2) + " EUR";
}

// Devuelve el PDF del justificante como Buffer.
function justificanteBuffer(j) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Courier");

    // Cabecera
    doc.fontSize(9).fillColor(OLIVE).text("M DE MATERIA · CONTROL M");
    doc.moveDown(0.2);
    doc.fontSize(18).fillColor(INK).text(`Justificante de pago  ${j.codigo}`);
    doc.moveDown(0.1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(OLIVE).lineWidth(2).stroke();
    doc.moveDown(0.6);

    // Datos
    doc.fontSize(11).fillColor(INK);
    doc.text(`Proveedor:      ${j.proveedor_nombre || ""}`);
    doc.text(`Fecha de pago:  ${new Date(j.fecha_pago).toLocaleString("es-ES")}`);
    doc.text(`Metodo:         ${j.metodo || "-"}`);
    doc.text(`Registrado por: ${j.usuario || "-"}`);
    doc.moveDown(0.6);

    // Tabla (columnas alineadas con Courier)
    const pad = (s, n) => { s = String(s); return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length); };
    const padL = (s, n) => { s = String(s); return s.length >= n ? s : " ".repeat(n - s.length) + s; };
    doc.fontSize(10).fillColor(OLIVE);
    doc.text(pad("Albaran", 18) + pad("Fecha", 13) + padL("Importe", 12) + padL("Pagado", 13));
    doc.fillColor(INK);
    (j.albaranes || []).forEach((a) => {
      doc.text(
        pad(a.recepcion_id, 18) +
          pad(new Date(a.fecha).toLocaleDateString("es-ES"), 13) +
          padL(eur(a.importe_total), 12) +
          padL(eur(a.importe_pagado), 13)
      );
    });
    doc.moveDown(0.6);
    doc.fontSize(14).fillColor(INK).text(`Total pagado:  ${eur(j.importe_pagado)}`, { align: "right" });

    doc.moveDown(2);
    doc.fontSize(8).fillColor(GREY).text(
      "Este documento certifica que M de Materia ha abonado los albaranes detallados al proveedor indicado en la fecha senalada. Generado automaticamente por Control M como comprobante de pago.",
      { width: 495 }
    );

    doc.end();
  });
}

// PDF del archivo de albaranes de un trimestre, listo para la gestoría:
// portada con resumen + una página por albarán con su foto.
function albaranesTrimestreBuffer(recs, meta) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Courier");

    // Portada / resumen
    doc.fontSize(9).fillColor(OLIVE).text("M DE MATERIA · CONTROL M");
    doc.moveDown(0.2);
    doc.fontSize(18).fillColor(INK).text(`Albaranes ${meta.label}`);
    doc.fontSize(10).fillColor(GREY).text(`${meta.rango} · ${recs.length} albaranes · total ${eur(meta.total)}`);
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(OLIVE).lineWidth(2).stroke();
    doc.moveDown(0.6);

    const pad = (s, n) => { s = String(s == null ? "" : s); return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length); };
    const padL = (s, n) => { s = String(s == null ? "" : s); return s.length >= n ? s : " ".repeat(n - s.length) + s; };
    doc.fontSize(9).fillColor(OLIVE).text(pad("Fecha", 12) + pad("Proveedor", 28) + padL("Importe", 12) + padL("Lineas", 8));
    doc.fillColor(INK);
    recs.forEach((r) => {
      doc.text(
        pad(new Date(r.fecha).toLocaleDateString("es-ES"), 12) +
          pad(r.proveedor_nombre || r.proveedor_id || "-", 28) +
          padL(eur(r.importe_total), 12) +
          padL(String((r.lineas || []).length), 8)
      );
    });
    doc.moveDown(0.4);
    doc.fontSize(13).fillColor(INK).text(`Total trimestre:  ${eur(meta.total)}`, { align: "right" });

    // Una página por albarán fotografiado
    recs.forEach((r) => {
      if (!r.foto_albaran_url) return;
      doc.addPage();
      doc.fontSize(11).fillColor(INK).text(
        `${r.proveedor_nombre || r.proveedor_id} · ${new Date(r.fecha).toLocaleDateString("es-ES")} · ${eur(r.importe_total)}`
      );
      doc.moveDown(0.4);
      try {
        const b64 = String(r.foto_albaran_url).split(",")[1] || "";
        const img = Buffer.from(b64, "base64");
        doc.image(img, { fit: [495, 680], align: "center" });
      } catch (e) {
        doc.fontSize(9).fillColor(GREY).text("(no se pudo incrustar la foto del albarán)");
      }
    });

    doc.end();
  });
}

module.exports = { justificanteBuffer, albaranesTrimestreBuffer };
