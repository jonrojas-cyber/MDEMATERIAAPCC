// Siembra de proveedores reales: carga Málaga Costa Fruit SL + sus 10 artículos
// con precio y stock reales del albarán, hace UPSERT (corrige placeholders) y es
// idempotente por flag. Ejecutar: node tests/seed-proveedores.unit.js
const assert = require("assert");
const { aplicar } = require("../backend/seed-proveedores");

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

test("siembra Málaga Costa Fruit con 10 artículos, precio y stock reales", () => {
  const data = { proveedores: [], materias: [], config: [] };
  const st = fakeStore(data);
  const { ranAny } = aplicar(st);
  assert.ok(ranAny);
  const prov = data.proveedores.find((p) => p.id === "prov-fruteria");
  assert.strictEqual(prov.nombre, "Málaga Costa Fruit SL");
  assert.strictEqual(prov.cif, "B-01751502");
  assert.strictEqual(prov.productos_asociados.length, 10);
  assert.strictEqual(data.materias.length, 10);
  // Precio real (€/g) y stock real (g) de un par de artículos del albarán.
  const kaffir = data.materias.find((m) => m.id === "mat-fru-kaffir");
  assert.strictEqual(kaffir.coste_medio, 0.0115);           // 11,50 €/kg
  assert.strictEqual(kaffir.disponibilidad_actual, 4000);   // 4,00 kg
  const naranja = data.materias.find((m) => m.id === "mat-fru-naranja");
  assert.strictEqual(naranja.coste_medio, 0.00125);         // 1,25 €/kg
  assert.strictEqual(naranja.disponibilidad_actual, 15000); // 15,00 kg
  // El stock total cuadra con el neto del albarán (53,80 kg).
  const totalG = data.materias.reduce((s, m) => s + m.disponibilidad_actual, 0);
  assert.strictEqual(totalG, 53800);
  // Todas con proveedor, gramos y lote de trazabilidad.
  assert.ok(data.materias.every((m) => m.proveedor_id === "prov-fruteria" && m.unidad === "g" && m.lote_proveedor));
  assert.ok(data.config.some((c) => c.id === "proveedores_seed_v2_costa_fruit"));
});

test("upsert: corrige un placeholder existente (coste 0 / stock 0 → real)", () => {
  const data = {
    proveedores: [{ id: "prov-fruteria", nombre: "Frutería" }],
    materias: [{ id: "mat-fru-lima", nombre: "Lima", coste_medio: 0, disponibilidad_actual: 0 }],
    config: [],
  };
  const st = fakeStore(data);
  aplicar(st);
  assert.strictEqual(data.proveedores.find((p) => p.id === "prov-fruteria").nombre, "Málaga Costa Fruit SL");
  const lima = data.materias.find((m) => m.id === "mat-fru-lima");
  assert.strictEqual(lima.coste_medio, 0.00375);            // 3,75 €/kg
  assert.strictEqual(lima.disponibilidad_actual, 4800);    // 4,80 kg
  assert.strictEqual(data.materias.length, 10);            // añade las otras 9
});

test("es idempotente: correr dos veces no duplica ni re-toca", () => {
  const data = { proveedores: [], materias: [], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const r2 = aplicar(st);                 // flag ya puesto → no vuelve a correr
  assert.strictEqual(r2.ranAny, false);
  assert.strictEqual(data.proveedores.length, 1);
  assert.strictEqual(data.materias.length, 10);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en seed-proveedores`); process.exit(1); }
console.log("  seed-proveedores OK");
