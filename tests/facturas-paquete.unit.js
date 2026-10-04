// Importador del paquete de facturas (ZIP con PDFs + facturas.json): dry-run,
// idempotencia por sha256, adjuntar PDF a una factura ya existente y totales.
// Ejecutar: node tests/facturas-paquete.unit.js
const assert = require("assert");
const crypto = require("crypto");
const fp = require("../backend/facturas-paquete");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("paquete de facturas");

// — Mini-constructor de ZIP (stored, sin comprimir; sin CRC) —
function zip(entries) {
  const parts = [], central = []; let offset = 0;
  for (const { name, data } of entries) {
    const nb = Buffer.from(name, "utf8"); const body = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 8);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(body.length, 22); lh.writeUInt16LE(nb.length, 26);
    parts.push(lh, nb, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 10);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(body.length, 24); ch.writeUInt16LE(nb.length, 28);
    ch.writeUInt32LE(offset, 42); central.push(ch, nb);
    offset += lh.length + nb.length + body.length;
  }
  const cd = Buffer.concat(central); const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}

const PDF_A = Buffer.from("%PDF-1.4 factura A");
const PDF_B = Buffer.from("%PDF-1.4 factura B");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

function paquete(records, { sinPdfB } = {}) {
  const entries = [
    { name: "pkg/data/facturas.json", data: JSON.stringify({ schema_version: 1, record_count: records.length, records }) },
    { name: "pkg/documentos/Prov A/a.pdf", data: PDF_A },
  ];
  if (!sinPdfB) entries.push({ name: "pkg/documentos/Prov B/b.pdf", data: PDF_B });
  return zip(entries);
}

const RECS = [
  { import_id: "g-1", supplier_name: "Proveedor A", invoice_number: "FA-1", invoice_date: "2026-03-01", currency: "EUR", total_amount: 100, payment_status: "unknown", original_filename: "a.pdf", document_path: "documentos/Prov A/a.pdf", sha256: sha(PDF_A), gmail_message_id: "m1", requires_review: true },
  { import_id: "g-2", supplier_name: "Proveedor B", invoice_number: "FB-9", invoice_date: "2026-03-05", currency: "USD", total_amount: 20, payment_status: "unknown", original_filename: "b.pdf", document_path: "documentos/Prov B/b.pdf", sha256: sha(PDF_B), gmail_message_id: "m2", requires_review: true },
];
const ZIP = paquete(RECS);

function fakeStore(seed) {
  const d = JSON.parse(JSON.stringify(seed || {})); const s = {};
  return {
    readAll: (e) => d[e] || (d[e] = []),
    insert: (e, r) => { (d[e] || (d[e] = [])).push(r); return r; },
    update: (e, id, patch) => { const row = (d[e] || []).find((r) => r.id === id); if (row) Object.assign(row, patch); return row; },
    findById: (e, id) => (d[e] || []).find((r) => r.id === id) || null,
    nextId: (p, e) => { s[e] = (s[e] || 0) + 1; return `${p}_${s[e]}`; },
    flush: async () => {}, _d: d,
  };
}

test("dry-run no escribe nada y cuenta bien, con totales por moneda del dataset", () => {
  const store = fakeStore({ proveedores: [], recepciones: [] });
  const { rep } = fp.importar(ZIP, { store, dryRun: true });
  assert.strictEqual(rep.importadas, 2);
  assert.strictEqual(rep.por_moneda.EUR, 100);
  assert.strictEqual(rep.por_moneda.USD, 20);
  assert.strictEqual(store.readAll("recepciones").length, 0); // nada escrito
  assert.strictEqual(store.readAll("proveedores").length, 0);
});

