// FINANCIERO · resumen día·mes·año con cascada EBITDA. Comprueba el escalado
// (día abierto ↔ mes ↔ año), los ratios (food cost, personal, PRIME COST, fijos,
// EBITDA), el break-even por día abierto y que `calcular` autodetecta el último
// mes con datos. Ejecutar: node tests/financiero.unit.js (revertir backend/data).

const assert = require("assert");
const store = require("../backend/data-store");
const financiero = require("../backend/financiero");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.5 : tol);

console.log("financiero · cascada día·mes·año + ratios + break-even");

// ── componer (puro) ─────────────────────────────────────────────────────────
const BASE = { ingresos: 12492.72, coste_materia: 3248.11, personal: 4931.51, otros_fijos: 1379.34, variables: 0, cuota_creditos: 698.33 };

test("mes = base; día = mes / días abiertos; año = mes × 12 (escalado lineal)", () => {
  const c = financiero.componer(BASE, { dias_abiertos_mes: 26.1 });
  assert.ok(near(c.escalas.mes.ebitda, 2933.76, 0.5), "EBITDA mes ≈ 2933,76 (fue " + c.escalas.mes.ebitda + ")");
  assert.ok(near(c.escalas.dia.ebitda, 2933.76 / 26.1, 0.2), "EBITDA día = mes/26,1");
  assert.ok(near(c.escalas.anio.ebitda, 2933.76 * 12, 1), "EBITDA año = mes×12");
  // Consistencia: día × días abiertos ≈ mes.
  assert.ok(near(c.escalas.dia.ventas * 26.1, c.escalas.mes.ventas, 1), "ventas día × 26,1 ≈ ventas mes");
});

test("ratios: food cost, personal, PRIME COST, fijos y EBITDA sobre ventas", () => {
  const c = financiero.componer(BASE, { dias_abiertos_mes: 26.1 });
  assert.ok(near(c.ratios.food_cost_pct, 26, 0.3), "food cost ≈ 26%");
  assert.ok(near(c.ratios.personal_pct, 39.5, 0.3), "personal ≈ 39,5%");
  assert.ok(near(c.ratios.prime_cost_pct, 65.5, 0.3), "prime cost ≈ 65,5% (materia+personal)");
  assert.ok(near(c.ratios.fijos_pct, 11, 0.3), "fijos ≈ 11%");
  assert.ok(near(c.ratios.ebitda_pct, 23.5, 0.3), "EBITDA ≈ 23,5%");
  // Prime cost = food cost + personal (coherencia interna).
  assert.ok(near(c.ratios.prime_cost_pct, c.ratios.food_cost_pct + c.ratios.personal_pct, 0.2), "prime = food + personal");
});

test("prime cost en € = materia + personal a cualquier escala", () => {
  const c = financiero.componer(BASE, { dias_abiertos_mes: 26.1 });
  ["dia", "mes", "anio"].forEach((s) => {
    const e = c.escalas[s];
    assert.ok(near(e.prime_cost, e.coste_materia + e.personal, 0.1), "prime = materia+personal en " + s);
  });
});

test("break-even por día abierto, con y sin créditos", () => {
  const c = financiero.componer(BASE, { dias_abiertos_mes: 26.1 });
  const contrib = 1 - BASE.coste_materia / BASE.ingresos;      // ≈ 0,74
  const equMes = (BASE.personal + BASE.otros_fijos) / contrib;
  assert.ok(near(c.equilibrio.mes, equMes, 1), "equilibrio mes = fija/contribución");
  assert.ok(near(c.equilibrio.dia_abierto, equMes / 26.1, 0.2), "equilibrio día = mes/26,1");
  assert.ok(c.equilibrio.dia_abierto_con_creditos > c.equilibrio.dia_abierto, "con créditos pide vender más");
  assert.ok(c.equilibrio.margen_seguridad_pct > 0 && !c.equilibrio.en_perdidas, "vende por encima del equilibrio");
});

