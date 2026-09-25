// Línea fit: verifica que el escandallo (ingredientes + coste_medio) da el food
// cost esperado por costing. Ejecutar: node tests/seed-fit.unit.js
const assert = require("assert");
const { aplicar, MATERIAS } = require("../backend/seed-fit");
const costing = require("../backend/costing");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

function fakeStore(data) {
  return {
    readAll: (e) => data[e] || [],
    findById: (e, id) => (data[e] || []).find((r) => r.id === id) || null,
    insert: (e, r) => { (data[e] = data[e] || []).push(r); return r; },
    update: (e, id, patch) => { const r = (data[e] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
  };
}

// Materias existentes que reutiliza la línea fit (mismos costes que en el sistema).
const materiasBase = [
  { id: "mat-cafe-brasil", nombre: "Café Brasil", unidad: "g", coste_medio: 0.0239 },
  { id: "mat-009", nombre: "Leche avena", unidad: "ml", coste_medio: 0.0024 },
  { id: "mat-017", nombre: "Agua filtrada", unidad: "ml", coste_medio: 0.0002 },
];

console.log("seed línea fit");

test("crea materias e ingredientes con el coste indicado", () => {
  const data = { materias: [...materiasBase], productos: [], config: [] };
  const r = aplicar(fakeStore(data));
  assert.ok(r.ranAny);
  const prot = data.materias.find((m) => m.id === "mat-proteina");
  assert.strictEqual(prot.coste_medio, 0.028);                 // 28 €/kg
  const coco = data.materias.find((m) => m.id === "mat-agua-coco");
  assert.strictEqual(coco.coste_medio, 0.002);                 // 2 €/L
  const col = data.materias.find((m) => m.id === "mat-colageno-limon");
  assert.ok(Math.abs(col.coste_medio - 20 / 350) < 1e-9);      // 20 €/350 g
  const matcha = data.materias.find((m) => m.id === "mat-matcha");
  assert.strictEqual(matcha.coste_medio, 0.20);                // 200 €/kg
});

test("food cost del Ice Latte proteico ≈ 1,88 € (con lata)", () => {
  const data = { materias: [...materiasBase], productos: [], config: [] };
  aplicar(fakeStore(data));
  const idxMat = costing.indiceMaterias(data.materias);
  const p = data.productos.find((x) => x.id === "prod-fit-ice-latte");
  const coste = costing.costeProducto(p, idxMat);
  // 34×0,0239 + 160×0,0024 + 10×0,028 + 0,40 lata = 1,4766 + 0,40 = 1,8766
  assert.ok(Math.abs(coste - 1.8766) < 0.001, "coste=" + coste);
});

test("food cost del Matcha colágeno ≈ 1,41 € (matcha 200 €/kg + lata)", () => {
  const data = { materias: [...materiasBase], productos: [], config: [] };
  aplicar(fakeStore(data));
  const idxMat = costing.indiceMaterias(data.materias);
  const p = data.productos.find((x) => x.id === "prod-fit-matcha-colageno");
  const coste = costing.costeProducto(p, idxMat);
  // 0,40 matcha + 0,005 agua + 0,32 coco + 0,285714 colágeno + 0,40 lata = 1,410714
  assert.ok(Math.abs(coste - 1.4107) < 0.001, "coste=" + coste);
});

test("es idempotente por flag", () => {
  const data = { materias: [...materiasBase], productos: [], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const n = data.productos.length;
  const r2 = aplicar(st);
  assert.strictEqual(r2.ranAny, false);
  assert.strictEqual(data.productos.length, n);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en seed-fit`); process.exit(1); }
console.log("  seed-fit OK");
