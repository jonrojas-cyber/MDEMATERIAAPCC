// Operaciones APPCC y lotes internos. Ejecutar: node tests/appcc-lotes.unit.js
const assert = require("assert");
const appcc = require("../backend/appcc-lotes");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("APPCC · lotes internos");

test("hay 8 tipos de operación con plantilla y campos", () => {
  assert.strictEqual(appcc.OPERACIONES.length, 8);
  const claves = appcc.OPERACIONES.map((o) => o.k).sort();
  assert.deepStrictEqual(claves, ["apertura", "descongelacion", "division", "elaboracion", "preparacion", "produccion_bebidas", "reenvasado", "reimpresion"].sort());
  appcc.OPERACIONES.forEach((o) => { assert.ok(o.nombre && Array.isArray(o.campos), o.k + " sin campos"); });
});

test("validar: reenvasado exige proveedor + lote original + caducidad + nº, con mensajes concretos", () => {
  const op = appcc.operacion("reenvasado");
  const r = appcc.validar(op, {});
  assert.strictEqual(r.ok, false);
  const campos = r.errores.map((e) => e.campo).sort();
  assert.deepStrictEqual(campos, ["caducidad_original", "lote_original", "num_etiquetas", "proveedor"].sort());
  // Mensajes concretos, no genéricos.
  assert.ok(r.errores.every((e) => /obligatori|indica|mínimo/i.test(e.mensaje)));
  // Con todos los campos → válido.
  const ok = appcc.validar(op, { proveedor: "Campofrío", lote_original: "L123", caducidad_original: "2026-12-01", num_etiquetas: 3 });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.errores.length, 0);
});

test("validar: num_etiquetas < 1 falla", () => {
  const op = appcc.operacion("preparacion");
  assert.strictEqual(appcc.validar(op, { num_etiquetas: 0 }).ok, false);
  assert.strictEqual(appcc.validar(op, { num_etiquetas: 1 }).ok, true);
});

test("fecha límite: null sin vida útil configurada", () => {
  assert.strictEqual(appcc.calcularFechaLimite({ fechaManip: "2026-10-02T10:00:00Z", vidaDias: null }), null);
  assert.strictEqual(appcc.calcularFechaLimite({ fechaManip: "2026-10-02T10:00:00Z", vidaDias: 0 }), null);
});

test("fecha límite: vida útil normal (manip + días)", () => {
  const lim = appcc.calcularFechaLimite({ fechaManip: "2026-10-02T10:00:00Z", vidaDias: 3 });
  assert.strictEqual(lim, new Date("2026-10-05T10:00:00Z").toISOString());
});

test("fecha límite: NUNCA supera la caducidad original del fabricante", () => {
  // vida 10 días pero el fabricante caduca a los 2 → se recorta a la del fabricante.
  const lim = appcc.calcularFechaLimite({ fechaManip: "2026-10-02T10:00:00Z", vidaDias: 10, caducidadOriginal: "2026-10-04T00:00:00Z" });
  assert.strictEqual(lim, new Date("2026-10-04T00:00:00Z").toISOString());
  // Si la caducidad del fabricante es posterior, manda la vida útil.
  const lim2 = appcc.calcularFechaLimite({ fechaManip: "2026-10-02T10:00:00Z", vidaDias: 1, caducidadOriginal: "2026-12-01T00:00:00Z" });
  assert.strictEqual(lim2, new Date("2026-10-03T10:00:00Z").toISOString());
});

test("nuevoLoteId: formato L-AAAAMMDD-HHMMSS-XXXX e inmutable/único", () => {
  const id = appcc.nuevoLoteId("2026-10-02T09:08:07Z");
  assert.ok(/^L-20261002-090807-[A-Z0-9]{4}$/.test(id), id);
  const a = appcc.nuevoLoteId(), b = appcc.nuevoLoteId();
  assert.notStrictEqual(a, b);
});

test("EJEMPLO JAMÓN: reenvasado registra toda la trazabilidad y calcula límite con tope", () => {
  const op = appcc.operacion("reenvasado");
  const ficha = { vida_util_dias: 5, conservacion: "0-4 °C", alergenos: [], tipo_fecha: "caducidad" };
  const lote = appcc.construirLote(op, {
    proveedor: "Campofrío", lote_original: "LC-9931", caducidad_original: "2026-10-07", num_etiquetas: 4,
  }, { producto: "Jamón braseado", ref: "prod-agora-jamon", agora_id: "A777", ficha, now: "2026-10-02T12:00:00Z", usuario: "Lara" });

  assert.ok(/^L-/.test(lote.id));                        // id único e inmutable
  assert.strictEqual(lote.producto, "Jamón braseado");
  assert.strictEqual(lote.agora_id, "A777");             // ID original de Ágora
  assert.strictEqual(lote.proveedor, "Campofrío");
  assert.strictEqual(lote.lote_original, "LC-9931");
  assert.strictEqual(lote.operacion, "reenvasado");
  assert.strictEqual(lote.fecha_manipulacion, "2026-10-02T12:00:00Z"); // auto
  assert.strictEqual(lote.usuario, "Lara");              // responsable auto
  assert.strictEqual(lote.num_etiquetas, 4);
  assert.strictEqual(lote.estado, "activo");
  assert.strictEqual(lote.conservacion, "0-4 °C");
  // Vida 5 días → 07/10 12:00, pero el fabricante caduca el 07/10 00:00 → tope del fabricante.
  assert.strictEqual(lote.fecha_limite_interna, new Date("2026-10-07T00:00:00Z").toISOString());
  assert.strictEqual(lote.caducidad_original, new Date("2026-10-07").toISOString());
  assert.strictEqual(lote.historial.length, 1);
  assert.strictEqual(lote.historial[0].tipo, "impresion");
  assert.strictEqual(lote.historial[0].copies, 4);
});

