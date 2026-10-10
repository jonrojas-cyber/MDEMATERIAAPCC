// DASHBOARD CEO · cálculos del centro de mando. Prueba las funciones puras
// (estado, resultado del día, productividad €/h, cierre previsto por métodos,
// scoring de alertas, clasificación bebida) y un smoke test de calcular() que
// comprueba estados vacíos elegantes y el ensamblado completo.
// Ejecutar: node tests/dashboard-ceo.unit.js (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const dc = require("../backend/dashboard-ceo");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }
const near = (a, b, t) => Math.abs(a - b) <= (t == null ? 0.5 : t);

console.log("dashboard CEO · cálculos y estados");

// ── estado() ──
test("estado: sin objetivo → ok; menor-mejor y mayor-mejor con banda", () => {
  assert.strictEqual(dc.estado(100, {}), "ok", "con dato y sin objetivo → ok");
  assert.strictEqual(dc.estado(null, {}), "sin_datos");
  assert.strictEqual(dc.estado(5, { sinDatos: true }), "sin_datos");
  // Menor es mejor (food cost): 26 vs 27 ok; 29 (>27, dentro de 8%) atención; 40 crítico.
  assert.strictEqual(dc.estado(26, { objetivo: 27, menorMejor: true }), "ok");
  assert.strictEqual(dc.estado(29, { objetivo: 27, menorMejor: true }), "atencion");
  assert.strictEqual(dc.estado(40, { objetivo: 27, menorMejor: true }), "critico");
  // Mayor es mejor (ventas vs objetivo): 700 vs 650 ok; 620 atención; 300 crítico.
  assert.strictEqual(dc.estado(700, { objetivo: 650 }), "ok");
  assert.strictEqual(dc.estado(620, { objetivo: 650 }), "atencion");
  assert.strictEqual(dc.estado(300, { objetivo: 650 }), "critico");
});

// ── resultado del día ──
test("resultadoDiaDe: ventas NETAS − materia − personal − variables − fijos del día", () => {
  const r = dc.resultadoDiaDe({ ventas_netas: 500, coste_materia: 130, coste_laboral: 160, gastos_variables: 10, gastos_fijos: 50 });
  assert.ok(near(r.valor, 150), "500−130−160−10−50 = 150 (resultado operativo real, con fijos)");
  assert.strictEqual(r.parcial, false);
  const sinMateria = dc.resultadoDiaDe({ ventas_netas: 500, coste_materia: null, coste_laboral: 160, gastos_variables: 0 });
  assert.strictEqual(sinMateria.parcial, true, "sin escandallos → parcial");
  const sinVentas = dc.resultadoDiaDe({ ventas_netas: 0, coste_materia: 0, coste_laboral: 0, gastos_variables: 0 });
  assert.strictEqual(sinVentas.sin_datos, true);
});

// ── productividad €/hora ──
test("productividadDe: ventas ÷ horas; sin horas → sin datos", () => {
  const p = dc.productividadDe(480, 8, 30);
  assert.ok(near(p.valor, 60), "480/8 = 60 €/h");
  assert.ok(near(p.desviacion_eur, 30), "60 − 30 objetivo = 30");
  assert.strictEqual(dc.productividadDe(480, 0, 30).sin_datos, true, "sin fichajes → sin datos (no ∞)");
});

// ── cierre previsto (métodos en orden honesto) ──
test("cierrePrevistoDe: fracción de jornada si hay venta; media del día si no", () => {
  const a = dc.cierrePrevistoDe(200, 0.5, 900);
  assert.strictEqual(a.metodo, "fraccion_jornada");
  assert.ok(near(a.valor, 400), "200 / 0,5 = 400");
  const b = dc.cierrePrevistoDe(0, 0.5, 900);
  assert.strictEqual(b.metodo, "media_dia_semana");
  assert.ok(near(b.valor, 900));
  const c = dc.cierrePrevistoDe(0, 0.5, null);
  assert.strictEqual(c.metodo, "sin_datos");
  assert.strictEqual(c.valor, null);
});

