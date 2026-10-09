// Conector TPV (recepción por API): clave gestionada en la app, verificación en
// tiempo constante, extracción tolerante de documentos e ingesta idempotente que
// BLOQUEA (no inventa) cuando el producto no está vinculado.
// Ejecutar: node tests/tpv-connector.unit.js
const assert = require("assert");
const tpv = require("../backend/tpv-connector");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

// Store falso en memoria (mismo contrato que data-store para lo que usa el motor).
function fakeStore(seed) {
  const db = Object.assign({ config: [], productos: [], materias: [], ventas: [], docs_agora: [], stock_movements: [], sincronizaciones: [] }, seed || {});
  return {
    _db: db,
    findById: (e, id) => (db[e] || []).find((x) => x.id === id),
    insert: (e, o) => { (db[e] = db[e] || []).push(o); return o; },
    update: (e, id, patch) => { const x = (db[e] || []).find((y) => y.id === id); if (x) Object.assign(x, patch); return x; },
    remove: (e, id) => { db[e] = (db[e] || []).filter((x) => x.id !== id); },
    readAll: (e) => db[e] || [],
    writeAll: (e, arr) => { db[e] = arr; },
    nextId: (p, e) => p + "-" + ((db[e] || []).length + 1),
    flush: async () => {},
  };
}

console.log("conector TPV");

test("sin clave configurada → claveActual null, origen 'ninguno', no verifica", () => {
  delete process.env.AGORA_CONNECTOR_TOKEN;
  const s = fakeStore();
  assert.strictEqual(tpv.claveActual(s), null);
  assert.strictEqual(tpv.origenClave(s), "ninguno");
  assert.strictEqual(tpv.verificar(s, "lo-que-sea"), false);
});

test("variable de entorno como respaldo (origen 'entorno')", () => {
  process.env.AGORA_CONNECTOR_TOKEN = "env-123456789";
  const s = fakeStore();
  assert.strictEqual(tpv.claveActual(s), "env-123456789");
  assert.strictEqual(tpv.origenClave(s), "entorno");
  assert.strictEqual(tpv.verificar(s, "env-123456789"), true);
  assert.strictEqual(tpv.verificar(s, "otra"), false);
  delete process.env.AGORA_CONNECTOR_TOKEN;
});

test("generarClave: clave fuerte, gestionada en la app, verificación exacta", () => {
  const s = fakeStore();
  const r = tpv.generarClave(s, { nombre: "Moni" });
  assert.ok(/^mdm_[0-9a-f]{48}$/.test(r.clave), "formato mdm_ + 48 hex");
  assert.strictEqual(tpv.origenClave(s), "app");
  assert.strictEqual(tpv.claveActual(s), r.clave);
  assert.strictEqual(tpv.verificar(s, r.clave), true);
  assert.strictEqual(tpv.verificar(s, r.clave + "x"), false, "longitud distinta no coincide");
  assert.strictEqual(tpv.verificar(s, ""), false);
});

test("la clave de la app manda sobre la variable de entorno", () => {
  process.env.AGORA_CONNECTOR_TOKEN = "env-999";
  const s = fakeStore();
  const r = tpv.generarClave(s);
  assert.strictEqual(tpv.claveActual(s), r.clave);
  assert.strictEqual(tpv.origenClave(s), "app");
  delete process.env.AGORA_CONNECTOR_TOKEN;
});

test("revocar: deja de aceptar hasta nueva clave", () => {
  const s = fakeStore();
  const r = tpv.generarClave(s);
  tpv.revocar(s);
  assert.strictEqual(tpv.claveActual(s), null);
  assert.strictEqual(tpv.verificar(s, r.clave), false);
});

test("mascara: ni expone la clave ni la deja vacía", () => {
  assert.strictEqual(tpv.mascara(null), null);
  const m = tpv.mascara("mdm_0123456789abcdef");
  assert.ok(m.includes("…") && !m.includes("23456789"), "enmascarada");
});

test("extraerDocs: array, {docs}, {documents}, documento suelto, vacío", () => {
  assert.strictEqual(tpv.extraerDocs([{ a: 1 }]).length, 1);
  assert.strictEqual(tpv.extraerDocs({ docs: [{ a: 1 }, { b: 2 }] }).length, 2);
  assert.strictEqual(tpv.extraerDocs({ documents: [{ a: 1 }] }).length, 1);
  assert.strictEqual(tpv.extraerDocs({ Lines: [{}] }).length, 1, "documento suelto con Lines");
  assert.strictEqual(tpv.extraerDocs({}).length, 0);
  assert.strictEqual(tpv.extraerDocs(null).length, 0);
});

