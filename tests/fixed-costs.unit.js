// Pruebas del Fixed Costs Operating System (PRD 005): normalización de
// periodicidades (incl. quincenal/semestral/personalizada), coste por hora,
// break-even, contribución y análisis de ahorro. Ejecutar:
//   node tests/fixed-costs.unit.js   (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const fixedCosts = require("../backend/fixed-costs");
const breakEven = require("../backend/break-even");
const costAnalytics = require("../backend/cost-analytics");
const fixedCostsOS = require("../backend/fixed-costs-os");

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }

const NOW = new Date(2026, 6, 15, 12, 0, 0).getTime();

function limpiar() {
  ["fixed_costs", "materias", "productos", "ventas", "staff_finance", "usuarios",
    "financial_snapshots", "business_config"].forEach((e) => store.writeAll(e, []));
}

console.log("fixed costs OS · periodicidades, hora, break-even, contribución");

test("normalización: quincenal, semestral y personalizada dan el coste diario correcto", () => {
  limpiar();
  // 140 € quincenal → 10 €/día ; 1825 € semestral (182.5 días) → 10 €/día ; custom 10 días 100€ → 10€/día
  assert.strictEqual(fixedCosts.costeDiario({ amount: 140, periodicity: "biweekly" }), 10);
  assert.strictEqual(fixedCosts.costeDiario({ amount: 1825, periodicity: "semiannual" }), 10);
  assert.strictEqual(fixedCosts.costeDiario({ amount: 100, periodicity: "custom", custom_days: 10 }), 10);
  // custom sin días → no aporta coste (no revienta)
  assert.strictEqual(fixedCosts.costeDiario({ amount: 100, periodicity: "custom" }), 0);
});

test("coste por hora: reparte el coste fijo entre las horas de apertura", () => {
  limpiar();
  // 3000 €/mes de fijo, 6 días × 10 h/semana → horas/mes ≈ 260.7 → ~11.5 €/h
  store.writeAll("fixed_costs", [{ id: "f1", name: "Alquiler", amount: 3000, periodicity: "monthly", active: true, start_date: "2024-01-01" }]);
  const ph = fixedCosts.costePorHora(NOW, { dias_semana: 6, horas_dia: 10 });
  assert.ok(ph.coste_hora > 10 && ph.coste_hora < 13, "coste/hora en rango esperado: " + ph.coste_hora);
  assert.ok(Math.abs(ph.coste_minuto - ph.coste_hora / 60) < 0.02, "minuto = hora/60");
});

test("break-even: ingreso de equilibrio = coste fijo / margen de contribución", () => {
  limpiar();
  // Coste fijo diario = 50 €. Carta: café precio 2, coste 0.5 → contribución 75%.
  store.writeAll("fixed_costs", [{ id: "f1", name: "Alquiler", amount: 50, periodicity: "daily", active: true, start_date: "2024-01-01" }]);
  store.writeAll("materias", [{ id: "m1", coste_medio: 0.5, disponibilidad_actual: 100 }]);
  store.writeAll("productos", [{ id: "p1", nombre: "Café", precio_venta: 2, activo: true, ingredientes: [{ materia_id: "m1", cantidad: 1 }] }]);
  const be = breakEven.puntoEquilibrio(NOW, { perfil: { ticket_medio: 4, cafe_medio: 2 } });
  assert.ok(be.disponible, "break-even disponible");
  assert.strictEqual(be.base_fija_diaria, 50, "base fija diaria = 50 (sin laboral)");
  // margen 75% → ingreso equilibrio = 50 / 0.75 = 66.67
  assert.ok(Math.abs(be.ingreso_equilibrio_dia - 66.67) < 0.1, "ingreso equilibrio ≈ 66.67: " + be.ingreso_equilibrio_dia);
  assert.strictEqual(be.hoy.cafes, Math.ceil(be.ingreso_equilibrio_dia / 2), "cafés = ingreso / precio café");
});

