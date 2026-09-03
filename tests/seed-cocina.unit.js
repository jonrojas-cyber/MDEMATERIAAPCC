// Siembra de la carta de cocina (Crunch, Tostas, Croissants + elaboraciones
// Salsa M y Mayonesa de trufa). Usa un store falso: no toca ficheros.
// Ejecutar: node tests/seed-cocina.unit.js
const assert = require("assert");
const { aplicar, MATERIAS, RECETAS, PRODUCTOS } = require("../backend/seed-cocina");

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

console.log("seed de la carta de cocina");

test("siembra 8 productos, 2 elaboraciones y sus materias (create-if-missing)", () => {
  const data = { materias: [], recetas: [], productos: [], config: [] };
  const st = fakeStore(data);
  const { ranAny, insertados } = aplicar(st);
  assert.ok(ranAny);
  assert.strictEqual(data.productos.length, 8, "8 productos");
  assert.strictEqual(data.recetas.length, 2, "2 elaboraciones");
  assert.strictEqual(data.materias.length, MATERIAS.length, "todas las materias");
  assert.ok(insertados >= 8 + 2 + MATERIAS.length);
  // El lote v2 aplica los PVP reales de la carta.
  const co = data.productos.find((p) => p.id === "prod-crunch-origen");
  assert.strictEqual(co.precio_venta, 4.80, "PVP Crunch Origen 4,80 €");
  assert.strictEqual(co.pendiente_pvp, false);
  const tc = data.productos.find((p) => p.id === "prod-tosta-coleccion");
  assert.strictEqual(tc.precio_venta, 4.00, "PVP Tosta Colección 4,00 €");
});

test("es idempotente: segunda pasada no duplica", () => {
  const data = { materias: [], recetas: [], productos: [], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const antes = data.productos.length + data.materias.length + data.recetas.length;
  const r2 = aplicar(st); // el flag ya está → no hace nada
  assert.strictEqual(r2.ranAny, false);
  assert.strictEqual(data.productos.length + data.materias.length + data.recetas.length, antes);
});

test("no respawnea lo borrado: si el flag existe, no re-inserta", () => {
  const data = { materias: [], recetas: [], productos: [], config: [{ id: "cocina_seed_v1", hecho: true }, { id: "cocina_seed_v2_pvp", hecho: true }] };
  const st = fakeStore(data);
  const { ranAny } = aplicar(st);
  assert.strictEqual(ranAny, false);
  assert.strictEqual(data.productos.length, 0);
});

test("integridad del escandallo: toda materia referenciada existe", () => {
  const ids = new Set(MATERIAS.map((m) => m.id));
  const refs = [];
  PRODUCTOS.forEach((p) => p.ingredientes.forEach((i) => refs.push(i.materia_id)));
  RECETAS.forEach((r) => r.ingredientes.forEach((i) => refs.push(i.materia_id)));
  const huerfanas = refs.filter((id) => !ids.has(id));
  assert.deepStrictEqual(huerfanas, [], "no debe haber materias huérfanas: " + huerfanas.join(", "));
});

test("Salsa M produce su materia y suma 2216 g; Mayo trufa 550 g (10% trufa)", () => {
  const salsa = RECETAS.find((r) => r.id === "rec-coc-salsa-m");
  assert.strictEqual(salsa.produce_materia_id, "mat-coc-salsa-m");
  const suma = salsa.ingredientes.reduce((s, i) => s + i.cantidad, 0);
  assert.strictEqual(Math.round(suma * 10) / 10, 2217);
  const mayo = RECETAS.find((r) => r.id === "rec-coc-mayo-trufa");
  assert.strictEqual(mayo.produce_materia_id, "mat-coc-mayo-trufa");
  assert.strictEqual(mayo.ingredientes.reduce((s, i) => s + i.cantidad, 0), 550);
});

test("gramajes reales, no estimados; PVP pendiente", () => {
  assert.ok(PRODUCTOS.every((p) => p.cantidades_estimadas === false));
  assert.ok(PRODUCTOS.every((p) => p.pendiente_pvp === true));
  const crunchOrigen = PRODUCTOS.find((p) => p.id === "prod-crunch-origen");
  assert.strictEqual(crunchOrigen.ingredientes.find((i) => i.materia_id === "mat-coc-jamon").cantidad, 65);
});

test("costing calcula el escandallo (coste 0 mientras las materias están pendientes)", () => {
  const costing = require("../backend/costing");
  const idx = {}; MATERIAS.forEach((m) => (idx[m.id] = m));
  const p = PRODUCTOS.find((x) => x.id === "prod-crunch-origen");
  const coste = costing.costeEscandallo(p.ingredientes, idx);
  assert.strictEqual(coste, 0, "coste 0 hasta que entren las facturas");
});

if (fallos) { console.error(`\n${fallos} prueba(s) fallida(s)`); process.exit(1); }
console.log("seed de la carta de cocina: OK");
