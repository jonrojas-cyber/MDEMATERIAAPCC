// Medidor de fiabilidad de datos (Fase C): clasifica cada área en real/parcial/
// pendiente y da el % + la lista de acciones para cuadrar a cero.
// Ejecutar: node tests/fiabilidad.unit.js (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const fiab = require("../backend/fiabilidad");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

const ENT = ["materias", "productos", "ventas", "inventarios", "stock_movements", "financial_accounts", "staff_finance", "assets", "fixed_costs", "recetas", "debts"];
function limpiar() { ENT.forEach((e) => store.writeAll(e, [])); }

console.log("fiabilidad de los datos · real vs estimado (Fase C)");

test("todo real en las 7 áreas → 100 % fiable y sin checklist", () => {
  limpiar();
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "kg", coste_medio: 20, disponibilidad_actual: 5 }]);
  store.writeAll("inventarios", [{ id: "inv1", fecha: "2026-10-01T10:00:00.000Z", lineas: [], total_lineas: 0, lineas_con_descuadre: 0, descuadre_eur: 0, merma_oculta_eur: 0 }]);
  store.writeAll("financial_accounts", [{ id: "a1", name: "Banco", type: "banco", balance: 1000, saldo_extracto: 1000, active: true }]);
  store.writeAll("staff_finance", [{ id: "s1", nombre: "Moni", activo: true, bruto_mensual: 1200, num_pagas: 12 }]);
  store.writeAll("assets", [{ id: "ac1", nombre: "Cafetera", compra: 3000, vida_util_meses: 60 }]);
  store.writeAll("fixed_costs", [{ id: "f1", name: "Alquiler", amount: 600, active: true, confirmado_en: "2026-10-01" }]);
  const r = fiab.informe(Date.parse("2026-10-19T12:00:00Z"));
  assert.strictEqual(r.fiabilidad_pct, 100, "100 %");
  assert.strictEqual(r.veredicto, "fiable");
  assert.strictEqual(r.checklist.length, 0, "sin acciones pendientes");
});

test("vacío/estimado → fiabilidad baja y checklist con acciones concretas", () => {
  limpiar();
  // Materia SIN coste → food_cost parcial; sin inventario → pendiente; sin cuentas,
  // sin staff, sin activos, sin fijos → pendientes.
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "kg", coste_medio: 0, disponibilidad_actual: 5 }]);
  const r = fiab.informe(Date.parse("2026-10-19T12:00:00Z"));
  assert.ok(r.fiabilidad_pct < 50, `fiabilidad baja (${r.fiabilidad_pct})`);
  assert.ok(r.checklist.length >= 4, "varias acciones pendientes");
  const foodCost = r.dominios.find((d) => d.clave === "food_cost");
  assert.strictEqual(foodCost.estado, "parcial", "una materia sin coste = parcial");
  assert.strictEqual(foodCost.pendientes, 1, "1 materia sin coste");
  const personal = r.dominios.find((d) => d.clave === "personal");
  assert.strictEqual(personal.estado, "pendiente", "sin staff_finance = pendiente");
});

test("al cargar nóminas reales, el área de personal pasa a real y sube el %", () => {
  limpiar();
  const antes = fiab.informe(Date.now());
  store.writeAll("staff_finance", [{ id: "s1", nombre: "Moni", activo: true, bruto_mensual: 1200, num_pagas: 14 }]);
  const despues = fiab.informe(Date.now());
  assert.strictEqual(despues.dominios.find((d) => d.clave === "personal").estado, "real");
  assert.ok(despues.fiabilidad_pct > antes.fiabilidad_pct, "la fiabilidad sube al cargar datos reales");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de fiabilidad fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de fiabilidad OK");