// ── scoring de alertas ──
test("scoreAlerta: crítico > importante; impacto/APPCC/bloqueo suman", () => {
  const critLote = dc.scoreAlerta({ severidad: "critico", appcc: true });
  const impNormal = dc.scoreAlerta({ severidad: "importante" });
  assert.ok(critLote > impNormal, "un lote caducado (crítico+APPCC) pesa más que una tarea importante");
  const conImpacto = dc.scoreAlerta({ severidad: "importante", impacto_eur: 300 });
  assert.ok(conImpacto > impNormal, "impacto económico sube el score");
  const conBloqueo = dc.scoreAlerta({ severidad: "importante", bloquea: true });
  assert.ok(conBloqueo > impNormal, "bloquear procesos sube el score");
});

test("esBebida clasifica las familias de bebida", () => {
  assert.ok(dc.esBebida("Cafés") && dc.esBebida("Matcha") && dc.esBebida("Limonadas"));
  assert.ok(!dc.esBebida("Tostas") && !dc.esBebida("Bollería"));
});

// ── calcular() smoke: estados vacíos elegantes + ensamblado ──
function limpiar() {
  // Limpia TODO lo que lee el dashboard (los tests unitarios comparten los ficheros
  // de datos en disco; hay que dejar el estado vacío para probar los estados vacíos).
  ["ventas", "fichajes", "turnos", "productos", "materias", "fixed_costs", "config", "business_targets",
    "business_config", "financial_accounts", "treasury_movements", "preparaciones", "lotes", "recepciones",
    "pedidos", "revisiones", "debts", "variable_costs", "ajustes", "staff_finance", "usuarios",
    "sincronizaciones", "docs_agora", "proveedores", "compras_productos", "precios_historico"].forEach((e) => store.writeAll(e, []));
}

test("calcular: con todo vacío NO inventa (pendiente/sin_datos), nunca 0 como dato real", () => {
  limpiar();
  const now = new Date(2026, 9, 8, 13, 30, 0).getTime();
  const r = dc.calcular({ now });
  // Estructura completa.
  ["freshness", "kpis", "dia", "comercial", "atencion", "pulso", "tesoreria", "mes"].forEach((k) => assert.ok(r[k], "trae " + k));
  // Freshness pendiente (sin sync).
  assert.strictEqual(r.freshness.estado, "pendiente");
  // KPIs: sin ventas → pendiente/sin_datos, no "ok con 0".
  assert.ok(["pendiente", "sin_datos"].includes(r.kpis.ventas_hoy.estado), "ventas sin datos");
  assert.strictEqual(r.kpis.productividad.estado, "sin_datos", "sin fichajes → sin datos");
  assert.strictEqual(r.kpis.cierre_previsto.estado, "sin_datos");
  // Tesorería sin cuentas → pendiente (no 'crítico' por 0 €).
  assert.strictEqual(r.tesoreria.estado, "pendiente");
  // Pulso: 4 áreas con estado.
  ["produccion", "stock", "equipo", "appcc"].forEach((a) => assert.ok(r.pulso[a] && r.pulso[a].estado, "pulso " + a));
  assert.strictEqual(r.pulso.appcc.total, 8, "catálogo APPCC = 8 tareas/día");
  limpiar();
});

test("calcular: días abiertos restantes del mes NO cuentan los domingos (6 días/sem)", () => {
  limpiar();
  store.writeAll("business_config", [{ id: "perfil", dias_semana: 6 }]);
  // Miércoles 8 oct 2026. Del 9 al 31 hay 23 días; los domingos (11,18,25) no cuentan → 20.
  const now = new Date(2026, 9, 8, 13, 0, 0).getTime();
  const r = dc.calcular({ now });
  assert.strictEqual(r.mes.dias_abiertos_restantes, 20, "20 días abiertos restantes (sin domingos)");
  // Con 7 días/semana sí contarían los domingos (23).
  store.writeAll("business_config", [{ id: "perfil", dias_semana: 7 }]);
  assert.strictEqual(dc.calcular({ now }).mes.dias_abiertos_restantes, 23);
  limpiar();
});

if (fallos) { console.error(`\n${fallos} fallo(s) en dashboard CEO`); process.exit(1); }
console.log("  dashboard CEO OK");
