// Panel de dirección (home CEO): el objetivo es DINÁMICO = mes anterior × 1,10,
// y el objetivo diario se reparte entre los días del mes. Ejecutar:
// node tests/panel-direccion.unit.js
const assert = require("assert");
const store = require("../backend/data-store");
const ex = require("../backend/executive-dashboard");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("panel de dirección (CEO)");

// Snapshot para restaurar (el store persiste en disco en modo JSON).
const ventasPrev = (store.readAll("ventas") || []).slice();

test("objetivo mensual = ventas del mes anterior × 1,10; objetivo diario repartido", () => {
  store.writeAll("ventas", []);
  const now = new Date();
  // Una venta el día 15 del mes ANTERIOR, por 1.000 € (neto y bruto iguales).
  const ma = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const fecha = `${ma.getFullYear()}-${String(ma.getMonth() + 1).padStart(2, "0")}-15`;
  store.insert("ventas", { id: "pd_test_1", producto_id: "x", producto: "X", cantidad: 1, importe: 1000, importe_neto: 1000, fecha });
  const P = ex.construir("hoy").panel_direccion;
  assert.strictEqual(P.mes.objetivo, 1100, "objetivo = 1000 × 1,10");
  const diasEnMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  assert.strictEqual(P.hoy.objetivo_dia, Math.round((1100 / diasEnMes) * 100) / 100, "objetivo diario = objetivo mensual / días del mes");
  assert.strictEqual(P.objetivo_regla, "mes anterior × 1,10");
});

test("sin ventas el mes anterior → objetivo 0 (no se inventa un número)", () => {
  store.writeAll("ventas", []);
  const P = ex.construir("hoy").panel_direccion;
  assert.strictEqual(P.mes.objetivo, 0);
  assert.strictEqual(P.mes.objetivo_pct, null);
});

// Restaura las ventas originales.
store.writeAll("ventas", ventasPrev);

if (fallos) { console.error(`\n${fallos} fallo(s) en panel de dirección`); process.exit(1); }
console.log("  panel de dirección OK");
