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

test("objetivo mensual = mes anterior × 1,10; diario = media por día ABIERTO × 1,10", () => {
  store.writeAll("ventas", []);
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() - 1;
  const fe = (dd) => `${new Date(y, m, dd).getFullYear()}-${String(new Date(y, m, dd).getMonth() + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  // Dos días ABIERTOS en el mes anterior, 1.000 € cada uno → total 2.000 €.
  store.insert("ventas", { id: "pd_t1", producto_id: "x", producto: "X", cantidad: 1, importe: 1000, importe_neto: 1000, fecha: fe(10) });
  store.insert("ventas", { id: "pd_t2", producto_id: "x", producto: "X", cantidad: 1, importe: 1000, importe_neto: 1000, fecha: fe(20) });
  const P = ex.construir("hoy").panel_direccion;
  assert.strictEqual(P.mes.objetivo, 2200, "objetivo mensual = 2000 × 1,10");
  assert.strictEqual(P.mes.dias_abiertos_anterior, 2, "2 días abiertos el mes anterior");
  assert.strictEqual(P.hoy.objetivo_dia, 1100, "objetivo diario = 2200 / 2 días abiertos");
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
