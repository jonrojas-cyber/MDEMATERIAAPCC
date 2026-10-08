// COMPARATIVA A LA MISMA FECHA (MTD) · el mes EN CURSO se compara contra el mes/año
// anterior HASTA EL MISMO DÍA (días 1..N vs 1..N), NO contra el período completo.
// Regla de la fundadora: "los 10 primeros contra los 10 que llevamos; 11 con 11…".
// Ejecutar: node tests/comparativa-mtd.unit.js  (restaura backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const periods = require("../backend/periods");
const ex = require("../backend/executive-dashboard");
const cierre = require("../backend/cierre-mes");
const cashflow = require("../backend/cashflow");
const dc = require("../backend/dashboard-ceo");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("comparativa a la misma fecha (MTD)");

// ── A · helper puro ───────────────────────────────────────────────────────────
test("tramoHastaMismoDia: mes anterior cubre días 1..N (hoy = día 15 → 15 días)", () => {
  const now = new Date(2026, 5, 15, 12, 0, 0).getTime(); // 15 jun 2026
  const t = periods.tramoHastaMismoDia(now, { meses: 1 });
  assert.strictEqual(new Date(t.desde).getFullYear(), 2026);
  assert.strictEqual(new Date(t.desde).getMonth(), 4, "mayo");
  assert.strictEqual(new Date(t.desde).getDate(), 1, "empieza el día 1");
  assert.strictEqual(t.dias, 15, "incluye los primeros 15 días");
  // hasta exclusivo = inicio del día 16
  assert.strictEqual(new Date(t.hasta).getDate(), 16);
});

test("tramoHastaMismoDia: año anterior, mismo mes y tramo", () => {
  const now = new Date(2026, 5, 15, 12, 0, 0).getTime();
  const t = periods.tramoHastaMismoDia(now, { anios: 1 });
  assert.strictEqual(new Date(t.desde).getFullYear(), 2025);
  assert.strictEqual(new Date(t.desde).getMonth(), 5, "junio");
  assert.strictEqual(t.dias, 15);
});

test("tramoHastaMismoDia: capa al último día si el mes anterior es más corto (31→feb)", () => {
  const now = new Date(2026, 2, 31, 12, 0, 0).getTime(); // 31 mar 2026
  const t = periods.tramoHastaMismoDia(now, { meses: 1 });
  assert.strictEqual(new Date(t.desde).getMonth(), 1, "febrero");
  assert.strictEqual(t.dias, 28, "febrero 2026 tiene 28 días (no se compara un día que no existió)");
});

// ── Fixtures de ventas + entidades de coste a cero (aísla el efecto) ───────────
const SNAP = {};
["ventas", "fixed_costs", "staff_finance", "compras", "treasury_movements"].forEach((e) => { SNAP[e] = (store.readAll(e) || []).slice(); });

function fixtures() {
  store.writeAll("fixed_costs", []);
  store.writeAll("staff_finance", []);
  store.writeAll("compras", []);
  store.writeAll("treasury_movements", []);
  store.writeAll("ventas", [
    // Mes EN CURSO (junio): un día dentro del tramo (día 5 ≤ 15) = 300 €.
    { id: "mtd_jun5", producto_id: "x", producto: "X", cantidad: 1, importe: 300, importe_neto: 300, fecha: "2026-06-05" },
    // Mes anterior (mayo): 100 € DENTRO del tramo (día 5) + 900 € FUERA (día 25).
    { id: "mtd_may5", producto_id: "x", producto: "X", cantidad: 1, importe: 100, importe_neto: 100, fecha: "2026-05-05" },
    { id: "mtd_may25", producto_id: "x", producto: "X", cantidad: 1, importe: 900, importe_neto: 900, fecha: "2026-05-25" },
  ]);
}
const NOW = new Date(2026, 5, 15, 12, 0, 0).getTime(); // 15 jun 2026

// ── B · panel de dirección (dashboard) ─────────────────────────────────────────
test("panel mes: vs_anterior_pct compara hasta el mismo día (NO mes completo)", () => {
  fixtures();
  const P = ex.construir("hoy", { now: NOW }).panel_direccion;
  assert.strictEqual(P.mes.ventas, 300, "mes en curso = 300 €");
  // Bug antiguo: (300-1000)/1000 = -70 %. Correcto: (300-100)/100 = +200 %.
  assert.strictEqual(P.mes.vs_anterior_pct, 200, "compara contra mayo a la misma fecha (100 €), no contra mayo completo (1000 €)");
  assert.strictEqual(P.mes.ventas_mes_anterior_td, 100, "mayo hasta el día 15 = 100 €");
  assert.strictEqual(P.mes.dias_comparados, 15);
  // El OBJETIVO del mes sí usa el mes anterior COMPLETO (meta de mes entero): 1000 × 1,10.
  assert.strictEqual(P.mes.ventas_mes_anterior, 1000, "referencia del objetivo = mayo completo");
  assert.strictEqual(P.mes.objetivo, 1100, "objetivo = mayo completo × 1,10");
});

// ── C · informe de cierre de mes ────────────────────────────────────────────────
test("cierre (mes en curso): comparativa marcada parcial y delta a la misma fecha", () => {
  fixtures();
  const inf = cierre.informe("2026-06", NOW); // junio en curso
  const c = inf.comparativas.mes_anterior;
  assert.strictEqual(inf.estado_mes, "en_curso");
  assert.strictEqual(c.parcial, true, "la comparativa es parcial (a la misma fecha)");
  assert.strictEqual(c.dias, 15);
  assert.strictEqual(c.delta_ventas_pct, 200, "(300-100)/100 = +200 %, no vs mayo completo");
});

test("cierre (mes CERRADO): se comparan meses completos entre sí (no parcial)", () => {
  fixtures();
  const inf = cierre.informe("2026-05", NOW); // mayo ya cerrado el 15 de junio
  assert.strictEqual(inf.estado_mes, "cerrado");
  assert.strictEqual(inf.comparativas.mes_anterior.parcial, false, "dos meses cerrados → comparación completa");
});

// ── D · cash flow (tendencia mes vs mes anterior) ───────────────────────────────
test("cashflow: tendencia_pct usa el mes anterior a la misma fecha", () => {
  fixtures(); // costes a cero → neto = ventas
  const r = cashflow.resumen(NOW);
  // neto junio = 300; neto mayo-a-misma-fecha = 100 → +200 %.
  assert.strictEqual(r.tendencia_pct, 200, "tendencia contra mayo hasta el día 15 (100 €), no mayo completo (1000 €)");
});

// ── E · bloque comercial: nº tickets no se compara con el día en curso ──────────
test("comercial: el nº de tickets NO compara el día en curso contra un día completo", () => {
  fixtures();
  const d = dc.calcular({ now: NOW }); // 15 jun 12:00 → jornada en curso (fracDia < 1)
  assert.strictEqual(d.comercial.tickets.parcial, true, "día en curso → marcado parcial");
  assert.strictEqual(d.comercial.tickets.vs_dia_equivalente, null, "no muestra delta de recuento mientras la jornada está a medias");
});

// Restaura el estado original.
Object.keys(SNAP).forEach((e) => store.writeAll(e, SNAP[e]));

if (fallos) { console.error(`\n${fallos} fallo(s) en comparativa MTD`); process.exit(1); }
console.log("  comparativa MTD OK");
