// Siembra de proveedores reales: inserta Frutería + sus 10 materias, es
// idempotente (no duplica ni pisa ediciones) y deja el flag en config.
// Ejecutar: node tests/seed-proveedores.unit.js
const assert = require("assert");
const { aplicar, BATCHES } = require("../backend/seed-proveedores");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

function fakeStore(data) {
  return {
    readAll: (e) => data[e] || [],
    findById: (e, id) => (data[e] || []).find((r) => r.id === id) || null,
    insert: (e, r) => { (data[e] = data[e] || []).push(r); return r; },
    update: (e, id, patch) => { const r = (data[e] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
    _data: data,
  };
}

console.log("seed de proveedores reales");

test("siembra la Frutería con sus 10 materias y el flag", () => {
  const data = { proveedores: [], materias: [], config: [] };
  const st = fakeStore(data);
  const { tocados, ranAny } = aplicar(st);
  assert.ok(ranAny);
  const fru = data.proveedores.find((p) => p.id === "prov-fruteria");
  assert.ok(fru, "existe el proveedor Frutería");
  assert.strictEqual(fru.nombre, "Frutería");
  assert.strictEqual(fru.productos_asociados.length, 10);
  assert.strictEqual(data.materias.length, 10);
  // Todas apuntan al proveedor y se pesan en gramos.
  assert.ok(data.materias.every((m) => m.proveedor_id === "prov-fruteria" && m.unidad === "g"));
  assert.ok(data.materias.find((m) => m.nombre === "Hoja de lima kaffir"));
  assert.ok(data.materias.find((m) => m.nombre === "Hierbabuena La Piedra"));
  assert.strictEqual(tocados, 11);                 // 1 proveedor + 10 materias
  assert.ok(data.config.some((c) => c.id === "proveedores_seed_v1_fruteria"));
});

test("es idempotente: correr dos veces no duplica", () => {
  const data = { proveedores: [], materias: [], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const r2 = aplicar(st);              // el flag ya está → no vuelve a tocar
  assert.strictEqual(r2.ranAny, false);
  assert.strictEqual(data.proveedores.length, 1);
  assert.strictEqual(data.materias.length, 10);
});

test("respeta una materia editada con el mismo id (no la pisa)", () => {
  const data = { proveedores: [], materias: [{ id: "mat-fru-lima", nombre: "Lima", coste_medio: 0.004 }], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const lima = data.materias.find((m) => m.id === "mat-fru-lima");
  assert.strictEqual(lima.coste_medio, 0.004, "conserva el coste que ya tenías");
  assert.strictEqual(data.materias.length, 10);    // añade las otras 9, no duplica la lima
});

if (fallos) { console.error(`\n${fallos} fallo(s) en seed-proveedores`); process.exit(1); }
console.log("  seed-proveedores OK");
