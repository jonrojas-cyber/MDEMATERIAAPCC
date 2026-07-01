// Pruebas de la conversión de unidades del albarán al almacén.
// Ejecutar: node tests/unidades.unit.js

const assert = require("assert");
const { convertir } = require("../backend/unidades");

let fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log("  ✓ " + nombre); }
  catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); }
}

console.log("unidades.convertir · albarán → unidad de la materia");

test("kg → g multiplica por 1000", () => {
  const r = convertir(2, "kg", { unidad: "g" });
  assert.strictEqual(r.cantidad, 2000);
  assert.strictEqual(r.ok, true);
});

test("L → ml multiplica por 1000", () => {
  const r = convertir(1.5, "L", { unidad: "ml" });
  assert.strictEqual(r.cantidad, 1500);
  assert.strictEqual(r.ok, true);
});

test("cl → ml multiplica por 10", () => {
  assert.strictEqual(convertir(25, "cl", { unidad: "ml" }).cantidad, 250);
});

test("misma unidad (g → g) queda igual", () => {
  const r = convertir(500, "g", { unidad: "g" });
  assert.strictEqual(r.cantidad, 500);
  assert.strictEqual(r.ok, true);
});

test("sin unidad detectada usa la cantidad tal cual", () => {
  const r = convertir(3, "", { unidad: "ud" });
  assert.strictEqual(r.cantidad, 3);
  assert.strictEqual(r.ok, true);
});

test("unidad de compra propia (caja × factor) usa la conversión de la materia", () => {
  const r = convertir(6, "caja", { unidad: "ud", unidad_compra: "caja", conversion: 12 });
  assert.strictEqual(r.cantidad, 72);
  assert.strictEqual(r.ok, true);
});

test("tolerante a mayúsculas/acentos/plurales (Kilos → g)", () => {
  assert.strictEqual(convertir(1, "Kilos", { unidad: "g" }).cantidad, 1000);
  assert.strictEqual(convertir(2, "Litros", { unidad: "ml" }).cantidad, 2000);
});

test("no convertible (kg → ud) avisa y NO inventa el número", () => {
  const r = convertir(4, "kg", { unidad: "ud" });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.cantidad, 4); // deja lo leído para que el humano lo revise
  assert.ok(/revisa/i.test(r.nota));
});

console.log(fallos ? `\n${fallos} prueba(s) FALLIDA(s)` : "\nTodas las pruebas de unidades OK");
process.exit(fallos ? 1 : 0);
