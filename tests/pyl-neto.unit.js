// P&L EN NETO (Bloque 2): el titular "ventas" sigue en BRUTO (cuadra con Ágora),
// pero el beneficio, el food cost y el margen se calculan sobre la base SIN IVA.
// También: hora de Málaga para la previsión del día, y nº de tickets del cierre.
// Ejecutar: node tests/pyl-neto.unit.js
const assert = require("assert");
const store = require("../backend/data-store");
const tz = require("../backend/tz");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

// Store en memoria (mismo contrato que data-store para lo que usa el motor).
function montar(seed) {
  const db = Object.assign({ ventas: [], productos: [], materias: [], ajustes: [], fixed_costs: [], variable_costs: [], debts: [], staff_finance: [], config: [], business_config: [] }, seed || {});
  store.readAll = (n) => (db[n] || (db[n] = []));
  store.writeAll = (n, arr) => { db[n] = arr; };
  store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
  return db;
}

const financials = require("../backend/financials");

console.log("P&L en neto (Bloque 2)");

// Rango que abarca las ventas de prueba.
const R = { desde: Date.parse("2026-10-01T00:00:00Z"), hasta: Date.parse("2026-11-01T00:00:00Z") };

test("ventas = BRUTO (titular), ventas_netas = SIN IVA (base del P&L)", () => {
  montar({
    ventas: [
      { id: "v1", producto: "Café", cantidad: 1, importe: 11, importe_neto: 10, fecha: "2026-10-05T10:00:00Z" },
      { id: "v2", producto: "Tosta", cantidad: 1, importe: 22, importe_neto: 20, fecha: "2026-10-06T10:00:00Z" },
    ],
  });
  assert.strictEqual(financials.ventasEnRango(R), 33, "bruto = 11 + 22");
  assert.strictEqual(financials.ventasNetasEnRango(R), 30, "neto = 10 + 20 (importe_neto)");
});

test("sin importe_neto, cae a bruto / 1,10 (IVA hostelería 10%)", () => {
  montar({ ventas: [{ id: "v1", producto: "Café", cantidad: 1, importe: 11, fecha: "2026-10-05T10:00:00Z" }] });
  assert.strictEqual(financials.ventasEnRango(R), 11);
  assert.ok(Math.abs(financials.ventasNetasEnRango(R) - 10) < 0.001, "11 / 1,10 = 10");
});

test("beneficio: titular en bruto, operativo y food cost en neto", () => {
  montar({
    ventas: [
      { id: "v1", producto: "Café", cantidad: 10, importe: 110, importe_neto: 100, fecha: "2026-10-05T10:00:00Z" },
    ],
    // Producto con coste directo neto 2 €/ud → coste materia vendida = 20 €.
    productos: [{ id: "p-cafe", nombre: "Café", coste_materia: 2 }],
  });
  // Vincular la venta al producto por nombre (financials usa índice por nombre).
  store.readAll("ventas")[0].producto = "Café";
  const b = financials.beneficio(R, Date.parse("2026-10-31T10:00:00Z"));
  assert.strictEqual(b.ventas, 110, "titular en bruto");
  assert.strictEqual(b.ventas_netas, 100, "base neta");
  assert.strictEqual(b.coste_materia, 20, "coste neto 10 × 2");
  // food cost = coste / NETO = 20 / 100 = 20% (no 20/110 = 18%).
  assert.strictEqual(b.food_cost_pct, 20, "food cost neto/neto");
  // margen operativo sobre neto (sin otros costes en este test): (100-20)/100 = 80%.
  assert.strictEqual(b.margen_operativo_pct, 80, "margen sobre neto");
});

test("tz.horaDecimal da la hora de Málaga, no la UTC del servidor", () => {
  // 10:00 UTC en pleno verano (CEST = UTC+2) → 12:00 en Málaga.
  const verano = "2026-07-15T10:00:00Z";
  assert.ok(Math.abs(tz.horaDecimal(verano) - 12) < 0.001, "verano: 10h UTC → 12h Málaga");
  // 10:00 UTC en invierno (CET = UTC+1) → 11:00 en Málaga.
  const invierno = "2026-01-15T10:00:00Z";
  assert.ok(Math.abs(tz.horaDecimal(invierno) - 11) < 0.001, "invierno: 10h UTC → 11h Málaga");
  // fechaLocal: 23:30 UTC del 9 oct (verano) = 01:30 del 10 en Málaga.
  assert.strictEqual(tz.fechaLocal("2026-10-09T23:30:00Z"), "2026-10-10", "medianoche local, no UTC");
});

test("ticketsEnRango devuelve un NÚMERO (no un objeto)", () => {
  montar({
    ventas: [
      { id: "v1", importe: 10, fecha: "2026-10-05T10:00:00Z", doc_clave: "Invoice:T:1" },
      { id: "v2", importe: 10, fecha: "2026-10-05T10:05:00Z", doc_clave: "Invoice:T:1" }, // mismo ticket
      { id: "v3", importe: 10, fecha: "2026-10-05T11:00:00Z", doc_clave: "Invoice:T:2" },
    ],
  });
  const n = financials.ticketsEnRango(R);
  assert.strictEqual(typeof n, "number", "es un número");
  assert.strictEqual(n, 2, "dos tickets distintos (T:1 agrupado)");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
