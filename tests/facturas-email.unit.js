// Ingesta de facturas por correo: normalización del webhook, emparejado de
// proveedor, dedupe y creación de la recepción. Sin IA (OCR inyectado) y con un
// almacén en memoria (sin tocar backend/data).
// Ejecutar: node tests/facturas-email.unit.js
const assert = require("assert");
const fe = require("../backend/facturas-email");

let fallos = 0;
const PRUEBAS = [];
function test(n, fn) { PRUEBAS.push([n, fn]); }

console.log("facturas por correo");

// Almacén en memoria con la interfaz que usa el motor.
function fakeStore(seed) {
  const data = JSON.parse(JSON.stringify(seed || {}));
  const seq = {};
  return {
    readAll: (e) => data[e] || (data[e] = []),
    insert: (e, row) => { (data[e] || (data[e] = [])).push(row); return row; },
    findById: (e, id) => (data[e] || []).find((x) => x.id === id) || null,
    nextId: (pfx, e) => { seq[e] = (seq[e] || 0) + 1; return `${pfx}_${seq[e]}`; },
    flush: async () => {},
    _data: data,
  };
}

// Un pequeño base64 (el contenido da igual: el OCR está inyectado).
const B64 = Buffer.from("%PDF-1.4 factura de prueba").toString("base64");

// OCR falso: devuelve datos fijos (o lo que se le configure por nombre de fichero).
function fakeOcr(map) {
  return async ({ filename }) => {
    if (map && map[filename]) return map[filename];
    return {
      tipo_documento: "factura", numero_documento: "FRA 2026/001",
      proveedor: "Cafés García S.L.", proveedor_cif: "B12345678",
      fecha: "2026-09-15", importe_total: 121.0,
      lineas: [{ descripcion: "Café en grano 1kg", cantidad: 10, unidad: "kg", precio_unitario: 10, importe: 100 }],
    };
  };
}

test("normalizarPayload: formato propio con adjuntos base64", () => {
  const p = fe.normalizarPayload({
    from: "proveedor@correo.com", subject: "Factura septiembre",
    attachments: [{ filename: "factura.pdf", content_type: "application/pdf", content: B64 }],
  });
  assert.strictEqual(p.from, "proveedor@correo.com");
  assert.strictEqual(p.attachments.length, 1);
  assert.strictEqual(p.attachments[0].filename, "factura.pdf");
  assert.ok(p.attachments[0].base64.length > 0);
});

test("normalizarPayload: formato Resend Inbound (data{}, contentType)", () => {
  const p = fe.normalizarPayload({
    type: "email.received",
    data: { from: "a@b.com", subject: "fra", attachments: [{ filename: "f.pdf", contentType: "application/pdf", content: B64 }] },
  });
  assert.strictEqual(p.from, "a@b.com");
  assert.strictEqual(p.attachments.length, 1);
});

test("normalizarPayload: limpia data-URI y descarta adjuntos sin contenido", () => {
  const p = fe.normalizarPayload({
    attachments: [
      { filename: "x.png", content_type: "image/png", content: "data:image/png;base64," + B64 },
      { filename: "vacio.pdf", content_type: "application/pdf" },
    ],
  });
  assert.strictEqual(p.attachments.length, 1);
  assert.ok(!/^data:/.test(p.attachments[0].base64));
});

test("esDocumento reconoce pdf/imagen por mime o extensión; ignora el resto", () => {
  assert.ok(fe.esDocumento({ mediaType: "application/pdf", filename: "" }));
  assert.ok(fe.esDocumento({ mediaType: "", filename: "factura.PDF" }));
  assert.ok(fe.esDocumento({ mediaType: "image/jpeg", filename: "foto" }));
  assert.ok(!fe.esDocumento({ mediaType: "text/calendar", filename: "cita.ics" }));
});

test("ingestar crea una recepción factura 'Pendiente de confirmar' con origen email", async () => {
  const store = fakeStore({ proveedores: [], recepciones: [] });
  const r = await fe.ingestar(
    { from: "prov@x.com", subject: "fra", attachments: [{ filename: "factura.pdf", content_type: "application/pdf", content: B64 }] },
    { store, ocrFn: fakeOcr() }
  );
  assert.strictEqual(r.creadas, 1, JSON.stringify(r));
  const recs = store.readAll("recepciones");
  assert.strictEqual(recs.length, 1);
  const rec = recs[0];
  assert.strictEqual(rec.tipo_documento, "factura");
  assert.strictEqual(rec.estado, "Pendiente de confirmar");
  assert.strictEqual(rec.origen, "email");
  assert.strictEqual(rec.importe_total, 121);
  assert.strictEqual(rec.pendiente_pago, 121);
  assert.strictEqual(rec.numero_documento, "FRA 2026/001");
  assert.ok(rec.documento_pdf_url && rec.documento_pdf_url.startsWith("data:application/pdf;base64,"));
  assert.strictEqual(rec.fecha.slice(0, 10), "2026-09-15"); // fecha de la factura, no de recepción
  // Proveedor dado de alta automáticamente y enlazado.
  const provs = store.readAll("proveedores");
  assert.strictEqual(provs.length, 1);
  assert.strictEqual(rec.proveedor_id, provs[0].id);
});