test("extraerDocs: formato REAL de Ágora { Invoices:[...] } → aplana con __type", () => {
  const body = { Invoices: [{ Serie: "T", Number: 3719, BusinessDay: "2026-10-09" }, { Serie: "T", Number: 3720 }], DeliveryNotes: [{ Serie: "A", Number: 5 }] };
  const docs = tpv.extraerDocs(body);
  assert.strictEqual(docs.length, 3, "2 Invoices + 1 DeliveryNote");
  assert.strictEqual(docs[0].__type, "Invoice", "etiqueta el tipo (Invoices → Invoice)");
  assert.strictEqual(docs[0].Number, 3719, "conserva los campos del documento");
  assert.strictEqual(docs[2].__type, "DeliveryNote");
});

test("extraerDocs: DOBLE envoltura del agente { documents: { Invoices:[...] } }", () => {
  const body = { documents: { Invoices: [{ Serie: "T", Number: 1 }, { Serie: "T", Number: 2 }] } };
  const docs = tpv.extraerDocs(body);
  assert.strictEqual(docs.length, 2, "desenvuelve documents→Invoices");
  assert.strictEqual(docs[0].__type, "Invoice");
});

test("tieneCampoDocs: un { Invoices:[] } vacío es ciclo sin novedades (latido), no malformado", () => {
  assert.strictEqual(tpv.tieneCampoDocs({ Invoices: [] }), true);
  assert.strictEqual(tpv.tieneCampoDocs({ documents: { Invoices: [] } }), true);
});

test("ingerir sin documentos → error SIN_DOCS", () => {
  const s = fakeStore();
  let err = null;
  try { tpv.ingerir(s, {}, {}); } catch (e) { err = e; }
  assert.ok(err && err.code === "SIN_DOCS", "lanza SIN_DOCS");
});
// La ingesta completa (bloquea sin vincular, procesa vinculado, idempotente) se
// prueba de extremo a extremo por HTTP en el e2e (usa el store real con seed).

test("estado: forma esperada para el panel", () => {
  const s = fakeStore();
  tpv.generarClave(s);
  const e = tpv.estado(s);
  ["configurado", "origen_clave", "clave_mascara", "procesados", "bloqueados", "no_vinculados", "ventas_totales", "salud", "ultimo_contacto", "ultima_sync_hace_min"].forEach((k) => assert.ok(k in e, "tiene " + k));
  assert.strictEqual(e.configurado, true);
});

test("tieneCampoDocs: distingue 'ciclo vacío' de 'cuerpo malformado'", () => {
  assert.strictEqual(tpv.tieneCampoDocs({ docs: [] }), true, "{docs:[]} es un ciclo sin novedades");
  assert.strictEqual(tpv.tieneCampoDocs({ documents: [] }), true);
  assert.strictEqual(tpv.tieneCampoDocs([]), true);
  assert.strictEqual(tpv.tieneCampoDocs({}), false, "{} no trae sitio para documentos");
  assert.strictEqual(tpv.tieneCampoDocs(null), false);
});

test("ingerir: ciclo vacío {docs:[]} es LATIDO (no error); {} sigue siendo SIN_DOCS", () => {
  const s = fakeStore();
  const r = tpv.ingerir(s, { docs: [] }, {});
  assert.strictEqual(r.heartbeat, true, "ciclo vacío → latido");
  assert.strictEqual(r.procesados, 0);
  let err = null;
  try { tpv.ingerir(s, {}, {}); } catch (e) { err = e; }
  assert.ok(err && err.code === "SIN_DOCS", "cuerpo sin campo de documentos → SIN_DOCS");
});

test("saludConector: sin clave → 'sin_clave'", () => {
  delete process.env.AGORA_CONNECTOR_TOKEN;
  assert.strictEqual(tpv.saludConector(fakeStore()).salud, "sin_clave");
});

test("saludConector: clave pero sin contacto ni ventas → 'sin_contacto'", () => {
  delete process.env.AGORA_CONNECTOR_TOKEN;
  const s = fakeStore();
  tpv.generarClave(s);
  assert.strictEqual(tpv.saludConector(s).salud, "sin_contacto");
});

test("saludConector: latido reciente → 'ok'; latido viejo → 'caido'", () => {
  delete process.env.AGORA_CONNECTOR_TOKEN;
  const now = Date.now();
  const s = fakeStore();
  tpv.generarClave(s);
  tpv.marcarContacto(s); // justo ahora
  assert.strictEqual(tpv.saludConector(s, now).salud, "ok");
  // Latido de hace 2 h (> umbral 90 min) → caído.
  s.update("config", tpv.CFG_ID, { ultimo_contacto: new Date(now - 120 * 60000).toISOString() });
  assert.strictEqual(tpv.saludConector(s, now).salud, "caido");
});

test("saludConector: sin latido aún, pero última venta reciente → 'ok' (no falsa alarma)", () => {
  delete process.env.AGORA_CONNECTOR_TOKEN;
  const now = Date.now();
  const s = fakeStore();
  tpv.generarClave(s);
  s.insert("sincronizaciones", { id: "syn-1", cuando: new Date(now - 10 * 60000).toISOString() });
  assert.strictEqual(tpv.saludConector(s, now).salud, "ok");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en conector TPV`); process.exit(1); }
console.log("  conector TPV OK");
