// Ágora · el CRON de CSV heredado no reimporta el mismo fichero (agora.3).
// Antes, cada hora reimportaba el mismo CSV y duplicaba las ventas.
// Ejecutar: node tests/agora-cron-idempotente.unit.js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const store = require("../backend/data-store");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

// data-store en memoria.
const db = { productos: [{ id: "p1", nombre: "Café", ingredientes: [] }], materias: [], ventas: [], config: [], sincronizaciones: [] };
store.readAll = (n) => (db[n] || (db[n] = []));
store.writeAll = (n, a) => { db[n] = a; };
store.insert = (n, o) => { (db[n] = db[n] || []).push(o); return o; };
store.update = (n, id, p) => { const x = (db[n] || []).find((y) => y.id === id); if (x) Object.assign(x, p); return x; };
store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
store.nextId = (p, n) => p + "-" + ((db[n] || []).length + 1);
store.flush = async () => {};

const agora = require("../backend/agora");
const f = path.join(os.tmpdir(), "agora-cron-" + Date.now() + ".csv");
process.env.AGORA_CSV_PATH = f;

console.log("Ágora · idempotencia del cron de CSV");

test("primera pasada importa; segunda con el MISMO fichero NO reimporta", () => {
  fs.writeFileSync(f, "producto,cantidad,importe\nCafé,1,2\n", "utf8");
  agora.cronImport();
  const n1 = db.ventas.length;
  assert.ok(n1 > 0, "la primera pasada importa");
  agora.cronImport();
  assert.strictEqual(db.ventas.length, n1, "el mismo fichero no se reimporta");
});

test("si el fichero CAMBIA, vuelve a importar", () => {
  const antes = db.ventas.length;
  fs.writeFileSync(f, "producto,cantidad,importe\nCafé,1,2\nCafé,1,2\n", "utf8");
  agora.cronImport();
  assert.ok(db.ventas.length > antes, "con contenido nuevo sí importa");
});

try { fs.unlinkSync(f); } catch (e) {}
delete process.env.AGORA_CSV_PATH;

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