test("sin coste de materia → EBITDA y ratios a null (no inventa)", () => {
  const c = financiero.componer({ ingresos: 1000, coste_materia: null, personal: 500, otros_fijos: 100, variables: 0, cuota_creditos: 0 }, { dias_abiertos_mes: 26.1 });
  assert.strictEqual(c.escalas.mes.ebitda, null);
  assert.strictEqual(c.ratios.food_cost_pct, null);
  assert.strictEqual(c.ratios.prime_cost_pct, null);
});

// ── calcular (store) ──────────────────────────────────────────────────────────
function limpiar() {
  ["fixed_costs", "materias", "productos", "ventas", "config", "debts", "business_config", "variable_costs", "ajustes", "staff_finance", "business_targets"].forEach((e) => store.writeAll(e, []));
}

test("calcular autodetecta el último mes con datos (cierre de septiembre)", () => {
  limpiar();
  store.writeAll("config", [
    { id: "ventas_mes_2026-09", valor: 12492.72 },
    { id: "food_cost_manual_pct", valor: 26 },
  ]);
  store.writeAll("fixed_costs", [
    { id: "fc-lara", name: "Salario Lara", category: "Personal", amount: 2500, periodicity: "monthly", active: true },
    { id: "fc-daniel", name: "Salario Daniel", category: "Personal", amount: 2500, periodicity: "monthly", active: true },
    { id: "fc-alquiler", name: "Alquiler", category: "Alquiler", amount: 665.5, periodicity: "monthly", active: true },
    { id: "fc-luz", name: "Luz", category: "Luz", amount: 500, periodicity: "monthly", active: true },
  ]);
  store.writeAll("business_config", [{ id: "perfil", dias_semana: 6 }]);
  const now = new Date(2026, 9, 8, 12, 0, 0).getTime(); // octubre 2026 (sin ventas)
  const r = financiero.calcular({ now });
  assert.strictEqual(r.mes_base, "2026-09", "usa septiembre, el último mes con datos");
  assert.strictEqual(r.autodetectado, true, "marca que no es el mes en curso");
  assert.ok(r.tiene_materia, "con cierre + food cost manual sí hay cascada");
  assert.ok(near(r.ratios.food_cost_pct, 26, 0.5), "food cost 26%");
  // Personal segmentado como personal (no enterrado en fijos).
  assert.ok(r.segmentos.personal.length === 2, "dos personas en el segmento personal");
  assert.ok(near(r.segmentos.personal_total_mes, 5000, 1), "personal total 5.000 €/mes");
  assert.ok(near(r.segmentos.fijos_total_mes, 1165.5, 1), "otros fijos 1.165,5 €/mes (sin personal)");
  limpiar();
});

test("acumuladoAnio suma el P&L real de los meses con ventas (no proyecta)", () => {
  limpiar();
  store.writeAll("config", [
    { id: "food_cost_manual_pct", valor: 26 },
    { id: "ventas_mes_2026-07", valor: 8000 },
    { id: "ventas_mes_2026-08", valor: 11000 },
    { id: "ventas_mes_2026-09", valor: 12492.72 },
  ]);
  store.writeAll("fixed_costs", [
    { id: "fc-lara", category: "Personal", amount: 2500, periodicity: "monthly", active: true, start_date: "2026-07-01" },
    { id: "fc-daniel", category: "Personal", amount: 2500, periodicity: "monthly", active: true, start_date: "2026-07-01" },
    { id: "fc-alquiler", category: "Alquiler", amount: 665.5, periodicity: "monthly", active: true, start_date: "2026-07-01" },
    { id: "fc-luz", category: "Luz", amount: 500, periodicity: "monthly", active: true, start_date: "2026-07-01" },
  ]);
  store.writeAll("business_config", [{ id: "perfil", dias_semana: 6 }]);
  const now = new Date(2026, 9, 8, 12).getTime(); // 8 oct 2026 (octubre sin ventas)
  const ytd = financiero.acumuladoAnio(now);
  assert.strictEqual(ytd.meses, 3, "jul, ago, sep (octubre sin ventas no cuenta)");
  assert.ok(near(ytd.base.ingresos, 31492.72, 1), "ventas año = 8000+11000+12492,72");
  // El año es acumulado real, NO mes×12.
  const r = financiero.calcular({ now });
  assert.strictEqual(r.anio_info.acumulado, true);
  assert.strictEqual(r.anio_info.meses, 3);
  assert.ok(near(r.escalas.anio.ventas, 31492.72, 1), "escala año = ventas acumuladas reales");
  assert.ok(Math.abs(r.escalas.mes.ebitda * 12 - r.escalas.anio.ebitda) > 1000, "el año NO es mes×12");
  // Ratios del año son los reales acumulados (personal más alto que en septiembre solo).
  assert.ok(r.ratios_anio.personal_pct > r.ratios.personal_pct, "personal acumulado > personal del mes base");
  limpiar();
});

