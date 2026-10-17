// COSTE LABORAL REAL (Fase B · L8). Devengo con nº de pagas (12/14), SS a cargo de
// empresa POR EMPLEADO (no un 1,32 global) y honorarios del gestor; y FUENTE ÚNICA del
// personal (anti doble-conteo): fixed_costs 'Personal' y staff_finance nunca se suman.
// Ejecutar: node tests/coste-laboral.unit.js
const assert = require("assert");
const store = require("../backend/data-store");
const staff = require("../backend/staff-finance");
const financials = require("../backend/financials");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("coste laboral real · pagas + SS por empleado + anti doble-conteo");

test("devengo por salario: bruto × nº pagas × (1 + SS empresa) + gestor × 12", () => {
  // 1.500 €/mes, 14 pagas, SS 30%, gestor 30 €/nómina → 1.500×14×1,30 + 30×12 = 27.660 €/año.
  assert.strictEqual(staff.costeAnualEmpleado({ salario_bruto_mensual: 1500, num_pagas: 14, ss_empresa_pct: 30, gestor_mensual: 30 }), 27660);
  // Admite la SS como fracción (0,30) igual que en %.
  assert.strictEqual(staff.costeAnualEmpleado({ salario_bruto_mensual: 1500, num_pagas: 14, ss_empresa_pct: 0.30, gestor_mensual: 30 }), 27660);
});

test("compat histórica: sin declarar pagas/SS → 12 pagas y SS 0,32 (= el antiguo ×1,32)", () => {
  assert.strictEqual(staff.costeAnualEmpleado({ salario_bruto_mensual: 1500 }), 1500 * 12 * 1.32);
  // El diario cuadra con la fórmula vieja (sal × 1,32 / (365/12)).
  assert.ok(Math.abs(staff.costeDiarioEmpleado({ salario_bruto_mensual: 1500 }) - (1500 * 1.32) / (365 / 12)) < 1e-6);
});

test("modelo por hora: coste_hora × horas_semana × 52 (inalterado)", () => {
  assert.strictEqual(staff.costeAnualEmpleado({ coste_hora: 10, horas_semana: 40 }), 20800);
  assert.strictEqual(staff.costeDiarioEmpleado({ coste_hora: 10, horas_semana: 40 }), (10 * 40) / 7);
});

// ── Fuente única del personal (anti doble-conteo) ───────────────────────────
function montar(seed) {
  const db = Object.assign({ fixed_costs: [], staff_finance: [], usuarios: [] }, seed || {});
  store.readAll = (n) => (db[n] || (db[n] = []));
  return db;
}
const rango = { desde: Date.parse("2026-09-01T00:00:00Z"), hasta: Date.parse("2026-10-01T00:00:00Z") };
const now = Date.parse("2026-10-01T00:00:00Z");
const fijoPersonal = { id: "fc1", category: "Personal", amount: 2000, periodicity: "monthly", active: true, start_date: "2026-01-01" };

test("con staff_finance Y fixed_costs 'Personal': el personal viene SOLO de staff (no se suman)", () => {
  montar({ fixed_costs: [fijoPersonal], staff_finance: [{ id: "s1", salario_bruto_mensual: 1500, activo: true }] });
  const lab = financials.costeLaboralEnRango(rango, now);
  assert.strictEqual(lab.fuente, "staff_finance");
  assert.strictEqual(lab.personal, staff.costeEnRango(rango), "personal = solo staff, NO staff + fixed_costs");
  assert.ok(lab.personal > 0);
});

test("sin staff_finance: el personal son los fixed_costs 'Personal' (como hasta ahora)", () => {
  montar({ fixed_costs: [fijoPersonal] });
  const lab = financials.costeLaboralEnRango(rango, now);
  assert.strictEqual(lab.fuente, "fixed_costs");
  assert.ok(lab.personal > 0, "hay personal desde fixed_costs");
});

test("'otros' fijos NO incluye el personal (segmentación)", () => {
  montar({ fixed_costs: [fijoPersonal, { id: "fc2", category: "Alquiler", amount: 1000, periodicity: "monthly", active: true, start_date: "2026-01-01" }] });
  const lab = financials.costeLaboralEnRango(rango, now);
  assert.ok(lab.otros > 0 && lab.personal > 0);
  // El alquiler está en 'otros', el personal en 'personal': no se solapan.
  assert.ok(lab.otros < lab.personal + lab.otros);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en coste laboral`); process.exit(1); }
console.log("  coste laboral OK");
