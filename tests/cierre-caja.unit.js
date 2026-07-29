// Cierre de caja · arqueo, conciliación y estados por tolerancia.
// Ejecutar: node tests/cierre-caja.unit.js
const assert = require("assert");
const cc = require("../backend/cierre-caja");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("cierre de caja · arqueo + conciliación");

test("arqueo suma monedas y billetes por su valor", () => {
  const total = cc.arqueoTotal({ "1": 10, "0.5": 4, "2": 5, "20": 3 });
  assert.strictEqual(total, 10 * 1 + 4 * 0.5 + 5 * 2 + 3 * 20); // 10+2+10+60 = 82
});

test("el arqueo manda sobre el importe directo si tiene unidades", () => {
  const c = { efectivo: { contado: 999, arqueo: { "50": 2, "10": 3 } } };
  assert.strictEqual(cc.contadoDe(c), 130); // 2×50 + 3×10, ignora el 999
  const c2 = { efectivo: { contado: 250, arqueo: {} } };
  assert.strictEqual(cc.contadoDe(c2), 250); // sin arqueo, usa el directo
});

test("efectivo esperado = fondo + ventas efectivo Ágora + ingresos − pagos − retiradas − devoluciones", () => {
  const c = {
    efectivo: { fondo_inicial: 150, contado: 430, ingresos: 0, retiradas: 0, arqueo: {} },
    agora_manual: { ventas_efectivo: 300 },
    movimientos: [{ tipo: "pago_proveedor", importe: 20, afecta_efectivo: true }],
    tarjetas: [], otros: [],
  };
  const con = cc.conciliar(c);
  assert.strictEqual(con.efectivo_esperado, 430); // 150 + 300 − 20
  assert.strictEqual(con.descuadre_efectivo, 0);  // contado 430 − esperado 430
  assert.strictEqual(con.clasificacion, "cuadrado");
});

test("descuadre de tarjetas = datáfonos − Ágora, y suma al total", () => {
  const c = {
    efectivo: { fondo_inicial: 100, contado: 100, arqueo: {} },
    agora_manual: { ventas_efectivo: 0, ventas_tarjeta: 505 },
    tarjetas: [{ total: 300 }, { total: 200 }], otros: [], movimientos: [],
  };
  const con = cc.conciliar(c);
  assert.strictEqual(con.tarjetas_datafonos, 500);
  assert.strictEqual(con.descuadre_tarjetas, -5); // 500 − 505
  assert.strictEqual(con.descuadre_total, -5);    // efectivo 0 + tarjetas −5
});

test("tolerancia: 0–1 cuadrado · 1,01–5 revisar · >5 incidencia", () => {
  const base = (dif) => ({ efectivo: { fondo_inicial: 0, contado: dif, arqueo: {} }, agora_manual: { ventas_efectivo: 0 }, tarjetas: [], otros: [], movimientos: [] });
  assert.strictEqual(cc.conciliar(base(0.5)).clasificacion, "cuadrado");
  assert.strictEqual(cc.conciliar(base(3)).clasificacion, "revisar");
  assert.strictEqual(cc.conciliar(base(9)).clasificacion, "incidencia");
  assert.strictEqual(cc.conciliar(base(9)).requiere_incidencia, true);
});

test("cerrar exige incidencia cuando el descuadre supera la tolerancia", () => {
  const c = {
    responsable_key: "Moni", turno: "Mañana",
    agora: { sincronizado_en: new Date().toISOString() },
    efectivo: { fondo_inicial: 0, contado: 50, arqueo: {} },
    agora_manual: { ventas_efectivo: 0 }, tarjetas: [], otros: [], movimientos: [], incidencia: null,
  };
  const faltan = cc.faltanObligatorios(c);
  assert.ok(faltan.some((f) => /incidencia/i.test(f)), "pide incidencia: " + JSON.stringify(faltan));
  c.incidencia = { tipo: "error_cambio" };
  assert.ok(!cc.faltanObligatorios(c).some((f) => /incidencia/i.test(f)), "con incidencia, ya no la pide");
});

test("las 14 denominaciones de euro están definidas", () => {
  assert.strictEqual(cc.DENOMINACIONES.length, 14);
  assert.ok(cc.DENOMINACIONES.includes(0.01) && cc.DENOMINACIONES.includes(200));
});

if (fallos) { console.error(`\n${fallos} prueba(s) de cierre de caja fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de cierre de caja OK");
