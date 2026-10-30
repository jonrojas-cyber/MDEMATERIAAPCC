// Carta y márgenes: el coste de cada producto sale del motor único (costing). Un
// producto sin escandallo ni coste se marca `sin_coste` (NUNCA "margen 100%", que
// sería mentira) y se ordena al final, no encabezando la carta. La reventa (materia
// vendida por pieza) lo costea con el precio de compra real.
// Ejecutar: node tests/carta.unit.js

const assert = require("assert");
const store = require("../backend/data-store");
const carta = require("../backend/routes/carta");
const escandallar = carta.escandallar;

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
function cerca(a, b, m) { assert.ok(Math.abs(a - b) < 0.01, `${m} (${a} vs ${b})`); }

// Invoca el handler GET "/" del router y devuelve el JSON que emite.
function getCarta() {
  const layer = carta.stack.find((l) => l.route && l.route.path === "/" && l.route.methods && l.route.methods.get);
  assert.ok(layer, "no se encontró el handler GET /carta");
  let out = null;
  layer.route.stack[0].handle({ user: { rol: "admin" } }, { json: (x) => { out = x; } }, () => {});
  return out;
}

console.log("carta y márgenes · coste, sin_coste y orden");

test("escandallar: producto sin escandallo ni coste → sin_coste true (no 'margen 100%')", () => {
  store.writeAll("materias", []);
  const p = escandallar({ id: "x", nombre: "Agua", precio_venta: 1.0 }, store.readAll("materias"));
  assert.strictEqual(p.sin_coste, true, "sin coste marcado");
  cerca(p.coste, 0, "coste 0");
});

test("escandallar: reventa (materia por pieza homónima) → costeado, sin_coste false", () => {
  store.writeAll("materias", [{ id: "a1", nombre: "Agua", unidad: "ud", coste_medio: 0.35 }]);
  const p = escandallar({ id: "x", nombre: "Agua", precio_venta: 1.0 }, store.readAll("materias"));
  assert.strictEqual(p.sin_coste, false, "ahora tiene coste");
  cerca(p.coste, 0.35, "coste = precio de compra real");
});

test("GET /carta: cuenta los sin coste y los ordena al final", () => {
  store.writeAll("materias", [
    { id: "m1", nombre: "Café Brasil (espresso)", unidad: "g", coste_medio: 0.0239, categoria: "Café" },
    { id: "m2", nombre: "Leche fresca", unidad: "ml", coste_medio: 0.001, categoria: "Leche" },
  ]);
  store.writeAll("productos", [
    { id: "p1", nombre: "Etiopía", precio_venta: 0.30 }, // café de filtro sin receta → sin coste
    { id: "p2", nombre: "Agua", precio_venta: 1.0 },      // sin materia homónima → sin coste
    { id: "p3", nombre: "Latte", precio_venta: 3.0 },     // costeado por receta × materias reales
  ]);
  const d = getCarta();
  assert.strictEqual(d.total_productos, 3, "tres productos");
  assert.strictEqual(d.productos_sin_coste, 2, "dos sin coste");
  assert.strictEqual(d.productos[0].id, "p3", "el costeado encabeza la carta");
  assert.strictEqual(d.productos[d.productos.length - 1].sin_coste, true, "los sin coste, al final");
  assert.ok(d.food_cost_medio > 0, "la media solo promedia los costeados (no la falsean los 0)");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de carta fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de carta OK");
