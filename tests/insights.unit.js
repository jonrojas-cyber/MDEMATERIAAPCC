// Prueba del motor de inteligencia (insights).
// Ejecutar: node tests/insights.unit.js  (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const insights = require("../backend/insights");

const DAY = 86400000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }

console.log("insights · inteligencia del negocio");

// ── Escenario 1: merma concentrada en un producto ──────────────────────────
store.writeAll("proveedores", [{ id: "prov1", nombre: "Café SL" }]);
store.writeAll("compras_productos", [{ id: "cp1", nombre: "Leche avena", proveedor_id: "prov1" }]);
store.writeAll("precios_historico", []);
store.writeAll("inventarios", []);
store.writeAll("materias", []);
store.writeAll("productos", []);
store.writeAll("ventas", []);
store.writeAll("ajustes", [
  { id: "a1", objetivo_nombre: "Croissant", coste_estimado: 40, fecha: iso(2 * DAY) },
  { id: "a2", objetivo_nombre: "Croissant", coste_estimado: 30, fecha: iso(3 * DAY) },
  { id: "a3", objetivo_nombre: "Zumo", coste_estimado: 5, fecha: iso(4 * DAY) },
]);

test("detecta que se tira demasiado de un producto", () => {
  const out = insights.generar(30);
  const i = out.find((x) => x.tipo === "merma_concentrada");
  assert.ok(i, "esperaba un insight de merma concentrada");
  assert.ok(/Croissant/.test(i.titulo), "debe nombrar el producto: " + i.titulo);
});

// ── Escenario 2: merma al alza esta semana vs la anterior ───────────────────
store.writeAll("ajustes", [
  // Semana previa: 20 €
  { id: "b1", objetivo_nombre: "X", coste_estimado: 20, fecha: iso(10 * DAY) },
  // Esta semana: 60 € (+200%)
  { id: "b2", objetivo_nombre: "X", coste_estimado: 60, fecha: iso(1 * DAY) },
]);
test("avisa de que la merma sube respecto a la semana anterior", () => {
  const out = insights.generar(30);
  const i = out.find((x) => x.tipo === "merma_alza");
  assert.ok(i, "esperaba un insight de merma al alza");
  assert.ok(/%/.test(i.titulo), "debe indicar el porcentaje: " + i.titulo);
});

// ── Escenario 3: subida de precio de proveedor ─────────────────────────────
store.writeAll("ajustes", []);
store.writeAll("precios_historico", [
  { id: "ph1", producto_id: "cp1", proveedor_id: "prov1", precio_anterior: 1.0, precio_nuevo: 1.2, fecha: iso(2 * DAY) },
]);
test("detecta subida de precio de un proveedor", () => {
  const out = insights.generar(30);
  const i = out.find((x) => x.tipo === "subida_precio");
  assert.ok(i, "esperaba un insight de subida de precio");
  assert.ok(/20%/.test(i.titulo), "debe calcular +20%: " + i.titulo);
  assert.ok(/Café SL/.test(i.titulo), "debe nombrar al proveedor: " + i.titulo);
});

// ── Escenario 4: merma oculta del último recuento ──────────────────────────
store.writeAll("precios_historico", []);
store.writeAll("inventarios", [
  { id: "inv1", fecha: iso(1 * DAY), merma_oculta_eur: -25, descuadre_eur: -25, lineas_con_descuadre: 3 },
]);
test("señala la merma oculta de un recuento", () => {
  const out = insights.generar(30);
  const i = out.find((x) => x.tipo === "merma_oculta");
  assert.ok(i, "esperaba un insight de merma oculta");
  assert.ok(/25/.test(i.detalle) || /25/.test(i.titulo), "debe indicar el importe: " + i.titulo);
});

// ── Escenario 5: nada que decir cuando no hay señal ────────────────────────
store.writeAll("ajustes", []);
store.writeAll("inventarios", []);
store.writeAll("precios_historico", []);
test("no inventa insights cuando no hay datos", () => {
  const out = insights.generar(30);
  assert.strictEqual(out.length, 0, "no debería producir insights: " + JSON.stringify(out.map((x) => x.tipo)));
});

if (fallos) { console.error(`\n${fallos} prueba(s) de insights fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de insights OK");
