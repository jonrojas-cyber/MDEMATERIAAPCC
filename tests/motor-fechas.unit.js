// Motor de FECHAS (motor-fechas.3-5). El negocio es de Málaga: las fronteras de
// día/semana/mes deben caer en medianoche de MADRID, no en la del proceso.
//
//  · motor-fechas.3 — un proceso ARRANCADO EN UTC (como Render) debe terminar en
//    Madrid: tz-init lo fuerza incondicionalmente. Una venta de las 00:30 de Madrid
//    pertenece al día de Madrid, no al anterior (UTC).
//  · motor-fechas.4 — fin de mes y 29 de febrero: el comparativo no desborda al mes
//    siguiente ni revienta en bisiestos.
//  · motor-fechas.5 — cambios de horario (29-mar, 25-oct): los días de DST duran
//    23 h / 25 h; el TZ del sistema lo resuelve, nuestra lógica no debe romperse.
//
// QUÉ RESUELVE EL TZ Y QUÉ LA LÓGICA PROPIA (contrato, ver backend/tz-init.js):
//  · process.env.TZ=Europe/Madrid → aritmética NATIVA de Date (periods.js) en hora
//    de Madrid, con DST ya incluido por el sistema.
//  · backend/tz.js (Intl + timeZone explícito) → formateo/agrupación por día local
//    SIN depender del TZ del proceso (defensa en profundidad).
//
// Ejecutar: node tests/motor-fechas.unit.js
const assert = require("assert");

// Simula el arranque en UTC de Render ANTES de cargar nada que use Date.
process.env.TZ = "UTC";
const { BIZ_TZ } = require("../backend/tz-init"); // debe forzar Madrid
const periods = require("../backend/periods");
const tz = require("../backend/tz");
const CR = require("../backend/cuenta-resultados");

const H = 3600000;
let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("motor de fechas · TZ Madrid forzada + DST + fin de mes + bisiesto");

test("motor-fechas.3 · tz-init FUERZA Madrid aunque el proceso arranque en UTC", () => {
  assert.strictEqual(process.env.TZ, "Europe/Madrid", "tz-init impone Madrid");
  assert.strictEqual(BIZ_TZ, "Europe/Madrid");
});

test("motor-fechas.3 · 00:30 de Madrid pertenece al día de Madrid, no al de UTC", () => {
  // 2026-01-15 23:30 UTC = 2026-01-16 00:30 Madrid (invierno, CET +1).
  const iso = "2026-01-15T23:30:00Z";
  // tz.js (lógica propia, Intl): agrupa por día de Madrid → 16, no 15.
  assert.strictEqual(tz.fechaLocal(iso), "2026-01-16", "tz.js agrupa en el día de Madrid");
  // periods.js (aritmética nativa, ya en Madrid por el TZ forzado): el inicio del
  // día es la medianoche de Madrid (23:00Z), no la de UTC (00:00Z del día 15).
  const sod = periods.startOfDay(Date.parse(iso));
  assert.strictEqual(new Date(sod).toISOString(), "2026-01-15T23:00:00.000Z", "medianoche de Madrid");
  assert.ok(sod > Date.parse("2026-01-15T00:00:00Z"), "NO es la medianoche UTC del 15");
});

test("motor-fechas.5 · 29-mar-2026 (adelanto) dura 23 h", () => {
  const d29 = periods.startOfDay(Date.parse("2026-03-29T10:00:00Z"));
  const d30 = periods.startOfDay(Date.parse("2026-03-30T10:00:00Z"));
  assert.strictEqual((d30 - d29) / H, 23, "el día del cambio de primavera dura 23 h");
});

test("motor-fechas.5 · 25-oct-2026 (atraso) dura 25 h", () => {
  const d25 = periods.startOfDay(Date.parse("2026-10-25T10:00:00Z"));
  const d26 = periods.startOfDay(Date.parse("2026-10-26T10:00:00Z"));
  assert.strictEqual((d26 - d25) / H, 25, "el día del cambio de otoño dura 25 h");
});

