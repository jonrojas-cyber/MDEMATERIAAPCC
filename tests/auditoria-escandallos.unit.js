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

test("reparaciones: prioridad, cruce con el motor y guardas de cantidad", () => {
  store.writeAll("materias", [
    { id: "mc", nombre: "Café", unidad: "g", coste_medio: 0.02, precio_compra: 0.02 },                    // compra
    { id: "mte", nombre: "Matcha", unidad: "g", coste_medio: 0.20, precio_compra: 0.20, coste_estimado: true }, // estimado AUNQUE tenga precio_compra
    { id: "maceite", nombre: "Aceite", unidad: "ml", coste_medio: 0.01 },
    { id: "melab", nombre: "Salsa", unidad: "g", coste_medio: 0 },     // elaboración derivada (coste en su receta)
    { id: "mroto", nombre: "Mermelada", unidad: "g", coste_medio: 0 }, // elaboración que NO resuelve
    { id: "msin", nombre: "Especia", unidad: "g", coste_medio: 0, pendiente_coste: true },
  ]);
  store.writeAll("recetas", [
    { id: "r1", nombre: "Salsa", produce_materia_id: "melab", resultado_base: 100, ingredientes: [{ materia_id: "maceite", cantidad: 100 }] },
    { id: "r2", nombre: "Mermelada", produce_materia_id: "mroto" }, // sin resultado_base → no resuelve
  ]);
  store.writeAll("productos", [
    { id: "pe", nombre: "Matcha latte", ingredientes: [{ materia_id: "mte", cantidad: 2 }] },
    { id: "pel", nombre: "Bowl salsa", ingredientes: [{ materia_id: "melab", cantidad: 50 }] },
    { id: "proto", nombre: "Tosta rota", ingredientes: [{ materia_id: "mroto", cantidad: 30 }] },
    { id: "pdir", nombre: "Refresco", coste_materia: 0.50, ingredientes: [{ materia_id: "msin", cantidad: 10 }] },
    { id: "pcero", nombre: "Café con especia", ingredientes: [{ materia_id: "mc", cantidad: 18 }, { materia_id: "msin", cantidad: 0 }] },
    { id: "pneg", nombre: "Café negativo", ingredientes: [{ materia_id: "mc", cantidad: -18 }] },
  ]);
  const d = aud.auditar();

  const ml = prod(d, "Matcha latte");
  assert.strictEqual(ml.lineas[0].origen, "estimado", "coste_estimado gana a precio_compra");
  assert.strictEqual(ml.estado, "sin_compra", "tiene coste pero sin enlace a compra");

  const bowl = prod(d, "Bowl salsa");
  assert.strictEqual(bowl.lineas[0].origen, "elaboracion");
  cerca(bowl.lineas[0].coste_unit, 0.01, "coste €/g de la salsa DESDE su receta (no 0)");
  cerca(bowl.lineas[0].coste_linea, 0.50, "50 g × 0,01 (la línea cuadra con el total)");
  assert.strictEqual(bowl.estado, "enlazado");

  const roto = prod(d, "Tosta rota");
  assert.strictEqual(roto.lineas[0].origen, "sin_precio", "elaboración que no resuelve no es 'enlazado'");
  assert.strictEqual(roto.estado, "incompleto");

  const ref = prod(d, "Refresco");
  assert.strictEqual(ref.estado, "coste_directo", "coste declarado + ingredientes → coste_directo, no incompleto");
  cerca(ref.coste, 0.50, "usa el coste declarado");

  assert.strictEqual(prod(d, "Café con especia").estado, "enlazado", "línea de cantidad 0 no cuenta como incompleto");
  assert.strictEqual(prod(d, "Café negativo").estado, "incompleto", "cantidad negativa → incompleto, nunca 'enlazado'");
});

test("enlace por COMPRA real: artículo en compras aunque no haya precio_compra volcado", () => {
  store.writeAll("materias", [
    { id: "mx", nombre: "Harina", unidad: "g", coste_medio: 0.001 },                                  // a mano, SIN precio_compra
    { id: "mte", nombre: "Matcha", unidad: "g", coste_medio: 0.20, precio_compra: 0.20, coste_estimado: true }, // estimado + relleno, SIN compra real
  ]);
  store.writeAll("recetas", []);
  store.writeAll("compras_productos", [
    { id: "a1", nombre: "Harina de trigo", materia_id: "mx", precio_sin_iva: 0.80, cantidad_formato: 1000, formato: "g" },
  ]);
  store.writeAll("productos", [
    { id: "p1", nombre: "Pan", ingredientes: [{ materia_id: "mx", cantidad: 100 }] },
    { id: "p2", nombre: "Matcha latte", ingredientes: [{ materia_id: "mte", cantidad: 2 }] },
  ]);
  const d = aud.auditar();
  assert.strictEqual(prod(d, "Pan").lineas[0].origen, "compra", "hay compra de Harina → enlazada aunque no tenga precio_compra");
  assert.strictEqual(prod(d, "Pan").estado, "enlazado");
  assert.strictEqual(prod(d, "Matcha latte").lineas[0].origen, "estimado", "matcha estimada SIN compra real → estimado, no 'compra'");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de la auditoría de escandallos fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de la auditoría de escandallos OK");
