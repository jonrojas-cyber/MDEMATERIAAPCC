// Pruebas del Centro de Control: periodos (lunes), prorrateo, coste de abrir,
// patrimonio neto, deuda, runway y salud del negocio.
// Ejecutar: node tests/financials.unit.js  (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const periods = require("../backend/periods");
const fixedCosts = require("../backend/fixed-costs");
const debtsMod = require("../backend/debts");
const treasury = require("../backend/treasury");
const financials = require("../backend/financials");
const health = require("../backend/business-health");

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }

// Jueves 2 de julio de 2026, 14:00 (fecha fija para reproducibilidad).
const NOW = new Date(2026, 6, 2, 14, 0, 0).getTime();

console.log("centro de control · periodos, prorrateo y finanzas");

// ── Periodos con semana en lunes ────────────────────────────────────────────
test("la semana SIEMPRE empieza en lunes", () => {
  const r = periods.rango("semana", NOW);
  assert.strictEqual(new Date(r.desde).getDay(), 1, "el inicio de semana debe ser lunes (getDay=1)");
});
test("semana anterior es el bloque lunes-lunes previo", () => {
  const r = periods.rango("semana_anterior", NOW);
  assert.strictEqual(new Date(r.desde).getDay(), 1);
  assert.strictEqual((r.hasta - r.desde) / periods.DAY, 7, "debe abarcar 7 días");
});
test("mes actual va del día 1 hasta ahora; mes anterior es el mes completo previo", () => {
  const m = periods.rango("mes", NOW);
  assert.strictEqual(new Date(m.desde).getDate(), 1);
  const ma = periods.rango("mes_anterior", NOW);
  assert.strictEqual(new Date(ma.desde).getMonth(), 5, "mes anterior a julio es junio (5)");
});
test("comparativo anterior de 'hoy' es ayer a la misma hora", () => {
  const a = periods.comparativoAnterior("hoy", NOW);
  assert.strictEqual((periods.rango("hoy", NOW).desde - a.desde) / periods.DAY, 1);
});

// ── Prorrateo de costes fijos ───────────────────────────────────────────────
test("un coste mensual de 550 € se prorratea a ~18,08 €/día", () => {
  const p = fixedCosts.prorrateo({ amount: 550, periodicity: "monthly" });
  assert.ok(Math.abs(p.diario - 18.08) < 0.05, "diario ≈ 18,08 pero fue " + p.diario);
  assert.ok(Math.abs(p.anual - 6600) < 1, "anual ≈ 6600 pero fue " + p.anual);
});
test("un gasto puntual (one_time) no genera coste recurrente diario", () => {
  assert.strictEqual(fixedCosts.costeDiario({ amount: 1000, periodicity: "one_time" }), 0);
});
test("respeta start_date / end_date al decidir si un coste está activo", () => {
  const fc = { amount: 100, periodicity: "monthly", start_date: "2026-01-01", end_date: "2026-06-30" };
  assert.strictEqual(fixedCosts.activoEn(fc, NOW), false, "en julio ya no está activo");
  assert.strictEqual(fixedCosts.activoEn(fc, new Date(2026, 2, 1).getTime()), true, "en marzo sí");
});

// ── Coste de abrir la persiana ──────────────────────────────────────────────
test("el coste de abrir suma fijos + personal + variables, sin materia ni deuda", () => {
  store.writeAll("fixed_costs", [
    { id: "f1", name: "Alquiler", amount: 600, periodicity: "monthly", active: true, start_date: "2024-01-01" },
    { id: "f2", name: "Luz", amount: 300, periodicity: "monthly", active: true, start_date: "2024-01-01" },
  ]);
  store.writeAll("staff_finance", []);
  store.writeAll("variable_costs", []);
  const r = periods.rango("mes", NOW);
  const ca = financials.costeDeAbrir(r, NOW);
  // 900 €/mes → ~29,57 €/día; en el mes en curso (día 1 a día 2.58) ≈ 76 €.
  assert.ok(ca.prorrateo.diario > 29 && ca.prorrateo.diario < 30, "diario ≈ 29,57 pero fue " + ca.prorrateo.diario);
  assert.ok(ca.total > 0, "el total del periodo debe ser > 0");
});

// ── Deuda ───────────────────────────────────────────────────────────────────
test("el resumen de deuda suma pendientes y cuotas mensuales", () => {
  store.writeAll("debts", [
    { id: "d1", name: "Préstamo", type: "loan", outstanding_amount: 8000, monthly_payment: 300, status: "activa" },
    { id: "d2", name: "Leasing", type: "leasing", outstanding_amount: 4000, monthly_payment: 150, status: "activa" },
    { id: "d3", name: "Pagada", type: "loan", outstanding_amount: 0, monthly_payment: 0, status: "pagada" },
  ]);
  const r = debtsMod.resumen(NOW);
  assert.strictEqual(r.deuda_total, 12000);
  assert.strictEqual(r.cuota_mensual_total, 450);
  assert.strictEqual(r.num_deudas, 2, "la deuda pagada no cuenta");
});
test("cuotas restantes se estiman por pendiente/cuota cuando no hay fecha fin", () => {
  const n = debtsMod.cuotasRestantes({ outstanding_amount: 900, monthly_payment: 300 }, NOW);
  assert.strictEqual(n, 3);
});

// ── Runway (días de supervivencia) ──────────────────────────────────────────
test("runway = liquidez / coste medio diario", () => {
  assert.strictEqual(treasury.runway(6000, 100), 60);
  assert.strictEqual(treasury.runway(1000, 0), null, "sin coste no se puede estimar");
});
test("liquidez suma caja + banco de las cuentas activas", () => {
  store.writeAll("financial_accounts", [
    { id: "a1", name: "Caja", type: "caja", balance: 300, active: true },
    { id: "a2", name: "Banco", type: "banco", balance: 5000, active: true },
    { id: "a3", name: "Cerrada", type: "banco", balance: 999, active: false },
  ]);
  const l = treasury.liquidez();
  assert.strictEqual(l.caja, 300);
  assert.strictEqual(l.banco, 5000);
  assert.strictEqual(l.liquidez_inmediata, 5300);
});

// ── Salud del negocio ───────────────────────────────────────────────────────
test("la salud del negocio devuelve una nota 0–100 con razones", () => {
  store.writeAll("materias", []);
  store.writeAll("ventas", []);
  store.writeAll("ajustes", []);
  store.writeAll("revisiones", []);
  const r = periods.rango("semana", NOW);
  const h = health.calcular(r, NOW);
  assert.ok(h.score >= 0 && h.score <= 100, "score fuera de rango: " + h.score);
  assert.ok(Array.isArray(h.razones) && h.razones.length > 0, "debe dar razones");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de finanzas fallaron`); process.exit(1); }
console.log("\nTodas las pruebas del Centro de Control OK");
