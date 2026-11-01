// Auditoría de escandallos: por producto, ingrediente a ingrediente, el origen del
// coste de cada materia (compra / elaboración / estimado / a mano / sin precio) y el
// estado del escandallo (enlazado / parcial / incompleto / coste a mano / sin escandallo).
// Ejecutar: node tests/auditoria-escandallos.unit.js

const assert = require("assert");
const store = require("../backend/data-store");
const aud = require("../backend/auditoria-escandallos");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
function cerca(a, b, m) { assert.ok(Math.abs(a - b) < 0.01, `${m} (${a} vs ${b})`); }
function prod(d, nombre) { return d.productos.find((p) => p.nombre === nombre); }

function sembrar() {
  store.writeAll("materias", [
    { id: "mc", nombre: "Café Brasil", unidad: "g", coste_medio: 0.02, precio_compra: 0.02 }, // de compra
    { id: "me", nombre: "Leche avena", unidad: "ml", coste_medio: 0.001, coste_estimado: true }, // estimada
    { id: "ms", nombre: "Azúcar", unidad: "g", coste_medio: 0, pendiente_coste: true },          // sin precio
    { id: "mman", nombre: "Sal", unidad: "g", coste_medio: 0.001 },                               // a mano
    { id: "mel", nombre: "Salsa verde", unidad: "g", coste_medio: 0.01 },                         // elaboración
  ]);
  store.writeAll("recetas", [{ id: "r1", nombre: "Salsa verde", produce_materia_id: "mel" }]);
  store.writeAll("productos", [
    { id: "p1", nombre: "Espresso", ingredientes: [{ materia_id: "mc", cantidad: 18 }] },
    { id: "p2", nombre: "Latte", ingredientes: [{ materia_id: "mc", cantidad: 18 }, { materia_id: "me", cantidad: 200 }] },
    { id: "p3", nombre: "Dulce casero", ingredientes: [{ materia_id: "ms", cantidad: 50 }] },
    { id: "p4", nombre: "Agua", coste_materia: 0.35 },
    { id: "p5", nombre: "Tosta rara" },
    { id: "p6", nombre: "Bowl", ingredientes: [{ materia_id: "mel", cantidad: 30 }] },
  ]);
}

console.log("auditoría de escandallos · ¿real y enlazado a la compra?");

test("cada materia del escandallo lleva su ORIGEN de coste; el estado del producto es correcto", () => {
  sembrar();
  const d = aud.auditar();
  assert.strictEqual(d.total, 6, "6 productos");

  const esp = prod(d, "Espresso");
  assert.strictEqual(esp.estado, "enlazado", "todo de compra → enlazado");
  assert.strictEqual(esp.lineas[0].origen, "compra");
  cerca(esp.lineas[0].coste_linea, 0.36, "18 g × 0,02");

  const latte = prod(d, "Latte");
  assert.strictEqual(latte.estado, "parcial", "una materia estimada → parcial");
  assert.deepStrictEqual(latte.lineas.map((l) => l.origen), ["compra", "estimado"]);

  const dulce = prod(d, "Dulce casero");
  assert.strictEqual(dulce.estado, "incompleto", "materia sin precio → incompleto");
  assert.strictEqual(dulce.lineas[0].origen, "sin_precio");

  const agua = prod(d, "Agua");
  assert.strictEqual(agua.estado, "coste_directo", "coste declarado a mano, sin escandallo");
  assert.strictEqual(agua.tiene_escandallo, false);

  assert.strictEqual(prod(d, "Tosta rara").estado, "sin_escandallo");

  const bowl = prod(d, "Bowl");
  assert.strictEqual(bowl.estado, "enlazado", "materia de elaboración cuenta como enlazada");
  assert.strictEqual(bowl.lineas[0].origen, "elaboracion");
});

test("resumen: recuento por estado, líneas enlazadas y % de enlace a compra", () => {
  sembrar();
  const d = aud.auditar();
  assert.strictEqual(d.por_estado.enlazado, 2, "Espresso + Bowl");
  assert.strictEqual(d.por_estado.parcial, 1);
  assert.strictEqual(d.por_estado.incompleto, 1);
  assert.strictEqual(d.por_estado.coste_directo, 1);
  assert.strictEqual(d.por_estado.sin_escandallo, 1);
  // Líneas: Espresso 1 + Latte 2 + Dulce 1 + Bowl 1 = 5; enlazadas: Café(x2) + Salsa = 3.
  assert.strictEqual(d.lineas_total, 5);
  assert.strictEqual(d.lineas_enlazadas, 3);
  cerca(d.enlace_pct, 0.6, "3/5 de los ingredientes enlazados a compra");
});

test("orden accionable: lo peor primero (sin escandallo / incompleto)", () => {
  sembrar();
  const d = aud.auditar();
  assert.strictEqual(d.productos[0].estado, "sin_escandallo", "lo que no tiene escandallo, primero");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de la auditoría de escandallos fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de la auditoría de escandallos OK");
