// Retención de movimientos de stock (rendimiento.7): separar antiguos/recientes y
// archivar a disco acotando la tabla viva, SIN perder datos.
// Ejecutar: node tests/retencion-movimientos.unit.js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const retencion = require("../backend/retencion");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("retención · archivado de movimientos de stock (rendimiento.7)");

const NOW = Date.parse("2026-10-11T12:00:00Z");
const DAY = 86400000;
const movs = [
  { id: "m1", created_at: new Date(NOW - 20 * 30 * DAY).toISOString() }, // ~20 meses (antiguo)
  { id: "m2", created_at: new Date(NOW - 19 * 30 * DAY).toISOString() }, // ~19 meses (antiguo)
  { id: "m3", created_at: new Date(NOW - 2 * 30 * DAY).toISOString() },  // ~2 meses (reciente)
  { id: "m4" }, // sin fecha → se conserva como reciente (nunca se archiva a ciegas)
];

test("particionar separa antiguos (< cutoff) de recientes y conserva los sin fecha", () => {
  const cutoff = retencion.cutoffMeses(18, NOW);
  const { recientes, antiguos } = retencion.particionar(movs, cutoff);
  assert.deepStrictEqual(antiguos.map((m) => m.id).sort(), ["m1", "m2"], "los > 18 meses");
  assert.deepStrictEqual(recientes.map((m) => m.id).sort(), ["m3", "m4"], "reciente + sin fecha");
});

test("cutoffMeses(0) → null (no archiva nada)", () => {
  assert.strictEqual(retencion.cutoffMeses(0, NOW), null);
});

test("archivarMovimientos escribe a disco y recorta la tabla viva SIN perder datos", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-ret-"));
  const db = { stock_movements: movs.slice() };
  const store = { readAll: (n) => db[n] || [], writeAll: (n, a) => { db[n] = a; } };
  const r = retencion.archivarMovimientos({ store, meses: 18, now: NOW, dir });
  assert.strictEqual(r.archivados, 2, "2 archivados");
  assert.strictEqual(r.conservados, 2, "2 conservados en la tabla viva");
  assert.strictEqual(db.stock_movements.length, 2, "tabla viva acotada");
  // Lo archivado está en disco (no se pierde) y suma el total original.
  const archivado = JSON.parse(fs.readFileSync(r.fichero, "utf8"));
  assert.strictEqual(archivado.length, 2);
  assert.strictEqual(archivado.length + db.stock_movements.length, movs.length, "cero pérdida de datos");
});

test("sin movimientos antiguos no toca nada ni crea fichero", () => {
  const db = { stock_movements: [{ id: "x", created_at: new Date(NOW).toISOString() }] };
  const store = { readAll: (n) => db[n] || [], writeAll: (n, a) => { db[n] = a; } };
  const r = retencion.archivarMovimientos({ store, meses: 18, now: NOW });
  assert.strictEqual(r.archivados, 0);
  assert.strictEqual(r.fichero, null);
  assert.strictEqual(db.stock_movements.length, 1, "intacta");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
