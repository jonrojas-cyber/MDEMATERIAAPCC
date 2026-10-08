// SEED DE OBJETIVOS · metas de referencia por tipo, idempotente y sin pisar las
// que la fundadora haya puesto. Ejecutar: node tests/seed-objetivos.unit.js.

const assert = require("assert");
const store = require("../backend/data-store");
const seed = require("../backend/seed-objetivos");

let fallos = 0;
const _cola = [];
function test(n, fn) { _cola.push([n, fn]); }
async function _run() { for (const [n, fn] of _cola) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } } }

console.log("seed objetivos · metas de referencia");

test("siembra las metas por defecto cuando no hay ninguna", async () => {
  store.writeAll("business_targets", []);
  await seed.seedObjetivos();
  const t = store.readAll("business_targets");
  const tipos = t.map((x) => x.tipo).sort();
  assert.deepStrictEqual(tipos, ["coste_laboral", "ebitda", "food_cost", "gastos_fijos", "prime_cost"], "siembra las 5 metas");
  const food = t.find((x) => x.tipo === "food_cost");
  assert.strictEqual(food.valor, 27, "food cost 27%");
  assert.strictEqual(food.unidad, "pct");
});

test("idempotente: segunda siembra no duplica", async () => {
  store.writeAll("business_targets", []);
  await seed.seedObjetivos();
  const n1 = store.readAll("business_targets").length;
  await seed.seedObjetivos();
  assert.strictEqual(store.readAll("business_targets").length, n1, "no añade duplicados");
});

test("respeta un objetivo ya existente de ese tipo (no lo pisa ni duplica)", async () => {
  store.writeAll("business_targets", [{ id: "mio", tipo: "food_cost", valor: 24, activo: true }]);
  await seed.seedObjetivos();
  const food = store.readAll("business_targets").filter((x) => x.tipo === "food_cost");
  assert.strictEqual(food.length, 1, "sigue habiendo un solo food_cost");
  assert.strictEqual(food[0].valor, 24, "conserva el valor de la fundadora (24, no 27)");
  // Pero sí añade los demás tipos que faltaban.
  assert.ok(store.readAll("business_targets").some((x) => x.tipo === "prime_cost"), "añade prime_cost");
  store.writeAll("business_targets", []);
});

_run().then(() => {
  if (fallos) { console.error(`\n${fallos} fallo(s) en seed objetivos`); process.exit(1); }
  console.log("  seed objetivos OK");
});
