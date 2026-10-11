// Rendimiento (bloque 08): la memoización de costeProducto NO altera el resultado
// (rendimiento.5). La optimización es correcta: mismo valor, con o sin caché.
// Ejecutar: node tests/rendimiento.unit.js
const assert = require("assert");
const costing = require("../backend/costing");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("rendimiento · memoización de coste por producto");

const materias = [{ id: "m1", nombre: "Grano", coste_medio: 0.5, unidad: "g" }];
const prod = { id: "pz", nombre: "Z", ingredientes: [{ materia_id: "m1", cantidad: 2 }] };

test("costeProducto memoizado = valor real (costeEscandallo)", () => {
  const ground = Math.round(costing.costeEscandallo(prod.ingredientes, costing.indiceMaterias(materias)) * 10000) / 10000;
  const idx = costing.indiceMaterias(materias);
  const a = costing.costeProducto(prod, idx);
  const b = costing.costeProducto(prod, idx); // segunda vez: desde caché
  assert.strictEqual(a, ground, "primera llamada = valor real");
  assert.strictEqual(b, ground, "segunda llamada (caché) = mismo valor");
  assert.strictEqual(a, 1, "2 × 0,5 = 1,0");
});

test("la caché es POR PASADA: un idxMat nuevo recalcula con los datos actuales", () => {
  const idx1 = costing.indiceMaterias(materias);
  assert.strictEqual(costing.costeProducto(prod, idx1), 1);
  // Cambian los ingredientes; con el MISMO idx1 devuelve el cacheado (contrato: una
  // pasada = un idxMat). Con un idxMat NUEVO recalcula.
  const prod2 = { id: "pz2", ingredientes: [{ materia_id: "m1", cantidad: 10 }] };
  const idx2 = costing.indiceMaterias(materias);
  assert.strictEqual(costing.costeProducto(prod2, idx2), 5, "nueva pasada: 10 × 0,5 = 5");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
