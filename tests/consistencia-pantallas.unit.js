// CONSISTENCIA ENTRE PANTALLAS (puntos 1 y 4): para el mismo día/mes y los mismos
// datos, Análisis diario, el P&L (financials.beneficio) y la Cuenta de resultados
// deben coincidir: ventas con IVA = titular, ventas sin IVA = base del margen, y el
// food cost se calcula igual (sin IVA) en las tres. No se borra ni inventa nada.
// Ejecutar: node tests/consistencia-pantallas.unit.js
const assert = require("assert");
const store = require("../backend/data-store");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

function montar(seed) {
  const db = Object.assign({ ventas: [], productos: [], materias: [], ajustes: [], fixed_costs: [], variable_costs: [], debts: [], staff_finance: [], config: [], business_config: [] }, seed || {});
  store.readAll = (n) => (db[n] || (db[n] = []));
  store.writeAll = (n, arr) => { db[n] = arr; };
  store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
  return db;
}

const financials = require("../backend/financials");
const analisisDiario = require("../backend/analisis-diario");
const costing = require("../backend/costing");
const CR = require("../backend/cuenta-resultados");

console.log("consistencia entre pantallas");

// Un día de septiembre con dos productos de coste conocido (cobertura 100%).
const DIA = "2026-09-15";
const now = Date.parse("2026-09-30T12:00:00Z");
function seed() {
  return {
    ventas: [
      { id: "v1", producto: "Café", producto_id: "p-cafe", cantidad: 10, importe: 22, importe_neto: 20, fecha: `${DIA}T09:00:00Z`, doc_clave: "Invoice:T:1", fuente: "agora" },
      { id: "v2", producto: "Tosta", producto_id: "p-tosta", cantidad: 5, importe: 33, importe_neto: 30, fecha: `${DIA}T10:00:00Z`, doc_clave: "Invoice:T:2", fuente: "agora" },
    ],
    productos: [
      { id: "p-cafe", nombre: "Café", coste_materia: 0.5 },
      { id: "p-tosta", nombre: "Tosta", coste_materia: 1.2 },
    ],
  };
}

test("ventas con IVA (titular) coinciden entre P&L y Análisis diario", () => {
  montar(seed());
  const r = { desde: Date.parse(`${DIA}T00:00:00Z`), hasta: Date.parse("2026-09-16T00:00:00Z") };
  const ben = financials.beneficio(r, now);
  const idx = financials.indicesProducto();
  const vd = analisisDiario.ventaDia(DIA, store.readAll("ventas"), idx.byId, idx.byName, costing.indiceMaterias(store.readAll("materias")));
  assert.strictEqual(ben.ventas, 55, "bruto = 22 + 33");
  assert.strictEqual(vd.total, 55, "Análisis diario bruto = mismo titular");
});

test("ventas sin IVA (base) coinciden entre P&L y Análisis diario", () => {
  montar(seed());
  const r = { desde: Date.parse(`${DIA}T00:00:00Z`), hasta: Date.parse("2026-09-16T00:00:00Z") };
  const ben = financials.beneficio(r, now);
  const idx = financials.indicesProducto();
  const vd = analisisDiario.ventaDia(DIA, store.readAll("ventas"), idx.byId, idx.byName, costing.indiceMaterias(store.readAll("materias")));
  assert.strictEqual(ben.ventas_netas, 50, "neto = 20 + 30");
  assert.strictEqual(vd.total_neto, 50, "Análisis diario neto = misma base");
});

test("food cost se calcula igual (sin IVA) en P&L y Análisis diario", () => {
  montar(seed());
  const r = { desde: Date.parse(`${DIA}T00:00:00Z`), hasta: Date.parse("2026-09-16T00:00:00Z") };
  const ben = financials.beneficio(r, now);
  const idx = financials.indicesProducto();
  const vd = analisisDiario.ventaDia(DIA, store.readAll("ventas"), idx.byId, idx.byName, costing.indiceMaterias(store.readAll("materias")));
  // coste = 10×0,5 + 5×1,2 = 11 ; neto = 50 → food cost = 22%.
  assert.strictEqual(ben.coste_materia, 11);
  assert.strictEqual(vd.coste_materia, 11);
  assert.strictEqual(ben.food_cost_pct, 22, "P&L food cost = 11/50");
  assert.strictEqual(vd.food_cost_pct, 22, "Análisis diario food cost = 11/50 (mismo)");
  assert.strictEqual(vd.cobertura_coste_pct, 100, "cobertura completa");
});

test("ventas del día coinciden aunque haya una venta MANUAL (no solo Ágora)", () => {
  const s = seed();
  // Una venta manual (fuente != agora) además de las de Ágora.
  s.ventas.push({ id: "v3", producto: "Café", producto_id: "p-cafe", cantidad: 10, importe: 11, importe_neto: 10, fecha: `${DIA}T11:00:00Z`, doc_clave: "TicketExport:T:9", fuente: "manual" });
  montar(s);
  const r = { desde: Date.parse(`${DIA}T00:00:00Z`), hasta: Date.parse("2026-09-16T00:00:00Z") };
  const ben = financials.beneficio(r, now);
  const idx = financials.indicesProducto();
  const vd = analisisDiario.ventaDia(DIA, store.readAll("ventas"), idx.byId, idx.byName, costing.indiceMaterias(store.readAll("materias")));
  assert.strictEqual(ben.ventas, 66, "portada cuenta TODAS: 22 + 33 + 11");
  assert.strictEqual(vd.total, 66, "Análisis diario cuenta TODAS igual (ya no excluye la manual)");
});

test("Cuenta de resultados usa la MISMA base neta que el P&L del mes", () => {
  montar(seed());
  const rMes = { desde: Date.parse("2026-09-01T00:00:00Z"), hasta: Date.parse("2026-10-01T00:00:00Z") };
  const ben = financials.beneficio(rMes, now);
  const cr = CR.calcular({ now, mes: "2026-09" });
  // Sin override, la cuenta de resultados muestra ingresos = ventas netas del mes.
  assert.strictEqual(cr.cuenta.ingresos, ben.ventas_netas, "ingresos (neto) = ventas_netas del P&L");
  assert.strictEqual(ben.ventas_netas, 50);
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
