// GUARDIÁN ECONÓMICO (regla innegociable nº2): el rol `equipo` nunca ve coste,
// precio de coste ni margen. stripEconomia elimina en profundidad todo campo
// económico; precio_venta / pvp / importe (lo que SÍ puede ver) se conservan.
// Ejecutar: node tests/economia-guard.unit.js
const assert = require("assert");
const { stripEconomia, esCampoEconomico, filtrarRespuestas } = require("../backend/economia-guard");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("guardián económico (regla nº2)");

const OCULTAR = [
  "coste", "coste_medio", "coste_neto", "coste_estimado", "coste_total", "coste_por_litro",
  "coste_produccion_hoy", "coste_mermas_hoy", "coste_materia", "coste_laboral",
  "precio_compra", "precio_pactado", "precio_recomendado",
  "margen", "margen_bruto", "margen_euros", "margen_medio_carta", "margen_pct", "margen_objetivo", "margen_operativo_pct",
  "food_cost", "food_cost_pct", "food_cost_medio", "food_cost_objetivo",
  "valor_stock_total", "valor_stock_actual",
  "beneficio", "beneficio_operativo", "beneficio_neto_estimado", "ebitda_mes", "prime_cost", "rentabilidad_pct",
  "escenarios",
];
const CONSERVAR = ["nombre", "precio_venta", "pvp", "importe", "importe_neto", "disponibilidad_actual", "iva", "stock_minimo", "cantidad", "unidad", "id"];

test("oculta todos los campos económicos", () => {
  OCULTAR.forEach((k) => assert.strictEqual(esCampoEconomico(k), true, `debería ocultar ${k}`));
});

test("conserva lo que el equipo SÍ puede ver (precio_venta, pvp, importe, stock…)", () => {
  CONSERVAR.forEach((k) => assert.strictEqual(esCampoEconomico(k), false, `NO debería ocultar ${k}`));
});

test("strip elimina en profundidad (objetos y arrays anidados) sin mutar el original", () => {
  const original = {
    nombre: "Brasa", precio_venta: 8.5, iva: 10,
    coste: 2.1, margen_bruto: 0.75, food_cost: 0.25, precio_recomendado: 9.2,
    escenarios: { fc20: 10, fc25: 8 },
    ingredientes: [{ nombre: "pan", cantidad: 1, coste: 0.4 }, { nombre: "aguacate", cantidad: 0.5, coste_estimado: 0.9 }],
    kpis: { valor_stock_total: 1234, ventas_hoy: 700, margen_medio_carta: 0.7 },
  };
  const limpio = stripEconomia(original);
  // No deja ningún campo económico (en ningún nivel).
  assert.strictEqual(limpio.coste, undefined);
  assert.strictEqual(limpio.margen_bruto, undefined);
  assert.strictEqual(limpio.food_cost, undefined);
  assert.strictEqual(limpio.precio_recomendado, undefined);
  assert.strictEqual(limpio.escenarios, undefined);
  assert.strictEqual(limpio.ingredientes[0].coste, undefined);
  assert.strictEqual(limpio.ingredientes[1].coste_estimado, undefined);
  assert.strictEqual(limpio.kpis.valor_stock_total, undefined);
  assert.strictEqual(limpio.kpis.margen_medio_carta, undefined);
  // Conserva lo operativo y comercial.
  assert.strictEqual(limpio.nombre, "Brasa");
  assert.strictEqual(limpio.precio_venta, 8.5);
  assert.strictEqual(limpio.iva, 10);
  assert.strictEqual(limpio.ingredientes[0].nombre, "pan");
  assert.strictEqual(limpio.ingredientes[0].cantidad, 1);
  assert.strictEqual(limpio.kpis.ventas_hoy, 700);
  // No muta el original.
  assert.strictEqual(original.coste, 2.1);
  assert.strictEqual(original.ingredientes[0].coste, 0.4);
});

test("filtrarRespuestas limpia para NO-admin y es transparente para admin", () => {
  function fakeRes() { const r = { enviado: null }; r.json = (b) => { r.enviado = b; return r; }; return r; }
  // Equipo: la respuesta sale limpia.
  const rEquipo = fakeRes();
  filtrarRespuestas({ user: { rol: "equipo" } }, rEquipo, () => {});
  rEquipo.json({ nombre: "x", coste_medio: 3, precio_venta: 5 });
  assert.strictEqual(rEquipo.enviado.coste_medio, undefined);
  assert.strictEqual(rEquipo.enviado.precio_venta, 5);
  // Admin: pasa tal cual.
  const rAdmin = fakeRes();
  filtrarRespuestas({ user: { rol: "admin" } }, rAdmin, () => {});
  rAdmin.json({ nombre: "x", coste_medio: 3, precio_venta: 5 });
  assert.strictEqual(rAdmin.enviado.coste_medio, 3);
});

test("no se rompe con null / primitivos / fechas", () => {
  assert.strictEqual(stripEconomia(null), null);
  assert.strictEqual(stripEconomia(42), 42);
  assert.strictEqual(stripEconomia("hola"), "hola");
  const d = new Date("2026-10-10T00:00:00Z");
  assert.strictEqual(stripEconomia(d), d);
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
