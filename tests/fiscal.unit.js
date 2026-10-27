// Config fiscal (régimen + tipo de impuesto editable) y "dinero libre (caja tras
// impuesto)" en la cuenta de resultados. Ejecutar: node tests/fiscal.unit.js
// (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const cr = require("../backend/cuenta-resultados");
const financials = require("../backend/financials");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
function cerca(a, b, m) { assert.ok(Math.abs(a - b) < 0.02, `${m} (${a} vs ${b})`); }

console.log("config fiscal + dinero libre (caja tras impuesto)");

test("componer: dinero_libre = resultado de caja − impuesto", () => {
  // Ventas netas 10.000, materia 3.000 → MB 7.000; personal 2.000, otros 1.000 → EBITDA 4.000.
  // cuota préstamo 700 → resultado de caja 3.300. impuesto 25% sobre BAI (= EBITDA aquí,
  // sin amort/intereses) = 1.000 → beneficio neto 3.000. dinero_libre = 3.300 − 1.000 = 2.300.
  const r = cr.componer({
    etiqueta: "test", diasMes: 30, diasTranscurridos: 30, enCurso: false,
    ventas: 10000, coste_materia: 3000, personal: 2000, otros_fijos: 1000, variables: 0,
    cuota_creditos: 700, amortizacion: 0, intereses: 0, impuesto_pct: 25, food_cost_pct: 0.30,
  });
  cerca(r.cuenta.ebitda, 4000, "EBITDA");
  cerca(r.cuenta.resultado_caja, 3300, "resultado de caja = EBITDA − cuota entera");
  cerca(r.cuenta.impuesto, 1000, "impuesto 25% sobre BAI");
  cerca(r.cuenta.dinero_libre, 2300, "dinero libre = caja − impuesto");
});

test("sin impuesto (BAI<=0) el dinero libre es el resultado de caja", () => {
  const r = cr.componer({
    etiqueta: "test", diasMes: 30, diasTranscurridos: 30, enCurso: false,
    ventas: 5000, coste_materia: 2000, personal: 2500, otros_fijos: 900, variables: 0,
    cuota_creditos: 300, amortizacion: 0, intereses: 0, impuesto_pct: 27,
  });
  // EBITDA = 3000 − 2500 − 900 = -400 → BAI<0 → impuesto 0; caja = -400 − 300 = -700.
  cerca(r.cuenta.impuesto, 0, "sin impuesto si BAI<=0");
  cerca(r.cuenta.dinero_libre, r.cuenta.resultado_caja, "dinero libre = resultado de caja");
});

test("sin materia (pend.) la cascada de caja es null, no 0", () => {
  const r = cr.componer({
    etiqueta: "test", diasMes: 30, diasTranscurridos: 30, enCurso: false,
    ventas: 8000, coste_materia: null, personal: 2000, otros_fijos: 1000, variables: 0,
    cuota_creditos: 500, impuesto_pct: 27,
  });
  assert.strictEqual(r.cuenta.dinero_libre, null, "dinero libre pendiente mientras no hay coste de materia");
});

test("el tipo de impuesto se lee de config (editable, ya no clavado al 15%)", () => {
  store.writeAll("config", []);
  assert.strictEqual(financials.impuestoBeneficioPct(), 15, "por defecto 15% cuando no hay config");
  store.insert("config", { id: "impuesto_beneficio_pct", valor: 27 });
  assert.strictEqual(financials.impuestoBeneficioPct(), 27, "toma el valor configurado (IRPF autónoma)");
  store.writeAll("config", []);
});

if (fallos) { console.error(`\n${fallos} prueba(s) de fiscal fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de fiscal OK");
