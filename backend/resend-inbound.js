// ADAPTADOR DE RESEND INBOUND (correo entrante)
// ─────────────────────────────────────────────────────────────────────────────
// Resend recibe el correo reenviado y nos manda un webhook `email.received` que
// trae SOLO metadatos (remitente, asunto y la LISTA de adjuntos con su id y
// nombre), NO el contenido. Para leer la factura hay que:
//   1) listar los adjuntos    → GET /emails/receiving/{email_id}/attachments
//      (devuelve download_url firmado y temporal por cada adjunto),
//   2) descargar cada uno de su download_url y pasarlo a base64.
// Así se obtiene el mismo { from, subject, attachments:[{filename,mediaType,base64}] }
// que entiende facturas-email.ingestar (fuente única de la lectura).

const API = "https://api.resend.com";

// ¿Es un webhook de correo entrante de Resend? (type email.received, o un cuerpo
// con email_id + lista de adjuntos sin contenido inline).
function esEventoInbound(body) {
  const b = body || {};
  if (b.type === "email.received") return true;
  const d = b.data || b;
  return !!(d && d.email_id && Array.isArray(d.attachments) && d.attachments.length &&
    d.attachments.every((a) => a && !a.content && !a.base64 && !a.data));
}

async function listarAdjuntos(emailId, key, fetchImpl) {
  const r = await fetchImpl(`${API}/emails/receiving/${encodeURIComponent(emailId)}/attachments`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`Resend attachments ${r.status} ${String(t).slice(0, 160)}`); }
  const j = await r.json();
  return Array.isArray(j) ? j : (j.data || j.attachments || []);
}

async function descargar(url, fetchImpl) {
  const r = await fetchImpl(url);
  if (!r.ok) throw new Error(`descarga de adjunto ${r.status}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab).toString("base64");
}

// Convierte el webhook `email.received` en el payload normalizado, descargando
// el contenido de cada adjunto. fetchImpl se inyecta para poder probar sin red.
async function aPayload(body, opts = {}) {
  const key = opts.apiKey || process.env.RESEND_API_KEY;
  const fetchImpl = opts.fetchImpl || fetch;
  if (!key) throw new Error("RESEND_API_KEY no configurado para leer el correo entrante");
  const d = (body && body.data) || body || {};
  const emailId = d.email_id;
  if (!emailId) throw new Error("El webhook no trae email_id");

  const metadatos = Array.isArray(d.attachments) ? d.attachments : [];
  const lista = await listarAdjuntos(emailId, key, fetchImpl);
  const byId = {}, byName = {};
  (lista || []).forEach((a) => { if (a && a.id) byId[a.id] = a; if (a && a.filename) byName[a.filename] = a; });

  const base = metadatos.length ? metadatos : (lista || []);
  const attachments = [];
  for (const meta of base) {
    const info = (meta.id && byId[meta.id]) || (meta.filename && byName[meta.filename]) || meta;
    const url = info.download_url || info.url;
    if (!url) continue;
    try {
      const base64 = await descargar(url, fetchImpl);
      attachments.push({ filename: info.filename || meta.filename || "", mediaType: info.content_type || meta.content_type || "", base64 });
    } catch (e) { /* un adjunto que no baja no tumba el resto */ }
  }
  return { from: d.from || "", subject: d.subject || "", attachments };
}

module.exports = { esEventoInbound, aPayload, listarAdjuntos, descargar };
