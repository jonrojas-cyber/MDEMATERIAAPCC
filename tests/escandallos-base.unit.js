// Respaldo de coste de materia por nombre: hace que el food cost se calcule solo
// aunque el producto de Ágora no tenga escandallo propio. Precedencia: coste_materia
// directo > escandallo > mapa base. Ejecutar: node tests/escandallos-base.unit.js
// (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const costing = require("../backend/costing");
const base = require("../backend/escandallos-base");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
function cerca(a, b, m) { assert.ok(Math.abs(a - b) < 0.001, `${m} (${a} vs ${b})`); }

console.log("respaldo de coste de materia por nombre (food cost automático)");

test("mapa base: resuelve por nombre, normalizando acentos/símbolos", () => {
  cerca(base.coste("Crunch origen").coste, 1.48, "crunch origen (real)");
  assert.strictEqual(base.coste("Crunch origen").fuente, "escandallo");
  cerca(base.coste("Tosta colección").coste, 1.43, "tosta colección con acento");
  cerca(base.coste("LATTE").coste, 0.42, "mayúsculas");
  assert.strictEqual(base.coste("Latte").fuente, "estimado");
  assert.strictEqual(base.coste("Producto que no existe"), null, "desconocido → null");
});

test("costeProducto usa el mapa base cuando el producto no tiene escandallo", () => {
  const idxMat = costing.indiceMaterias([]);
  cerca(costing.costeProducto({ id: "p1", nombre: "Crunch origen" }, idxMat), 1.48, "crunch origen desde el mapa");
  cerca(costing.costeProducto({ id: "p2", nombre: "Limonada equilibrio" }, idxMat), 0.50, "limonada desde el mapa");
  assert.strictEqual(costing.costeProductoDetalle({ id: "p2b", nombre: "Limonada equilibrio" }, idxMat).fuente_coste, "estimado");
});

test("precedencia: el coste_materia propio del producto MANDA sobre el mapa", () => {
  const idxMat = costing.indiceMaterias([]);
  cerca(costing.costeProducto({ id: "p3", nombre: "Latte", coste_materia: 0.55 }, idxMat), 0.55, "coste directo gana al mapa");
});

test("producto sin escandallo y fuera del mapa → coste 0 (no inventa)", () => {
  const idxMat = costing.indiceMaterias([]);
  cerca(costing.costeProducto({ id: "p4", nombre: "Algo que no está" }, idxMat), 0, "desconocido = 0");
});

test("food cost automático sobre ventas: se calcula sin escandallos propios", () => {
  ["ventas", "productos", "materias", "recetas", "config"].forEach((e) => store.writeAll(e, []));
  store.writeAll("productos", [
    { id: "pr1", nombre: "Crunch origen" },   // sin coste propio → usa mapa 1.48
    { id: "pr2", nombre: "Latte" },           // → mapa 0.42
  ]);
  const hoy = new Date().toISOString();
  store.writeAll("ventas", [
    { id: "v1", producto_id: "pr1", producto: "Crunch origen", cantidad: 10, importe: 52, importe_neto: 47.27, fecha: hoy },
    { id: "v2", producto_id: "pr2", producto: "Latte", cantidad: 20, importe: 52, importe_neto: 47.27, fecha: hoy },
  ]);
  const financials = require("../backend/financials");
  const idxMat = costing.indiceMaterias(store.readAll("materias"));
  const idxProd = { byId: { pr1: { id: "pr1", nombre: "Crunch origen" }, pr2: { id: "pr2", nombre: "Latte" } }, byName: {} };
  const r = { desde: Date.parse(hoy) - 3600000, hasta: Date.parse(hoy) + 3600000 };
  const coste = financials.costeMateriaVendidaEnRango(r, idxMat, idxProd);
  // 10×1,48 + 20×0,42 = 14,8 + 8,4 = 23,2 €
  cerca(coste, 23.2, "coste de materia vendida desde el mapa base");
});

if (fallos) { console.error(`\n${fallos} prueba(s) del respaldo de coste fallaron`); process.exit(1); }
console.log("\nTodas las pruebas del respaldo de coste OK");
