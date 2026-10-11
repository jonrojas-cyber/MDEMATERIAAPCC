// Doble descuento de IVA (motor-fechas.1/2), reproducido con fixtures en el
// recorrido importación → cierre guardado → cuenta de resultados.
//
// BUG histórico: analisis-mes guardaba el NETO en config `ventas_mes_*`, pero la
// Cuenta de Resultados trata ese valor como BRUTO y lo divide por (1+IVA) → el
// neto se dividía DOS veces (ingresos del mes ~9% bajos). Arreglo: guardar el
// BRUTO (snap.total). Este test demuestra ambas cosas con datos sintéticos.
// Ejecutar: node tests/doble-iva.unit.js
const assert = require("assert");
const store = require("../backend/data-store");
const am = require("../backend/analisis-mes");
const cr = require("../backend/cuenta-resultados");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("doble IVA · importación → cierre → cuenta de resultados");

// Snapshot real del mes: base (neto) 1000, total (bruto, con IVA) 1100.
const snap = am.componer("2026-09", [{ fecha: "2026-09-10", uds: 10, neto: 1000, total: 1100 }], 5, {}, "test");

test("componer: neto = base sin IVA, total = bruto con IVA", () => {
  assert.strictEqual(snap.neto, 1000, "neto es la base");
  assert.strictEqual(snap.total, 1100, "total es el bruto (con IVA)");
});

function conConfig(valor) {
  const db = { config: [{ id: "ventas_mes_2026-09", valor }], ventas: [], fixed_costs: [], debts: [], staff_finance: [], variable_costs: [], materias: [], productos: [], ajustes: [] };
  store.readAll = (n) => (db[n] || (db[n] = []));
  store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
  return cr.calcular({ mes: "2026-09" });
}

test("ARREGLO: guardar el BRUTO (snap.total) → ingresos netos = 1100/1,10 = 1000 (un solo neteo)", () => {
  const r = conConfig(snap.total); // lo que ahora guarda routes/analisis-mes.js
  assert.strictEqual(r.cuenta.ventas_origen, "cierre_guardado");
  assert.strictEqual(r.cuenta.ingresos, 1000, "ingresos netos correctos, sin doble descuento");
});

test("BUG histórico: guardar el NETO (snap.neto) daría 1000/1,10 = 909 (doble IVA)", () => {
  const r = conConfig(snap.neto); // comportamiento anterior (incorrecto)
  assert.ok(Math.abs(r.cuenta.ingresos - 909.09) < 0.5, `doble descuento daba ~909, fue ${r.cuenta.ingresos}`);
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
