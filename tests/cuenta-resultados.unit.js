// Cuenta de resultados (P&L mensual): compone ingresos − materia − personal −
// fijos − variables = EBITDA − créditos = resultado, con proyección a mes.
// Ejecutar: node tests/cuenta-resultados.unit.js
const assert = require("assert");
const CR = require("../backend/cuenta-resultados");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
const cerca = (a, b, t = 0.05) => Math.abs(a - b) <= t;

console.log("cuenta de resultados");

const base = {
  etiqueta: "2026-09", diasMes: 30, diasTranscurridos: 19, enCurso: true,
  ventas: 9124.59, coste_materia: 2737.38,          // food cost 30%
  personal: 3166.67, otros_fijos: 848.65, variables: 0,
  cuota_creditos: 448.42, food_cost_pct: 0.30, ventas_origen: "manual_agora",
};

test("compone la cuenta: margen bruto, EBITDA y resultado", () => {
  const r = CR.componer(base);
  assert.ok(cerca(r.cuenta.margen_bruto, 6387.21), "margen bruto = ventas − materia");
  // EBITDA = 6387.21 − 3166.67 − 848.65 − 0 = 2371.89
  assert.ok(cerca(r.cuenta.ebitda, 2371.89), "EBITDA " + r.cuenta.ebitda);
  assert.ok(cerca(r.cuenta.resultado_caja, r.cuenta.ebitda - 448.42), "resultado = EBITDA − créditos");
  assert.strictEqual(r.cuenta.food_cost_pct, 30);
});

test("proyecta a mes completo (lineal por días)", () => {
  const r = CR.componer(base);
  assert.ok(r.proyeccion, "hay proyección en mes en curso");
  assert.ok(cerca(r.proyeccion.ingresos, 9124.59 * 30 / 19, 0.5), "ingresos proyectados");
  assert.ok(cerca(r.proyeccion.personal, 5000, 1), "personal a mes completo ≈ 5.000");
});

test("calcula el punto de equilibrio del mes con el food cost real", () => {
  const r = CR.componer(base);
  // contrib 0,70; fijos+cred a mes completo / 0,70
  const fijosMes = (base.personal + base.otros_fijos) * (30 / 19);
  const credMes = base.cuota_creditos * (30 / 19);
  assert.ok(cerca(r.equilibrio_mes, (fijosMes + credMes) / 0.70, 1), "equilibrio " + r.equilibrio_mes);
});

test("sin coste de materia → margen/EBITDA a null (no inventa)", () => {
  const r = CR.componer({ ...base, coste_materia: null, food_cost_pct: null });
  assert.strictEqual(r.cuenta.coste_materia, null);
  assert.strictEqual(r.cuenta.margen_bruto, null);
  assert.strictEqual(r.cuenta.ebitda, null);
  assert.strictEqual(r.equilibrio_mes, null);
});

test("mes cerrado: sin proyección", () => {
  const r = CR.componer({ ...base, enCurso: false, diasTranscurridos: 30 });
  assert.strictEqual(r.proyeccion, null);
});

test("un cierre mensual guardado en config manda sobre las ventas de la app", () => {
  // Simula el store con un cierre guardado para el mes en curso.
  const store = require("../backend/data-store");
  const now = Date.now();
  const R = CR.rangoMes(null, now);
  const id = `ventas_mes_${R.etiqueta}`;
  const prev = store.findById("config", id);
  if (prev) store.update("config", id, { valor: 7777 }); else store.insert("config", { id, valor: 7777 });
  try {
    const r = CR.calcular({ now });
    assert.strictEqual(r.cuenta.ingresos, 7777, "usa el cierre guardado");
    assert.strictEqual(r.cuenta.ventas_origen, "cierre_guardado");
    // El parámetro explícito gana incluso sobre el guardado.
    const r2 = CR.calcular({ now, ventas: 5000 });
    assert.strictEqual(r2.cuenta.ingresos, 5000);
    assert.strictEqual(r2.cuenta.ventas_origen, "manual_agora");
  } finally {
    if (prev) store.update("config", id, { valor: prev.valor }); else store.remove("config", id);
  }
});

test("rangoMes construye bien un mes dado y el mes en curso", () => {
  const r = CR.rangoMes("2026-09", new Date("2026-09-20T10:00:00").getTime());
  assert.strictEqual(r.etiqueta, "2026-09");
  assert.strictEqual(r.diasMes, 30);
  assert.strictEqual(r.enCurso, true);
  assert.ok(r.diasTranscurridos >= 19 && r.diasTranscurridos <= 20);
  // Un mes pasado no está en curso.
  const p = CR.rangoMes("2026-06", new Date("2026-09-20").getTime());
  assert.strictEqual(p.enCurso, false);
  assert.strictEqual(p.diasMes, 30);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en cuenta-resultados`); process.exit(1); }
console.log("  cuenta-resultados OK");