test("sin vida útil configurada → no hay fecha límite interna (usa caducidad original al imprimir)", () => {
  const op = appcc.operacion("apertura");
  const lote = appcc.construirLote(op, { lote_original: "L1", caducidad_original: "2026-11-01", num_etiquetas: 1 },
    { producto: "Nata", ref: "prod-nata", ficha: {}, now: "2026-10-02T12:00:00Z", usuario: "Moni" });
  assert.strictEqual(lote.fecha_limite_interna, null);
  const especs = appcc.especsImpresion(lote, 1);
  assert.strictEqual(especs[0].cad, new Date("2026-11-01").toISOString()); // la etiqueta cae a la caducidad del fabricante
});

test("elaboración propia: asocia lotes de origen (trazabilidad hacia atrás)", () => {
  const op = appcc.operacion("elaboracion");
  const lote = appcc.construirLote(op, {
    cantidad: "2 L", num_etiquetas: 2,
    lotes_origen: [{ lote_id: "L-1", producto: "Salsa verde" }, { lote_id: "L-2", producto: "Aceite" }],
  }, { producto: "Base montaje", ref: "rec:99", ficha: { vida_util_dias: 2 }, now: "2026-10-02T12:00:00Z", usuario: "Moni" });
  assert.strictEqual(lote.lotes_origen.length, 2);
  assert.strictEqual(lote.lotes_origen[0].lote_id, "L-1");
  assert.ok(lote.fecha_limite_interna); // vida 2 días
});

test("división: hereda caducidad, fecha límite, conservación y alérgenos del lote padre", () => {
  const padre = {
    id: "L-PADRE", ref: "prod-x", producto: "Hummus", agora_id: "A1", proveedor: "Prov",
    caducidad_original: "2026-10-09T00:00:00Z", fecha_limite_interna: "2026-10-06T00:00:00Z",
    conservacion: "0-4 °C", alergenos: ["sésamo"], tipo_fecha_original: "caducidad",
  };
  const op = appcc.operacion("division");
  const hijo = appcc.construirLote(op, { lote_existente: "L-PADRE", num_etiquetas: 5 },
    { now: "2026-10-03T08:00:00Z", usuario: "Lara", loteOrigen: padre });
  assert.strictEqual(hijo.lote_padre, "L-PADRE");
  assert.strictEqual(hijo.producto, "Hummus");
  assert.strictEqual(hijo.caducidad_original, "2026-10-09T00:00:00Z");
  assert.strictEqual(hijo.fecha_limite_interna, "2026-10-06T00:00:00Z"); // heredada, no recalculada
  assert.deepStrictEqual(hijo.alergenos, ["sésamo"]);
  assert.strictEqual(hijo.num_etiquetas, 5);
});

test("especsImpresion: N copias, con caducidad y lote en la línea de estado", () => {
  const lote = { producto: "Jamón braseado", cantidad: "", lote_original: "LC-9931", operacion: "reenvasado", operacion_nombre: "Reenvasado",
    fecha_limite_interna: "2026-10-07T00:00:00Z", caducidad_original: "2026-10-07T00:00:00Z", fecha_manipulacion: "2026-10-02T12:00:00Z", usuario: "Lara", num_etiquetas: 4 };
  const especs = appcc.especsImpresion(lote, 4);
  assert.strictEqual(especs.length, 4);
  assert.strictEqual(especs[0].n, "Jamón braseado");
  assert.strictEqual(especs[0].cad, "2026-10-07T00:00:00Z");
  assert.ok(especs[0].est.includes("lote LC-9931"));
});

test("estados válidos", () => {
  ["activo", "consumido", "agotado", "retirado", "caducado", "descartado"].forEach((e) => assert.ok(appcc.estadoValido(e)));
  assert.ok(!appcc.estadoValido("inventado"));
});

if (fallos) { console.error(`\n${fallos} fallo(s) en APPCC lotes`); process.exit(1); }
console.log("  APPCC lotes OK");
