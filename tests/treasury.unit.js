// Prueba del Treasury Operating System (PRD 004): cash flow, liquidez,
// monitor de emergencia y ensamblado. Ejecutar: node tests/treasury.unit.js
// (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const cashflow = require("../backend/cashflow");
const treasury = require("../backend/treasury");
const treasuryOS = require("../backend/treasury-os");
const periods = require("../backend/periods");

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }

const NOW = new Date(2026, 6, 15, 12, 0, 0).getTime();

function limpiar() {
  ["financial_accounts", "debts", "treasury_movements", "recepciones", "fixed_costs", "staff_finance",
    "materias", "productos", "ventas", "ajustes", "variable_costs", "financial_snapshots", "assets"].forEach((e) => store.writeAll(e, []));
}

console.log("treasury OS · cash flow, liquidez y emergencia");

test("cash flow: entradas − salidas = neto del periodo", () => {
  limpiar();
  const dentro = new Date(NOW - 2 * 86400000).toISOString();
  store.writeAll("ventas", [{ id: "v1", producto: "Café", cantidad: 1, importe: 500, fecha: dentro }]);
  store.writeAll("recepciones", [{ id: "r1", proveedor_id: "p1", importe_total: 200, fecha: dentro }]);
  const f = cashflow.flujo(periods.rango("mes", NOW), NOW);
  assert.strictEqual(f.entradas, 500, "entradas = ventas (500)");
  assert.strictEqual(f.desglose.salidas.compras, 200, "salidas incluyen compras (200)");
  assert.strictEqual(f.neto, f.entradas - f.salidas, "neto = entradas − salidas");
});

test("liquidez avanzada: fondo de maniobra, ratio y reserva", () => {
  limpiar();
  store.writeAll("financial_accounts", [{ id: "a1", name: "Banco", type: "banco", balance: 6000, active: true }]);
  store.writeAll("fixed_costs", [{ id: "f1", name: "Alquiler", amount: 600, periodicity: "monthly", active: true, start_date: "2024-01-01" }]);
  const l = treasury.liquidezAvanzada(NOW);
  assert.strictEqual(l.liquidez_inmediata, 6000);
  assert.ok(typeof l.fondo_maniobra === "number", "calcula fondo de maniobra");
  assert.ok(l.burn_mensual > 0, "burn mensual > 0 con coste fijo");
  assert.ok(l.reserva_objetivo > 0, "hay objetivo de reserva");
});

test("emergency monitor: detecta el pago que deja la caja en negativo", () => {
  limpiar();
  store.writeAll("financial_accounts", [{ id: "a1", name: "Banco", type: "banco", balance: 1000, active: true }]);
  store.writeAll("treasury_movements", [{ id: "t1", tipo: "pago", concepto: "Proveedor grande", importe: 4000, estado: "previsto", fecha: new Date(NOW + 3 * 86400000).toISOString() }]);
  const em = treasuryOS.emergencyMonitor(NOW, 1000);
  assert.strictEqual(em.nivel_riesgo, "alto", "riesgo alto por evento negativo");
  assert.ok(em.eventos_negativos.length >= 1, "detecta al menos un evento negativo");
  assert.ok(em.eventos_negativos[0].saldo_tras < 0, "el saldo tras el pago es negativo");
  assert.ok(em.accion, "propone una acción");
});

test("el Treasury OS se ensambla en una sola respuesta coherente", () => {
  limpiar();
  store.writeAll("financial_accounts", [{ id: "a1", name: "Banco", type: "banco", balance: 5000, active: true }, { id: "a2", name: "Caja", type: "caja", balance: 200, active: true }]);
  store.writeAll("debts", [{ id: "d1", name: "Préstamo", type: "loan", outstanding_amount: 3000, monthly_payment: 200, status: "activa" }]);
  const os = treasuryOS.sistemaOperativo(NOW);
  assert.ok(os.dashboard && os.cashflow && os.liquidez && os.valor_empresa && os.emergency && os.forecast, "trae todos los bloques");
  assert.strictEqual(os.dashboard.caja, 200);
  assert.strictEqual(os.dashboard.banco, 5000);
  assert.strictEqual(os.dashboard.liquidez_inmediata, 5200);
  assert.ok(typeof os.dashboard.disponible === "number", "calcula lo disponible");
  assert.ok(typeof os.dashboard.comprometido === "number", "calcula lo comprometido");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de treasury fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de treasury OS OK");
