// SEGMENTACIÓN PERSONAL vs OTROS FIJOS · fuente única del corte (fixed-costs).
// Comprueba que el personal (categoría "Personal") sale separado de los demás
// fijos, que no se duplica, y que financials.beneficio lo lleva a coste_laboral
// (no a gastos_fijos) SIN cambiar el beneficio operativo total.
// Ejecutar: node tests/fixed-costs-segmentado.unit.js (revertir backend/data).

const assert = require("assert");
const store = require("../backend/data-store");
const fixedCosts = require("../backend/fixed-costs");
const financials = require("../backend/financials");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.5 : tol);

const NOW = new Date(2026, 8, 30, 12, 0, 0).getTime(); // 30 sep 2026
const LISTA = [
  { id: "fc-alquiler", name: "Alquiler", category: "Alquiler", amount: 665.5, periodicity: "monthly", active: true },
  { id: "fc-luz", name: "Luz", category: "Luz", amount: 500, periodicity: "monthly", active: true },
  { id: "fc-lara", name: "Salario Lara", category: "Personal", amount: 2500, periodicity: "monthly", active: true },
  { id: "fc-daniel", name: "Salario Daniel", category: "Personal", amount: 2500, periodicity: "monthly", active: true },
];

console.log("fixed-costs · segmentación personal vs otros fijos");

test("costeEnRangoSegmentado separa personal de otros fijos (sin mezclar)", () => {
  const r = { desde: new Date(2026, 8, 1).getTime(), hasta: new Date(2026, 9, 1).getTime() };
  const seg = fixedCosts.costeEnRangoSegmentado(r, NOW, LISTA);
  // Rango de 30 días prorrateado sobre el mes medio (365/12): factor ≈ 0,9863.
  // 5.000 €/mes → ≈4.931,5 ; (665,5+500) €/mes → ≈1.149,5.
  assert.ok(near(seg.personal, 4931.5, 3), "personal ≈ 4.931,5 € (Lara+Daniel)");
  assert.ok(near(seg.otros, 1149.5, 3), "otros ≈ 1.149,5 € (alquiler+luz)");
  assert.ok(near(seg.total, 6081, 5), "total = personal + otros");
});

test("totalesSegmentado da el prorrateo mensual de cada segmento", () => {
  const t = fixedCosts.totalesSegmentado(NOW, LISTA);
  assert.ok(near(t.personal.mensual, 5000, 1), "personal 5.000/mes");
  assert.ok(near(t.otros.mensual, 1165.5, 1), "otros 1.165,5/mes");
  assert.ok(near(t.total.mensual, 6165.5, 1), "total 6.165,5/mes");
});

test("lineasMensuales marca cada línea como personal o no", () => {
  const lin = fixedCosts.lineasMensuales(NOW, LISTA);
  const lara = lin.find((l) => l.id === "fc-lara");
  const luz = lin.find((l) => l.id === "fc-luz");
  assert.strictEqual(lara.es_personal, true, "Lara es personal");
  assert.strictEqual(luz.es_personal, false, "luz no es personal");
  assert.ok(near(lara.mensual, 2500, 1));
});

test("un coste inactivo o one_time no cuenta como recurrente", () => {
  const lista = LISTA.concat([
    { id: "fc-off", name: "Internet", category: "Internet", amount: 60, periodicity: "monthly", active: false },
    { id: "fc-once", name: "Obra", category: "Obras", amount: 1000, periodicity: "one_time", start_date: "2026-09-10", active: true },
  ]);
  const r = { desde: new Date(2026, 8, 1).getTime(), hasta: new Date(2026, 9, 1).getTime() };
  const seg = fixedCosts.costeEnRangoSegmentado(r, NOW, lista);
  assert.ok(near(seg.otros, 1165.5, 20), "el inactivo no suma a otros recurrentes");
  assert.ok(near(seg.otros_puntual, 1000, 1), "el one_time del rango sale como puntual");
});

// ── El motor de beneficio no duplica el personal ─────────────────────────────
function limpiar() {
  ["fixed_costs", "materias", "productos", "ventas", "config", "debts", "business_config", "variable_costs", "ajustes", "staff_finance", "usuarios", "recepciones"].forEach((e) => store.writeAll(e, []));
}

test("financials.beneficio: personal → coste_laboral; otros → gastos_fijos; operativo intacto", () => {
  limpiar();
  store.writeAll("fixed_costs", LISTA);
  const r = { desde: new Date(2026, 8, 1).getTime(), hasta: new Date(2026, 9, 1).getTime() };
  const b = financials.beneficio(r, NOW);
  assert.ok(near(b.coste_laboral, 4931.5, 3), "coste_laboral ≈ 4.931,5 (personal, NO 0)");
  assert.ok(near(b.gastos_fijos, 1149.5, 3), "gastos_fijos ≈ 1.149,5 (sin personal)");
  // El personal NO está contado dos veces: laboral + fijos = total de los fijos.
  assert.ok(near(b.coste_laboral + b.gastos_fijos, 6081, 5), "laboral + fijos = todos los fijos (una vez)");
  // Sin ventas: operativo = −(laboral+fijos+variables). El personal no se duplica.
  assert.ok(near(b.beneficio_operativo, -(b.coste_laboral + b.gastos_fijos + b.gastos_variables), 1), "operativo coherente");
  // Prime cost expuesto.
  assert.ok(b.prime_cost != null && near(b.prime_cost, b.coste_materia + b.coste_laboral, 1), "prime cost = materia + personal");
  limpiar();
});

if (fallos) { console.error(`\n${fallos} fallo(s) en segmentación`); process.exit(1); }
console.log("  segmentación personal/fijos OK");
