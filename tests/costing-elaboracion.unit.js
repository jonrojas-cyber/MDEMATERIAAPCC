// Encadenado de costes de elaboraciones: el coste de una materia producida por
// una receta (p. ej. "Salsa M") se deriva de SUS ingredientes, y los productos
// que la usan lo heredan → food cost vivo que fluctúa con las facturas.
// Ejecutar: node tests/costing-elaboracion.unit.js
const assert = require("assert");
const costing = require("../backend/costing");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("costing · encadenado de elaboraciones");

// Materias crudas con coste, + la materia producida (coste 0, se deriva).
function setup(precioQuesoCremaPorG) {
  const materias = [
    { id: "m-queso-crema", coste_medio: precioQuesoCremaPorG },
    { id: "m-yogur", coste_medio: 0.002 },
    { id: "m-salsa", coste_medio: 0 }, // producida
    { id: "m-pan", coste_medio: 0.3 },
  ];
  const idxMat = {}; materias.forEach((m) => (idxMat[m.id] = m));
  const recetas = [
    { id: "r-salsa", produce_materia_id: "m-salsa", resultado_base: 1000, ingredientes: [
      { materia_id: "m-queso-crema", cantidad: 600 },
      { materia_id: "m-yogur", cantidad: 400 },
    ] },
  ];
  const idxRec = costing.indiceRecetasProduccion(recetas);
  return { idxMat, idxRec };
}

test("la materia producida deriva su coste de la receta (€/g)", () => {
  const { idxMat, idxRec } = setup(0.005);
  // lote: 600×0,005 + 400×0,002 = 3,0 + 0,8 = 3,8 € / 1000 g = 0,0038 €/g
  const c = costing.costeMateriaEfectivo("m-salsa", idxMat, idxRec);
  assert.ok(Math.abs(c - 0.0038) < 1e-9, "coste/g de la salsa = 0,0038, fue " + c);
});

test("un producto con 30 g de salsa hereda ese coste", () => {
  const { idxMat, idxRec } = setup(0.005);
  const ingredientes = [{ materia_id: "m-pan", cantidad: 0.5 }, { materia_id: "m-salsa", cantidad: 30 }];
  // 0,5×0,3 (pan) + 30×0,0038 (salsa) = 0,15 + 0,114 = 0,264
  const coste = costing.costeEscandallo(ingredientes, idxMat, idxRec);
  assert.ok(Math.abs(coste - 0.264) < 1e-9, "coste producto = 0,264, fue " + coste);
});

test("FLUCTÚA: si sube el coste del queso crema, sube el del producto", () => {
  const barato = costing.costeEscandallo(
    [{ materia_id: "m-salsa", cantidad: 30 }], setup(0.005).idxMat, setup(0.005).idxRec);
  const caro = costing.costeEscandallo(
    [{ materia_id: "m-salsa", cantidad: 30 }], setup(0.010).idxMat, setup(0.010).idxRec);
  assert.ok(caro > barato, "al subir el queso crema, el coste de la salsa (y del producto) sube");
});

test("si la materia producida TIENE coste_medio propio, manda ese (sin regresión)", () => {
  const { idxMat, idxRec } = setup(0.005);
  idxMat["m-salsa"].coste_medio = 0.01; // coste explícito
  const c = costing.costeMateriaEfectivo("m-salsa", idxMat, idxRec);
  assert.strictEqual(c, 0.01);
});

test("guardia anti-ciclos: no entra en bucle infinito", () => {
  const idxMat = { a: { id: "a", coste_medio: 0 }, b: { id: "b", coste_medio: 0 } };
  const idxRec = {
    a: { produce_materia_id: "a", resultado_base: 1, ingredientes: [{ materia_id: "b", cantidad: 1 }] },
    b: { produce_materia_id: "b", resultado_base: 1, ingredientes: [{ materia_id: "a", cantidad: 1 }] },
  };
  // No debe colgarse; devuelve un número finito (0 al cortar el ciclo).
  const c = costing.costeMateriaEfectivo("a", idxMat, idxRec);
  assert.ok(Number.isFinite(c));
});

if (fallos) { console.error(`\n${fallos} prueba(s) fallida(s)`); process.exit(1); }
console.log("costing · encadenado de elaboraciones: OK");
