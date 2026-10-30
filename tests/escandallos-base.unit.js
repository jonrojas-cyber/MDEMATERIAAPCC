// Coste de materia base: el café/matcha se valoran con las RECETAS × el coste real de
// las materias (de las facturas); comida real del LAB; respaldo estimado si falta la
// materia. Precedencia en costing: coste propio > escandallo > base.
// Ejecutar: node tests/escandallos-base.unit.js (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const costing = require("../backend/costing");
const base = require("../backend/escandallos-base");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
function cerca(a, b, m) { assert.ok(Math.abs(a - b) < 0.01, `${m} (${a} vs ${b})`); }

// Materias con coste (como las deja una factura): café €/g, matcha €/g, leche €/ml.
function conMaterias() {
  store.writeAll("materias", [
    { id: "m1", nombre: "Café Brasil (espresso)", unidad: "g", coste_medio: 0.0239 },
    { id: "m2", nombre: "Matcha base", unidad: "g", coste_medio: 0.20 },
    { id: "m3", nombre: "Leche fresca", unidad: "ml", coste_medio: 0.001 },
  ]);
}

console.log("coste de materia base · recetas valoradas con tus materias");

test("café/matcha: se valoran con la RECETA × el coste real de las materias (facturas)", () => {
  conMaterias();
  // flat white = 18 g café × 0,0239 + 180 ml leche × 0,001 = 0,4302 + 0,18 = 0,6102
  const fw = base.coste("Flatwhite");
  cerca(fw.coste, 0.6102, "flatwhite desde la receta");
  assert.strictEqual(fw.fuente, "facturas", "coste derivado de tus facturas");
  // matcha latte = 2 g × 0,20 + 200 ml × 0,001 = 0,40 + 0,20 = 0,60
  cerca(base.coste("Matcha latte").coste, 0.60, "matcha latte desde la receta");
  cerca(base.coste("Espresso").coste, 0.2151, "espresso = 9 g café");
});

test("sin la materia emparejada, cae al respaldo estimado", () => {
  store.writeAll("materias", []); // sin café/matcha/leche
  const fw = base.coste("Flatwhite");
  cerca(fw.coste, 0.55, "respaldo PLANO del flat white");
  assert.strictEqual(fw.fuente, "estimado");
});

test("comida: coste real del escandallo del LAB (fijo)", () => {
  cerca(base.coste("Crunch origen").coste, 1.48, "crunch origen");
  assert.strictEqual(base.coste("Crunch origen").fuente, "escandallo");
  cerca(base.coste("Tosta colección").coste, 1.43, "tosta colección con acento");
  assert.strictEqual(base.coste("Producto que no existe"), null, "desconocido → null");
});

test("costing: usa la base; el coste_materia propio del producto MANDA", () => {
  conMaterias();
  const idxMat = costing.indiceMaterias(store.readAll("materias"));
  cerca(costing.costeProducto({ id: "p1", nombre: "Latte" }, idxMat), 0.6502, "latte desde receta");
  cerca(costing.costeProducto({ id: "p2", nombre: "Latte", coste_materia: 0.50 }, idxMat), 0.50, "coste propio gana");
  cerca(costing.costeProducto({ id: "p3", nombre: "No mapeado" }, idxMat), 0, "sin coste = 0 (no inventa)");
});

test("food cost automático sobre ventas (café + comida), sin escandallos propios", () => {
  conMaterias();
  store.writeAll("productos", [{ id: "pr1", nombre: "Crunch origen" }, { id: "pr2", nombre: "Flatwhite" }]);
  const hoy = new Date().toISOString();
  store.writeAll("ventas", [
    { id: "v1", producto_id: "pr1", producto: "Crunch origen", cantidad: 10, importe_neto: 47.27, fecha: hoy },
    { id: "v2", producto_id: "pr2", producto: "Flatwhite", cantidad: 20, importe_neto: 40, fecha: hoy },
  ]);
  const financials = require("../backend/financials");
  const idxMat = costing.indiceMaterias(store.readAll("materias"));
  const idxProd = { byId: { pr1: { id: "pr1", nombre: "Crunch origen" }, pr2: { id: "pr2", nombre: "Flatwhite" } }, byName: {} };
  const r = { desde: Date.parse(hoy) - 3600000, hasta: Date.parse(hoy) + 3600000 };
  const coste = financials.costeMateriaVendidaEnRango(r, idxMat, idxProd);
  // 10×1,48 + 20×0,6102 = 14,8 + 12,204 = 27,004
  cerca(coste, 27.00, "coste de materia vendida (comida real + café por receta)");
});

if (fallos) { console.error(`\n${fallos} prueba(s) del coste base fallaron`); process.exit(1); }
console.log("\nTodas las pruebas del coste base OK");
