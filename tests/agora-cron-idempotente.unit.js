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
let _seq = 0;
store.nextId = (p) => p + "-" + (++_seq);
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

// ── Idempotencia de la vía manual/email (importarVentas · agora.3) ───────────
console.log("Ágora · idempotencia de importarVentas (manual/email)");

test("reimportar el MISMO CSV (misma fuente+día) NO duplica", () => {
  db.ventas = [];
  const csv = "producto,cantidad,importe,fecha\nCafé,2,4,2026-10-10\n";
  agora.importarVentas(csv, "manual");
  const n1 = db.ventas.length;
  const imp1 = db.ventas.reduce((s, v) => s + v.importe, 0);
  const r = agora.importarVentas(csv, "manual");
  assert.strictEqual(db.ventas.length, n1, "no se duplica al reimportar");
  assert.strictEqual(db.ventas.reduce((s, v) => s + v.importe, 0), imp1, "importe estable");
  assert.ok(r.reemplazadas >= 1, "informa de filas reemplazadas (no añadidas)");
});

test("NO pisa las ventas de OTRA fuente (p. ej. del conector)", () => {
  db.ventas = [{ id: "c1", producto_id: "p1", producto: "Café", cantidad: 1, importe: 2, fecha: "2026-10-10T10:00:00", fuente: "agora" }];
  agora.importarVentas("producto,cantidad,importe,fecha\nCafé,1,2,2026-10-10\n", "manual");
  assert.ok(db.ventas.some((v) => v.fuente === "agora"), "la venta del conector sigue ahí");
  assert.ok(db.ventas.some((v) => v.fuente === "manual"), "y se añade la manual");
});

test("solapamiento PARCIAL: solo reemplaza los días comunes", () => {
  db.ventas = [];
  agora.importarVentas("producto,cantidad,importe,fecha\nCafé,1,2,2026-10-10\nCafé,1,2,2026-10-11\n", "email");
  assert.strictEqual(db.ventas.length, 2);
  // Reimporta solo el día 11 (más otro): el 10 se conserva, el 11 se reemplaza.
  agora.importarVentas("producto,cantidad,importe,fecha\nCafé,3,6,2026-10-11\n", "email");
  const d10 = db.ventas.filter((v) => String(v.fecha).slice(0, 10) === "2026-10-10");
  const d11 = db.ventas.filter((v) => String(v.fecha).slice(0, 10) === "2026-10-11");
  assert.strictEqual(d10.length, 1, "el día 10 se conserva intacto");
  assert.strictEqual(d11.length, 1, "el día 11 se reemplazó (no duplicado)");
  assert.strictEqual(d11[0].cantidad, 3, "con el nuevo contenido");
});

test("stock NEUTRO al reimportar el mismo periodo (revierte + reaplica)", () => {
  db.ventas = [];
  db.productos = [{ id: "p1", nombre: "Café", ingredientes: [{ materia_id: "m1", cantidad: 2 }] }];
  db.materias = [{ id: "m1", nombre: "Grano", disponibilidad_actual: 100, unidad: "g" }];
  const csv = "producto,cantidad,importe,fecha\nCafé,3,6,2026-10-10\n";
  agora.importarVentas(csv, "manual");
  assert.strictEqual(db.materias[0].disponibilidad_actual, 94, "3×2 = 6 descontados");
  agora.importarVentas(csv, "manual"); // reimport: revierte 6 + descuenta 6 = neto 0
  assert.strictEqual(db.materias[0].disponibilidad_actual, 94, "reimportar no vuelve a descontar");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