test("commit crea facturas pendientes con PDF adjunto, sha y payment_status unknown", () => {
  const store = fakeStore({ proveedores: [], recepciones: [] });
  const { rep } = fp.importar(ZIP, { store, dryRun: false });
  assert.strictEqual(rep.importadas, 2);
  const recs = store.readAll("recepciones");
  assert.strictEqual(recs.length, 2);
  const a = recs.find((r) => r.numero_documento === "FA-1");
  assert.strictEqual(a.tipo_documento, "factura");
  assert.strictEqual(a.estado, "Pendiente de confirmar");
  assert.strictEqual(a.origen, "gmail_paquete");
  assert.strictEqual(a.payment_status, "unknown");
  assert.strictEqual(a.factura_sha256, sha(PDF_A));
  assert.ok(a.documento_pdf_url.startsWith("data:application/pdf;base64,"));
  assert.strictEqual(store.readAll("proveedores").length, 2);
});

test("re-importar es idempotente (todo duplicadas, 0 nuevas)", () => {
  const store = fakeStore({ proveedores: [], recepciones: [] });
  fp.importar(ZIP, { store, dryRun: false });
  const { rep } = fp.importar(ZIP, { store, dryRun: false });
  assert.strictEqual(rep.importadas, 0);
  assert.strictEqual(rep.duplicadas, 2);
  assert.strictEqual(store.readAll("recepciones").length, 2);
});

test("adjunta el PDF a una factura ya existente sin PDF (no duplica)", () => {
  // Factura previa (como la del Excel): mismo proveedor+nº, sin documento.
  const store = fakeStore({
    proveedores: [{ id: "prov_x", nombre: "Proveedor A", cif: "" }],
    recepciones: [{ id: "rcp_1", proveedor_id: "prov_x", tipo_documento: "factura", numero_documento: "FA-1", importe_total: 100, estado: "Pendiente de confirmar", origen: "gmail_control" }],
  });
  const { rep } = fp.importar(ZIP, { store, dryRun: false });
  assert.strictEqual(rep.actualizadas, 1);
  assert.strictEqual(rep.importadas, 1); // la B es nueva
  const rcp1 = store.findById("recepciones", "rcp_1");
  assert.ok(rcp1.documento_pdf_url.startsWith("data:application/pdf;base64,"));
  assert.strictEqual(rcp1.factura_sha256, sha(PDF_A));
  assert.strictEqual(store.readAll("recepciones").length, 2); // no duplica la A
});

test("sha256 que no cuadra con el manifest se avisa pero se importa", () => {
  const recs = JSON.parse(JSON.stringify(RECS));
  recs[0].sha256 = "deadbeef"; // falso
  const { rep } = fp.importar(paquete(recs), { store: fakeStore({ proveedores: [], recepciones: [] }), dryRun: false });
  assert.strictEqual(rep.importadas, 2);
  const d = rep.detalles.find((x) => x.import_id === "g-1");
  assert.ok(/sha256/.test(d.aviso || ""));
});

test("rechaza un ZIP sin data/facturas.json", () => {
  const z = zip([{ name: "pkg/otra.txt", data: "hola" }]);
  assert.throws(() => fp.importar(z, { store: fakeStore() }), /facturas\.json/);
});