test("estadoObjetivo: verde/ámbar/rojo según objetivo (menos-mejor y más-mejor)", () => {
  // Menos es mejor (food/personal/prime/fijos).
  assert.strictEqual(financiero.estadoObjetivo(26, 27, true), "ok", "por debajo del objetivo → ok");
  assert.strictEqual(financiero.estadoObjetivo(65.5, 65, true), "warn", "un pelín por encima → ámbar");
  assert.strictEqual(financiero.estadoObjetivo(39.5, 30, true), "bad", "muy por encima → rojo");
  // Más es mejor (EBITDA).
  assert.strictEqual(financiero.estadoObjetivo(23.5, 20, false), "ok", "por encima del objetivo → ok");
  assert.strictEqual(financiero.estadoObjetivo(18, 20, false), "warn", "un poco por debajo → ámbar");
  assert.strictEqual(financiero.estadoObjetivo(10, 20, false), "bad", "muy por debajo → rojo");
  // Sin objetivo → sin color.
  assert.strictEqual(financiero.estadoObjetivo(26, null, true), null);
});

test("calcular incluye el semáforo de objetivos (business_targets)", () => {
  limpiar();
  store.writeAll("config", [{ id: "ventas_mes_2026-09", valor: 12492.72 }, { id: "food_cost_manual_pct", valor: 26 }]);
  store.writeAll("fixed_costs", [
    { id: "fc-lara", name: "Lara", category: "Personal", amount: 2500, periodicity: "monthly", active: true },
    { id: "fc-daniel", name: "Daniel", category: "Personal", amount: 2500, periodicity: "monthly", active: true },
    { id: "fc-alquiler", name: "Alquiler", category: "Alquiler", amount: 665.5, periodicity: "monthly", active: true },
    { id: "fc-luz", name: "Luz", category: "Luz", amount: 500, periodicity: "monthly", active: true },
  ]);
  store.writeAll("business_config", [{ id: "perfil", dias_semana: 6 }]);
  store.writeAll("business_targets", [
    { id: "t1", tipo: "food_cost", valor: 27, activo: true },
    { id: "t2", tipo: "coste_laboral", valor: 30, activo: true },
    { id: "t3", tipo: "ebitda", valor: 20, activo: true },
  ]);
  const r = financiero.calcular({ now: new Date(2026, 9, 8, 12).getTime() });
  assert.strictEqual(r.objetivos.food_cost.estado, "ok", "food 26 ≤ 27 → ok");
  assert.strictEqual(r.objetivos.food_cost.objetivo, 27);
  assert.strictEqual(r.objetivos.personal.estado, "bad", "personal ~39,5 >> 30 → rojo");
  assert.strictEqual(r.objetivos.ebitda.estado, "ok", "EBITDA ~23,5 ≥ 20 → ok");
  // Sin objetivo configurado → objetivo null, sin estado.
  assert.strictEqual(r.objetivos.fijos.objetivo, null);
  assert.strictEqual(r.objetivos.fijos.estado, null);
  limpiar();
});

if (fallos) { console.error(`\n${fallos} fallo(s) en financiero`); process.exit(1); }
console.log("  financiero OK");
