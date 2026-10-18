// Motor financiero único (bloque 05). Caso de aceptación del plan, end-to-end:
//   venta 110 bruto / 100 neto · materia 25 · fijo 12,10 bruto con 21% IVA
//   DEDUCIBLE (= 10 neto) · sin otros gastos  →  resultado 65 · food cost 25%.
// Además: importeNeto de costes fijos y margen por producto en base neta.
// Ejecutar: node tests/motor-financiero.unit.js
const assert = require("assert");
const store = require("../backend/data-store");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("motor financiero · IVA neto/neto y fuente única");

// ── importeNeto de costes fijos (dinero.1) ───────────────────────────────────
const fixedCosts = require("../backend/fixed-costs");
test("fijo 12,10 'con_iva' 21% deducible → 10 neto; 'sin_iva' → 12,10", () => {
  assert.strictEqual(fixedCosts.importeNeto({ amount: 12.10, vat: 0.21, base: "con_iva", iva_deducible: true }), 10);
  assert.strictEqual(fixedCosts.importeNeto({ amount: 12.10, vat: 0.21, base: "sin_iva" }), 12.10);
  assert.strictEqual(fixedCosts.importeNeto({ amount: 12.10, vat: 0.21 }), 12.10, "por defecto no netea (sin clasificar)");
  assert.strictEqual(fixedCosts.importeNeto({ amount: 12.10, vat: 0.21, base: "con_iva", iva_deducible: false }), 12.10, "IVA no deducible = coste real");
});

test("E7 · importeNeto normaliza el IVA en % entero (21 → 0,21), no divide por 22", () => {
  // El formulario y las semillas guardan vat como PORCENTAJE entero (21/10).
  assert.strictEqual(fixedCosts.importeNeto({ amount: 665.50, vat: 21, base: "con_iva", iva_deducible: true }), 550, "665,50/1,21 = 550 (no /22 = 30,25)");
  assert.strictEqual(fixedCosts.importeNeto({ amount: 12.10, vat: 21, base: "con_iva", iva_deducible: true }), 10);
  // importeNeto no redondea (eso es aguas abajo); el 10% deja arrastre de coma flotante.
  assert.ok(Math.abs(fixedCosts.importeNeto({ amount: 110, vat: 10, base: "con_iva", iva_deducible: true }) - 100) < 0.001, "110/1,10 ≈ 100 (IVA 10%)");
  // Compatibilidad: una fracción ya dada (0,21) se respeta.
  assert.strictEqual(fixedCosts.importeNeto({ amount: 12.10, vat: 0.21, base: "con_iva", iva_deducible: true }), 10);
});

// ── margen por producto en base neta (dinero.3/4/5) ──────────────────────────
const costing = require("../backend/costing");
test("margen por producto: coste y margen € en NETO, ratios invariantes", () => {
  const m = costing.margenProducto({ precio_venta: 11, iva: 0.10, coste_materia: 2.5 }, {});
  assert.strictEqual(m.coste, 2.5, "coste NETO");
  assert.strictEqual(m.precio_neto, 10, "precio neto = 11/1,10");
  assert.strictEqual(m.margen_euros, 7.5, "margen neto = 10 − 2,5");
  assert.strictEqual(m.food_cost, 0.25, "food cost = 2,5/10 = 25%");
});

test("IVA de venta 10% ÚNICO (aplicado a TODO): un 0,21 declarado se netea igual al 10%", () => {
  // costing ignora producto.iva: PVP 11 → neto 11/1,10 = 10 (no 11/1,21 = 9,09).
  const m = costing.margenProducto({ precio_venta: 11, iva: 0.21, coste_materia: 2.5 }, {});
  assert.strictEqual(m.precio_neto, 10, "PVP neteado al 10% pese al 0,21 declarado");
  const financials = require("../backend/financials");
  // netoDeVenta sin importe_neto: 121 bruto → 110 neto (10%), no 100 (21%).
  assert.ok(Math.abs(financials.netoDeVenta({ importe: 121, iva: 0.21 }) - 110) < 0.001, "121/1,10 ≈ 110 (no 100)");
  // Con importe_neto (la Base de Ágora) manda la Base registrada.
  assert.strictEqual(financials.netoDeVenta({ importe: 121, importe_neto: 109, iva: 0.21 }), 109);
});

// ── P&L end-to-end (caso del plan) ───────────────────────────────────────────
const desde = Date.parse("2026-10-10T00:00:00");
const hasta = desde + 86400000;
const now = Date.parse("2026-10-10T12:00:00");
const db = {
  ventas: [{ id: "v1", producto_id: "p1", producto: "X", cantidad: 1, importe: 110, importe_neto: 100, fecha: "2026-10-10T10:00:00", fuente: "agora" }],
  productos: [{ id: "p1", nombre: "X", precio_venta: 110, iva: 0.10, coste_materia: 25, ingredientes: [] }],
  materias: [], recetas: [], preparaciones: [],
  fixed_costs: [{ id: "f1", name: "Luz", category: "Suministros", amount: 12.10, vat: 0.21, base: "con_iva", iva_deducible: true, periodicity: "daily", active: true }],
  staff_finance: [], debts: [], variable_costs: [], ajustes: [], config: [],
};
store.readAll = (n) => (db[n] || (db[n] = []));
store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
const financials = require("../backend/financials");

test("P&L: ventas 110 bruto / 100 neto · materia 25 · fijo 10 → resultado 65, food cost 25%", () => {
  const b = financials.beneficio({ desde, hasta }, now);
  assert.strictEqual(b.ventas, 110, "titular bruto (cuadra con Ágora)");
  assert.strictEqual(b.ventas_netas, 100, "base neta del P&L");
  assert.strictEqual(b.coste_materia, 25);
  assert.strictEqual(b.gastos_fijos, 10, "12,10 con 21% deducible = 10 neto (dinero.1)");
  assert.strictEqual(b.beneficio_operativo, 65, "100 − 25 − 10");
  assert.strictEqual(b.food_cost_pct, 25, "25/100");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
