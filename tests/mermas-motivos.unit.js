// Mermas · motivos y validación. Ejecutar: node tests/mermas-motivos.unit.js
const assert = require("assert");
const M = require("../backend/mermas-motivos");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("mermas · motivos");

test("hay motivos en 4 secciones y todos con grupo", () => {
  assert.ok(M.MERMAS_MOTIVOS.length >= 10);
  M.MERMAS_MOTIVOS.forEach((m) => { assert.ok(m.k && m.t && m.grupo && m.seccion, "motivo incompleto: " + JSON.stringify(m)); });
  const secs = M.secciones();
  assert.strictEqual(secs.length, 4);
  const totalEnSecs = secs.reduce((s, x) => s + x.motivos.length, 0);
  assert.strictEqual(totalEnSecs, M.MERMAS_MOTIVOS.length, "todos los motivos caen en una sección");
});

test("motivo(k) resuelve y claves únicas", () => {
  assert.strictEqual(M.motivo("caducado").t, "Caducado");
  assert.strictEqual(M.motivo("cortesia").grupo, "cortesía");
  assert.strictEqual(M.motivo("inventado"), null);
  const claves = M.MERMAS_MOTIVOS.map((m) => m.k);
  assert.strictEqual(new Set(claves).size, claves.length, "claves duplicadas");
});

test("parseCantidad admite coma decimal y texto", () => {
  assert.strictEqual(M.parseCantidad("2,5"), 2.5);
  assert.strictEqual(M.parseCantidad("300 g"), 300);
  assert.strictEqual(M.parseCantidad(4), 4);
  assert.ok(!Number.isFinite(M.parseCantidad("")) || M.parseCantidad("") !== M.parseCantidad(""));
});

test("resolverObjetivo mapea ref del catálogo a tipo", () => {
  assert.deepStrictEqual(M.resolverObjetivo("mat:mat-012"), { tipo: "materia", id: "mat-012" });
  assert.deepStrictEqual(M.resolverObjetivo("rec:rec-003"), { tipo: "receta", id: "rec-003" });
  assert.deepStrictEqual(M.resolverObjetivo("prod-croissant-jyq"), { tipo: "producto", id: "prod-croissant-jyq" });
  assert.strictEqual(M.resolverObjetivo("etc-salsa").tipo, "otro");
});

test("validar: exige producto, cantidad>0 y motivo, con mensajes concretos", () => {
  const vacio = M.validar({});
  assert.strictEqual(vacio.ok, false);
  assert.deepStrictEqual(vacio.errores.map((e) => e.campo).sort(), ["cantidad", "motivo", "producto"].sort());
  assert.ok(vacio.errores.every((e) => e.mensaje && e.mensaje.length > 5));
  assert.strictEqual(M.validar({ ref: "mat:mat-012", cantidad: 0, motivo: "caducado" }).ok, false); // cantidad 0
  assert.strictEqual(M.validar({ ref: "mat:mat-012", cantidad: "2,5", motivo: "caducado" }).ok, true);
  assert.strictEqual(M.validar({ nombre: "Croissant", cantidad: 1, motivo: "noexiste" }).ok, false); // motivo inválido
});

if (fallos) { console.error(`\n${fallos} fallo(s) en mermas motivos`); process.exit(1); }
console.log("  mermas motivos OK");