test("margen de seguridad: negativo cuando las ventas no cubren lo fijo", () => {
  limpiar();
  store.writeAll("fixed_costs", [{ id: "f1", name: "Alquiler", amount: 100, periodicity: "daily", active: true, start_date: "2024-01-01" }]);
  store.writeAll("materias", [{ id: "m1", coste_medio: 0.5, disponibilidad_actual: 100 }]);
  store.writeAll("productos", [{ id: "p1", nombre: "Café", precio_venta: 2, activo: true, ingredientes: [{ materia_id: "m1", cantidad: 1 }] }]);
  // Venta media muy baja hoy → por debajo del equilibrio.
  store.writeAll("ventas", [{ id: "v1", producto: "Café", cantidad: 1, importe: 2, fecha: new Date(NOW - 86400000).toISOString() }]);
  const be = breakEven.puntoEquilibrio(NOW, { perfil: { ticket_medio: 4, cafe_medio: 2 } });
  assert.strictEqual(be.en_perdidas, true, "está en pérdidas");
  assert.ok(be.margen_seguridad_pct < 0, "margen de seguridad negativo");
});

test("contribución: identifica los productos que más aportan", () => {
  limpiar();
  store.writeAll("materias", [{ id: "m1", coste_medio: 0.5, disponibilidad_actual: 100 }]);
  store.writeAll("productos", [
    { id: "p1", nombre: "Café", categoria: "Bebidas", precio_venta: 2, activo: true, ingredientes: [{ materia_id: "m1", cantidad: 1 }] },
    { id: "p2", nombre: "Tarta", categoria: "Dulce", precio_venta: 5, activo: true, ingredientes: [{ materia_id: "m1", cantidad: 2 }] },
  ]);
  const c = breakEven.contribucion();
  assert.strictEqual(c.top_contribuyentes[0].nombre, "Tarta", "la tarta aporta más € por venta");
  assert.ok(c.ratio_contribucion > 0 && c.ratio_contribucion < 1, "ratio de contribución en (0,1)");
});

test("analítica: detecta suscripción duplicada y estima el ahorro anual", () => {
  limpiar();
  store.writeAll("fixed_costs", [
    { id: "f1", name: "Spotify equipo", category: "Software", provider: "Spotify", amount: 10, periodicity: "monthly", active: true, start_date: "2024-01-01" },
    { id: "f2", name: "Spotify", category: "Software", provider: "Spotify", amount: 10, periodicity: "monthly", active: true, start_date: "2024-01-01" },
  ]);
  const a = costAnalytics.alertas(NOW);
  assert.ok(a.alertas.some((x) => x.tipo === "duplicado"), "detecta duplicado");
  assert.ok(a.ahorro_anual_potencial > 0, "estima ahorro anual > 0");
});

test("el Fixed Costs OS se ensambla en una sola respuesta coherente", () => {
  limpiar();
  store.writeAll("fixed_costs", [{ id: "f1", name: "Alquiler", category: "Alquiler", amount: 600, periodicity: "monthly", active: true, start_date: "2024-01-01" }]);
  store.writeAll("materias", [{ id: "m1", coste_medio: 0.5, disponibilidad_actual: 100 }]);
  store.writeAll("productos", [{ id: "p1", nombre: "Café", precio_venta: 2, activo: true, ingredientes: [{ materia_id: "m1", cantidad: 1 }] }]);
  const os = fixedCostsOS.sistemaOperativo(NOW);
  assert.ok(os.dashboard && os.break_even && os.contribucion && os.forecast && os.analitica, "trae todos los bloques");
  assert.ok(os.dashboard.coste_mes > 0, "coste mensual > 0");
  assert.ok(os.dashboard.coste_hora > 0, "coste por hora > 0");
  assert.ok(os.forecast.anual_proyectado >= os.forecast.anual_actual, "proyección con inflación ≥ actual");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de fixed costs fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de fixed costs OS OK");