test("motor-fechas.4 · comparativo de un mes EN CURSO el día 31 no desborda al mes siguiente", () => {
  // 31 de marzo ~12:00 Madrid. El mes anterior (febrero, 28 días) es más corto que
  // el tramo transcurrido; el comparativo debe CAPARSE a febrero, no invadir marzo.
  const now = Date.parse("2026-03-31T10:00:00Z");
  const ca = periods.comparativoAnterior("mes", now);
  assert.ok(ca.hasta <= periods.startOfMonth(now), "no entra en marzo");
  assert.strictEqual(new Date(ca.desde).toISOString(), "2026-01-31T23:00:00.000Z", "empieza el 1 de feb (medianoche Madrid)");
  assert.strictEqual(new Date(ca.hasta).toISOString(), "2026-02-28T23:00:00.000Z", "termina el 1 de mar (medianoche Madrid)");
});

test("motor-fechas.4 · 29 de febrero bisiesto: el tramo del año anterior se capa a 28 (no revienta)", () => {
  const feb29 = Date.parse("2024-02-29T10:00:00Z"); // 2024 es bisiesto
  const tr = periods.tramoHastaMismoDia(feb29, { anios: 1 });
  assert.strictEqual(tr.dias, 28, "2023 no es bisiesto → se capa al 28");
  assert.strictEqual(new Date(tr.hasta).toISOString(), "2023-02-28T23:00:00.000Z", "hasta = 1 de mar 2023 (medianoche Madrid)");
  // No debe lanzar ni devolver NaN.
  assert.ok(Number.isFinite(tr.desde) && Number.isFinite(tr.hasta));
});

test("motor-fechas.4 · addMonths respeta el 1 del mes al cruzar febrero", () => {
  const ene31 = Date.parse("2026-01-31T12:00:00Z");
  const feb1 = periods.addMonths(periods.startOfMonth(ene31), 1);
  assert.strictEqual(tz.fechaLocal(feb1), "2026-02-01", "cae en el 1 de feb, no en el 3 de mar");
});

test("la semana SIEMPRE empieza en lunes (regla innegociable), en hora de Madrid", () => {
  // 2026-10-28 es miércoles. El lunes de esa semana es el 26.
  const mié = Date.parse("2026-10-28T10:00:00Z");
  assert.strictEqual(tz.fechaLocal(periods.startOfWeek(mié)), "2026-10-26");
});

test("motor-fechas.6 · proyección NO fiable los primeros días, con banda de confianza", () => {
  const base = { etiqueta: "2026-03", diasMes: 30, enCurso: true, ventas: 1000, coste_materia: 300,
    personal: 0, otros_fijos: 0, variables: 0, cuota_creditos: 0, food_cost_pct: 0.30 };
  // Día 1: el factor es 30× → proyección muy volátil → fiable:false, banda ancha.
  const d1 = CR.componer({ ...base, diasTranscurridos: 1 });
  assert.ok(d1.proyeccion, "hay proyección (no se oculta)");
  assert.strictEqual(d1.proyeccion.fiable, false, "día 1: NO fiable");
  assert.strictEqual(d1.proyeccion.dias_min_fiable, 3);
  assert.ok(d1.proyeccion.ingresos_min < d1.proyeccion.ingresos && d1.proyeccion.ingresos < d1.proyeccion.ingresos_max, "banda rodea la estimación");
  // Día 15: ya hay recorrido → fiable:true y banda MÁS ESTRECHA que en el día 1.
  const d15 = CR.componer({ ...base, diasTranscurridos: 15 });
  assert.strictEqual(d15.proyeccion.fiable, true, "día 15: fiable");
  assert.ok(d15.proyeccion.banda_pct < d1.proyeccion.banda_pct, "la banda se estrecha con los días");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