test("empareja proveedor existente por CIF (no duplica el alta)", async () => {
  const store = fakeStore({ proveedores: [{ id: "prov_x", nombre: "García", cif: "B12345678" }], recepciones: [] });
  const r = await fe.ingestar(
    { attachments: [{ filename: "factura.pdf", content_type: "application/pdf", content: B64 }] },
    { store, ocrFn: fakeOcr() }
  );
  assert.strictEqual(r.creadas, 1);
  assert.strictEqual(store.readAll("proveedores").length, 1); // no se crea otro
  assert.strictEqual(store.readAll("recepciones")[0].proveedor_id, "prov_x");
});

test("dedupe: el mismo correo reenviado dos veces no crea dos recepciones", async () => {
  const store = fakeStore({ proveedores: [], recepciones: [] });
  const correo = { attachments: [{ filename: "factura.pdf", content_type: "application/pdf", content: B64 }] };
  const r1 = await fe.ingestar(correo, { store, ocrFn: fakeOcr() });
  const r2 = await fe.ingestar(correo, { store, ocrFn: fakeOcr() });
  assert.strictEqual(r1.creadas, 1);
  assert.strictEqual(r2.creadas, 0);
  assert.strictEqual(r2.duplicadas, 1);
  assert.strictEqual(store.readAll("recepciones").length, 1);
});

test("dedupe sin número de documento: por proveedor + importe + día", async () => {
  const ocr = fakeOcr({ "sinnum.pdf": { tipo_documento: "factura", numero_documento: "", proveedor: "Lácteos Sur", proveedor_cif: "", fecha: "2026-09-10", importe_total: 55.5, lineas: [] } });
  const store = fakeStore({ proveedores: [], recepciones: [] });
  const correo = { attachments: [{ filename: "sinnum.pdf", content_type: "application/pdf", content: B64 }] };
  await fe.ingestar(correo, { store, ocrFn: ocr });
  const r2 = await fe.ingestar(correo, { store, ocrFn: ocr });
  assert.strictEqual(r2.duplicadas, 1, JSON.stringify(r2));
  assert.strictEqual(store.readAll("recepciones").length, 1);
});

test("correo sin adjuntos útiles: no crea nada y lo dice", async () => {
  const store = fakeStore({ proveedores: [], recepciones: [] });
  const r = await fe.ingestar({ attachments: [{ filename: "firma.txt", content_type: "text/plain", content: B64 }] }, { store, ocrFn: fakeOcr() });
  assert.strictEqual(r.creadas, 0);
  assert.strictEqual(r.documentos, 0);
  assert.ok(r.detalles[0].nota);
});

test("un adjunto ilegible cuenta como error pero no rompe el resto", async () => {
  const ocr = async ({ filename }) => { if (filename === "mala.pdf") throw new Error("no se pudo leer"); return { tipo_documento: "albaran", numero_documento: "ALB-9", proveedor: "Otro", proveedor_cif: "", fecha: "2026-09-01", importe_total: 10, lineas: [] }; };
  const store = fakeStore({ proveedores: [], recepciones: [] });
  const r = await fe.ingestar({ attachments: [
    { filename: "mala.pdf", content_type: "application/pdf", content: B64 },
    { filename: "buena.pdf", content_type: "application/pdf", content: B64 },
  ] }, { store, ocrFn: ocr });
  assert.strictEqual(r.errores, 1);
  assert.strictEqual(r.creadas, 1);
  assert.strictEqual(store.readAll("recepciones")[0].tipo_documento, "albaran");
});

test("ingestar exige ocrFn", async () => {
  let lanzo = false;
  try { await fe.ingestar({ attachments: [] }, { store: fakeStore() }); } catch (e) { lanzo = /ocrFn/.test(e.message); }
  assert.ok(lanzo);
});

(async () => {
  for (const [n, fn] of PRUEBAS) {
    try { await fn(); console.log("  ✓ " + n); }
    catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); }
  }
  if (fallos) { console.error(`\n${fallos} fallo(s) en facturas por correo`); process.exit(1); }
  console.log("  facturas por correo OK");
})();
