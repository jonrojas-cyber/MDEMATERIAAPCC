// Envío de email vía Resend (API HTTP). Se activa con RESEND_API_KEY.
// Sin la clave, la app sigue: el justificante se manda por WhatsApp con un toque.

const FROM = process.env.RESEND_FROM || "M de Materia <onboarding@resend.dev>";

function disponible() {
  return !!process.env.RESEND_API_KEY;
}

async function enviarEmail({ to, subject, html, attachments }) {
  if (!disponible()) {
    const e = new Error("Email no configurado (define RESEND_API_KEY)");
    e.code = "EMAIL_NO_CONFIG";
    throw e;
  }
  const payload = { from: FROM, to: [to], subject, html };
  if (Array.isArray(attachments) && attachments.length) payload.attachments = attachments;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`Resend ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// HTML del justificante de pago para el cuerpo del email (estilos en línea).
function htmlJustificante(j) {
  const fp = new Date(j.fecha_pago).toLocaleString("es-ES");
  const filas = (j.albaranes || [])
    .map(
      (a) => `<tr>
      <td style="padding:6px;border-bottom:1px solid #eee;">${esc(a.recepcion_id)}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;">${new Date(a.fecha).toLocaleDateString("es-ES")}</td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${Number(a.importe_total || 0).toFixed(2)} €</td>
      <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${Number(a.importe_pagado || 0).toFixed(2)} €</td></tr>`
    )
    .join("");
  return `<div style="font-family:Arial,sans-serif;color:#111;max-width:640px;margin:0 auto;">
    <div style="border-bottom:3px solid #5C6145;padding-bottom:10px;margin-bottom:16px;">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5C6145;">M de Materia · Control M</div>
      <h2 style="margin:4px 0 0;">Justificante de pago ${esc(j.codigo)}</h2>
    </div>
    <p style="font-size:14px;">Hola ${esc(j.proveedor_contacto || j.proveedor_nombre)},</p>
    <p style="font-size:14px;">Te confirmamos el pago de los siguientes albaranes:</p>
    <p style="font-size:13px;margin:4px 0;"><b>Proveedor:</b> ${esc(j.proveedor_nombre)}</p>
    <p style="font-size:13px;margin:4px 0;"><b>Fecha de pago:</b> ${fp}</p>
    <p style="font-size:13px;margin:4px 0;"><b>Método:</b> ${esc(j.metodo || "—")}</p>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;">
      <thead><tr>
        <th style="text-align:left;padding:6px;color:#5C6145;">Albarán</th>
        <th style="text-align:left;padding:6px;color:#5C6145;">Fecha</th>
        <th style="text-align:right;padding:6px;color:#5C6145;">Importe</th>
        <th style="text-align:right;padding:6px;color:#5C6145;">Pagado</th>
      </tr></thead><tbody>${filas}</tbody></table>
    <p style="font-size:18px;font-weight:bold;text-align:right;margin-top:14px;">Total pagado: ${Number(j.importe_pagado || 0).toFixed(2)} €</p>
    <p style="font-size:11px;color:#777;margin-top:18px;border-top:1px solid #eee;padding-top:10px;">Documento generado automáticamente por Control M (M de Materia) como comprobante de pago.</p>
  </div>`;
}

module.exports = { disponible, enviarEmail, htmlJustificante };