// — Formato GESTORÍA: Control .xlsx + PDFs organizados por proveedor (sin JSON) —
// Construye un Excel de control con hoja de detalle y localiza cada PDF por su
// "Ruta organizada". Es el paquete que exporta la gestoría (ENTREGA_GESTORIA).
function xlsxControl() {
  const inl = (ref, txt) => `<c r="${ref}" t="inlineStr"><is><t>${String(txt).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></is></c>`;
  const n = (ref, v) => `<c r="${ref}"><v>${v}</v></c>`;
  // Hoja 1: resumen por proveedor (no es detalle: sin Asunto/Archivo/Base).
  const h1 = `<?xml version="1.0"?><worksheet><sheetData>` +
    `<row r="1">${inl("A1", "Proveedor")}${inl("B1", "N.º facturas")}${inl("C1", "Total EUR")}</row>` +
    `<row r="2">${inl("A2", "Prov A")}${n("B2", 1)}${n("C2", 100)}</row>` +
    `</sheetData></worksheet>`;
  // Hoja 2: DETALLE (una factura por fila) con la columna "Ruta organizada".
  const cab = ["Fecha factura", "Proveedor", "N.º factura", "Asunto del correo", "Fecha correo", "Moneda", "Base imponible", "IVA", "Total", "Archivo original", "Ruta organizada"];
  const COL = "ABCDEFGHIJK".split("");
  const fila = (r, vals) => `<row r="${r}">` + vals.map((v, i) => (typeof v === "number" ? n(COL[i] + r, v) : inl(COL[i] + r, v))).join("") + `</row>`;
  const h2 = `<?xml version="1.0"?><worksheet><sheetData>` +
    fila(1, cab) +
    fila(2, ["2026-10-02", "Prov A", "FA-1", "Factura FA-1", "Fri, 2 Oct 2026", "EUR", 90, 10, 100, "a.pdf", "Prov_A/2026-10-02_FA-1_a.pdf"]) +
    fila(3, ["2026-09-03", "Prov B", "FB-9", "Factura FB-9", "Wed, 3 Sep 2026", "USD", "", "", 20, "b.pdf", "Prov_B/2026-09-03_FB-9_b.pdf"]) +
    `</sheetData></worksheet>`;
  return zip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0"?><Types/>` },
    { name: "xl/sharedStrings.xml", data: `<?xml version="1.0"?><sst/>` },
    { name: "xl/worksheets/sheet1.xml", data: h1 },
    { name: "xl/worksheets/sheet2.xml", data: h2 },
  ]);
}

function paqueteGestoria() {
  return zip([
    { name: "ENTREGA/Control_facturas_2026.xlsx", data: xlsxControl() },
    { name: "ENTREGA/Facturas_por_proveedor/Prov_A/2026-10-02_FA-1_a.pdf", data: PDF_A },
    { name: "ENTREGA/Facturas_por_proveedor/Prov_B/2026-09-03_FB-9_b.pdf", data: PDF_B },
    { name: "ENTREGA/LEEME.txt", data: "estado" },
  ]);
}

test("formato gestoría (Excel + PDFs por proveedor, sin JSON): importa y enlaza cada PDF", () => {
  const store = fakeStore();
  const { rep } = fp.importar(paqueteGestoria(), { store });
  assert.strictEqual(rep.formato, "gestoria");
  assert.strictEqual(rep.importadas, 2);
  assert.strictEqual(rep.sin_pdf, 0);
  assert.strictEqual(rep.errores, 0);
  assert.strictEqual(rep.por_moneda.EUR, 100);
  assert.strictEqual(rep.por_moneda.USD, 20);
  const recs = store.readAll("recepciones");
  assert.strictEqual(recs.length, 2);
  assert.ok(recs.every((r) => r.tipo_documento === "factura"));           // nunca mueve stock
  assert.ok(recs.every((r) => String(r.documento_pdf_url || "").startsWith("data:application/pdf"))); // OCR podrá leerlo
  assert.ok(recs.every((r) => r.factura_sha256));                          // idempotencia por sha
  const a = recs.find((r) => r.numero_documento === "FA-1");
  assert.strictEqual(a.base_imponible, 90); assert.strictEqual(a.iva, 10);
});

test("formato gestoría: re-importar es idempotente (0 nuevas, todo duplicadas)", () => {
  const store = fakeStore();
  fp.importar(paqueteGestoria(), { store });
  const { rep } = fp.importar(paqueteGestoria(), { store });
  assert.strictEqual(rep.importadas, 0);
  assert.strictEqual(rep.duplicadas, 2);
});

test("ZIP sin JSON y sin Excel se rechaza con mensaje claro", () => {
  const z = zip([{ name: "pkg/otra.txt", data: "hola" }]);
  assert.throws(() => fp.importar(z, { store: fakeStore() }), /facturas\.json|Excel/);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en paquete de facturas`); process.exit(1); }
console.log("  paquete de facturas OK");
