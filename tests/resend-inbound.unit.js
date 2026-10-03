// Adaptador de Resend Inbound: detección del evento y descarga de adjuntos
// (con fetch inyectado, sin red). Ejecutar: node tests/resend-inbound.unit.js
const assert = require("assert");
const ri = require("../backend/resend-inbound");

let fallos = 0;
const PRUEBAS = [];
function test(n, fn) { PRUEBAS.push([n, fn]); }

console.log("resend inbound");

const EVENTO = {
  type: "email.received",
  data: {
    email_id: "em_123",
    from: "facturacion@proveedor.com",
    subject: "Factura de septiembre",
    attachments: [
      { id: "att_1", filename: "factura.pdf", content_type: "application/pdf" },
      { id: "att_2", filename: "firma.png", content_type: "image/png" },
    ],
  },
};

// fetch falso: responde al listado de adjuntos y a las descargas por download_url.
function fakeFetch(bytesPorUrl) {
  return async (url, opts) => {
    if (/\/emails\/receiving\/em_123\/attachments$/.test(url)) {
      assert.ok(opts && opts.headers && /^Bearer /.test(opts.headers.Authorization), "falta Authorization");
      return { ok: true, json: async () => ({ data: [
        { id: "att_1", filename: "factura.pdf", content_type: "application/pdf", download_url: "https://dl/att_1" },
        { id: "att_2", filename: "firma.png", content_type: "image/png", download_url: "https://dl/att_2" },
      ] }) };
    }
    const buf = bytesPorUrl[url];
    if (buf) return { ok: true, arrayBuffer: async () => buf };
    return { ok: false, status: 404, text: async () => "no" };
  };
}

test("esEventoInbound reconoce email.received y no confunde el formato inline", () => {
  assert.ok(ri.esEventoInbound(EVENTO));
  assert.ok(ri.esEventoInbound({ data: { email_id: "x", attachments: [{ id: "a", filename: "f.pdf" }] } }));
  assert.ok(!ri.esEventoInbound({ attachments: [{ filename: "f.pdf", content: "QkFTRTY0" }] })); // trae contenido inline → Zapier
  assert.ok(!ri.esEventoInbound({ attachments: [] }));
});

test("aPayload descarga los adjuntos y devuelve base64 normalizado", async () => {
  const pdf = Buffer.from("%PDF factura");
  const png = Buffer.from("PNG firma");
  const payload = await ri.aPayload(EVENTO, {
    apiKey: "re_test",
    fetchImpl: fakeFetch({ "https://dl/att_1": pdf, "https://dl/att_2": png }),
  });
  assert.strictEqual(payload.from, "facturacion@proveedor.com");
  assert.strictEqual(payload.subject, "Factura de septiembre");
  assert.strictEqual(payload.attachments.length, 2);
  assert.strictEqual(payload.attachments[0].filename, "factura.pdf");
  assert.strictEqual(payload.attachments[0].mediaType, "application/pdf");
  assert.strictEqual(payload.attachments[0].base64, pdf.toString("base64"));
  assert.strictEqual(payload.attachments[1].base64, png.toString("base64"));
});

test("un adjunto que no descarga no tumba el resto", async () => {
  const pdf = Buffer.from("%PDF ok");
  const payload = await ri.aPayload(EVENTO, {
    apiKey: "re_test",
    fetchImpl: fakeFetch({ "https://dl/att_1": pdf }), // att_2 devolverá 404
  });
  assert.strictEqual(payload.attachments.length, 1);
  assert.strictEqual(payload.attachments[0].filename, "factura.pdf");
});

test("sin RESEND_API_KEY lanza error claro", async () => {
  let msg = "";
  try { await ri.aPayload(EVENTO, { apiKey: "", fetchImpl: fakeFetch({}) }); } catch (e) { msg = e.message; }
  assert.ok(/RESEND_API_KEY/.test(msg), msg);
});

test("el payload normalizado encaja con facturas-email.normalizarPayload", async () => {
  const fe = require("../backend/facturas-email");
  const pdf = Buffer.from("%PDF");
  const payload = await ri.aPayload(EVENTO, { apiKey: "k", fetchImpl: fakeFetch({ "https://dl/att_1": pdf, "https://dl/att_2": Buffer.from("x") }) });
  const norm = fe.normalizarPayload(payload);
  assert.strictEqual(norm.attachments.length, 2);
  assert.ok(fe.esDocumento(norm.attachments[0]));
});

(async () => {
  for (const [n, fn] of PRUEBAS) {
    try { await fn(); console.log("  ✓ " + n); }
    catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); }
  }
  if (fallos) { console.error(`\n${fallos} fallo(s) en resend inbound`); process.exit(1); }
  console.log("  resend inbound OK");
})();
