// BENEFICIO NETO REAL (Fase B · dinero.1). La cascada del P&L baja hasta el beneficio
// neto: EBITDA − amortización = EBIT; EBIT − intereses = BAI; BAI − impuesto = neto.
// Antes el "neto" era solo operativo − intereses (sin amortización ni impuesto). Además:
//  · amortización del periodo desde los activos (lineal, prorrateada, dentro de vida útil);
//  · interés REAL de una deuda al "0% del banco" cuyo cuadro paga más que el principal.
// Ejecutar: node tests/beneficio-neto.unit.js
const assert = require("assert");
const cr = require("../backend/cuenta-resultados");
const assets = require("../backend/assets");
const debts = require("../backend/debts");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("beneficio neto real · cascada P&L (amortización + intereses + impuesto)");

test("componer: EBITDA − amortización = EBIT − intereses = BAI − impuesto = beneficio neto", () => {
  // Ingresos 10.000 neto, coste 3.000 (fc 30%), personal 2.000, otros 1.000 → EBITDA 4.000.
  // Amortización 400, intereses 100 → BAI 3.500. Impuesto 15% = 525 → neto 2.975.
  // Cuota ENTERA 800 → resultado de CAJA 3.200 (criterio de caja, aparte del devengo).
  const r = cr.componer({
    etiqueta: "2026-09", diasMes: 30, diasTranscurridos: 30, enCurso: false,
    ventas: 10000, coste_materia: 3000, personal: 2000, otros_fijos: 1000, variables: 0,
    cuota_creditos: 800, amortizacion: 400, intereses: 100, impuesto_pct: 15, food_cost_pct: 0.30,
  });
  const c = r.cuenta;
  assert.strictEqual(c.ebitda, 4000);
  assert.strictEqual(c.amortizacion, 400);
  assert.strictEqual(c.resultado_explotacion, 3600); // EBIT
  assert.strictEqual(c.intereses, 100);
  assert.strictEqual(c.bai, 3500);
  assert.strictEqual(c.impuesto, 525);               // 15% de 3.500
  assert.strictEqual(c.beneficio_neto, 2975);
  assert.strictEqual(c.resultado_caja, 3200);        // EBITDA − cuota entera (caja)
  assert.ok(c.beneficio_neto < c.ebitda, "el neto real es MENOR que el EBITDA");
});

test("no hay impuesto sobre pérdidas (BAI < 0 → impuesto 0)", () => {
  const r = cr.componer({
    etiqueta: "2026-09", diasMes: 30, diasTranscurridos: 30, enCurso: false,
    ventas: 1000, coste_materia: 300, personal: 900, otros_fijos: 200, variables: 0,
    cuota_creditos: 0, amortizacion: 100, intereses: 50, impuesto_pct: 15, food_cost_pct: 0.30,
  });
  const c = r.cuenta; // EBITDA = 1000−300−900−200 = −400; EBIT −500; BAI −550
  assert.strictEqual(c.ebitda, -400);
  assert.strictEqual(c.bai, -550);
  assert.strictEqual(c.impuesto, 0, "sin impuesto sobre pérdidas");
  assert.strictEqual(c.beneficio_neto, -550);
});

test("sin materia (coste null) → toda la cascada neta es null ('pend.'), no 0", () => {
  const r = cr.componer({
    etiqueta: "2026-09", diasMes: 30, diasTranscurridos: 30, enCurso: false,
    ventas: 1000, coste_materia: null, personal: 500, otros_fijos: 200, variables: 0,
    cuota_creditos: 100, amortizacion: 50, intereses: 20, impuesto_pct: 15, food_cost_pct: null,
  });
  const c = r.cuenta;
  assert.strictEqual(c.ebitda, null);
  assert.strictEqual(c.resultado_explotacion, null);
  assert.strictEqual(c.bai, null);
  assert.strictEqual(c.impuesto, null);
  assert.strictEqual(c.beneficio_neto, null);
});

test("assets.amortizacionEnRango: lineal prorrateado, solo dentro de la vida útil", () => {
  const a = { purchase_price: 12000, useful_life_years: 5, depreciation_method: "linear", purchase_date: "2026-01-01", active: true };
  const desde = Date.parse("2026-06-01T00:00:00Z"), hasta = Date.parse("2026-07-01T00:00:00Z");
  const amort = assets.amortizacionEnRango({ desde, hasta }, hasta, [a]);
  assert.ok(Math.abs(amort - 2400 * (30 / 365)) < 1, "12.000/5 = 2.400/año, un mes ≈ 197 €: " + amort);
  // Activo ya totalmente amortizado (comprado hace 6 años, vida 5) → 0.
  assert.strictEqual(assets.amortizacionEnRango({ desde, hasta }, hasta, [{ ...a, purchase_date: "2020-01-01" }]), 0);
  // Activo sin método lineal (solo current_value) → no amortiza en el P&L.
  assert.strictEqual(assets.amortizacionEnRango({ desde, hasta }, hasta, [{ current_value: 5000, active: true }]), 0);
});

test("debts.interesMensual: un 0% 'del banco' con cuadro que paga de más SÍ tiene interés", () => {
  // 0% real (paga = principal): sin interés inventado.
  const cero = { type: "loan", outstanding_amount: 10000, monthly_payment: 1000, interest_rate: 0, status: "activa", end_date: null };
  assert.strictEqual(debts.interesMensual(cero), 0, "un 0% real no inventa interés");
  // 0% incoherente (cuadro de 12 cuotas → paga 12.000 por 10.000): deriva ~166 €/mes.
  const now = Date.parse("2026-01-01T00:00:00Z");
  const incoherente = { type: "loan", outstanding_amount: 10000, monthly_payment: 1000, interest_rate: 0, status: "activa", end_date: "2026-12-20" };
  const im = debts.interesMensual(incoherente, now);
  assert.ok(im > 100 && im < 200, "deriva del calendario pese al 0%: " + im);
  // Un tipo explícito > 0 manda: 12% anual sobre 10.000 = 100/mes.
  assert.strictEqual(debts.interesMensual({ type: "loan", outstanding_amount: 10000, monthly_payment: 1000, interest_rate: 12, status: "activa" }, now), 100);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en beneficio neto`); process.exit(1); }
console.log("  beneficio neto OK");
