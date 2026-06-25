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

module.exports = { justificanteBuffer };
