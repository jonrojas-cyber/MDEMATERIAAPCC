// Doble descuento de IVA en el recorrido importación → cierre guardado → cuenta de
// resultados. CONVENCIÓN ÚNICA (E2): el cierre `ventas_mes_*` se guarda y se usa en
// NETO (la Base de Ágora, sin IVA); la Cuenta de Resultados lo toma TAL CUAL, sin
// re-netear. Antes se guardaba el BRUTO y se neteaba a un 10% PLANO, lo que (a)
// fallaba con IVA mixto (bolsa retail/para llevar al 21%) y (b) no era idempotente.
// Ejecutar: node tests/doble-iva.unit.js
const assert = require("assert");
const store = require("../backend/data-store");
const am = require("../backend/analisis-mes");
const cr = require("../backend/cuenta-resultados");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("doble IVA · importación → cierre → cuenta de resultados");

// Snapshot real del mes: base (neto) 1000, total (bruto, con IVA 10%) 1100.
const snap = am.componer("2026-09", [{ fecha: "2026-09-10", uds: 10, neto: 1000, total: 1100 }], 5, {}, "test");
// Snapshot de IVA MIXTO (la conciliación 03): neto 18.000, total 20.020 (café/comida 10% + bolsa 21%).
// IVA efectivo = 2.020/18.000 = 11,22% ≠ 10% → netear el bruto a 10% plano da 20.020/1,1 = 18.200 (mal).
const snapMix = am.componer("2026-09", [{ fecha: "2026-09-10", uds: 6200, neto: 18000, total: 20020 }], 100, {}, "test");

test("componer: neto = base sin IVA, total = bruto con IVA", () => {
  assert.strictEqual(snap.neto, 1000, "neto es la base");
  assert.strictEqual(snap.total, 1100, "total es el bruto (con IVA)");
  assert.strictEqual(snapMix.neto, 18000);
  assert.strictEqual(snapMix.total, 20020);
});

function conConfig(valor) {
  const db = { config: [{ id: "ventas_mes_2026-09", valor }], ventas: [], fixed_costs: [], debts: [], staff_finance: [], variable_costs: [], materias: [], productos: [], ajustes: [] };
  store.readAll = (n) => (db[n] || (db[n] = []));
  store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
  return cr.calcular({ mes: "2026-09" });
}

test("el cierre guardado (snap.neto) se usa como NETO, sin re-netear", () => {
  const r = conConfig(snap.neto); // lo que ahora guarda routes/analisis-mes.js (NETO)
  assert.strictEqual(r.cuenta.ventas_origen, "cierre_guardado");
  assert.strictEqual(r.cuenta.ingresos, 1000, "ingresos netos = el cierre guardado, sin dividir otra vez");
});

test("IVA MIXTO: el cierre neto cuadra al céntimo (no se netea a 10% plano · E2)", () => {
  const r = conConfig(snapMix.neto); // 18.000 netos
  assert.strictEqual(r.cuenta.ingresos, 18000, "ingresos = neto real de Ágora (Base)");
  // El método viejo (guardar el bruto 20.020 y netear a 10% plano) daba 18.200: inflado +200.
  assert.ok(Math.abs(18200 - snapMix.total / 1.10) < 0.01, "demostración: el neteo plano del bruto daba 18.200 (erróneo con IVA mixto)");
});

test("idempotente: reguardar el cierre que muestra la cuenta NO cambia la cifra", () => {
  const r1 = conConfig(snapMix.neto);
  const r2 = conConfig(r1.cuenta.ingresos); // el usuario reguarda lo que ve en el campo
  assert.strictEqual(r2.cuenta.ingresos, 18000, "neto entra, neto sale: estable al reguardar");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
