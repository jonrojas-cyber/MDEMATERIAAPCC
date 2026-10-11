// Consistencia del motor de dinero (dinero.6/7/9/10): una sola fuente de verdad,
// sin constantes inventadas ni precisiones dispares entre pantallas.
//
// Ejecutar: node tests/dinero-consistencia.unit.js
const assert = require("assert");
const costing = require("../backend/costing");
const debts = require("../backend/debts");
const CR = require("../backend/cuenta-resultados");
const fmt = require("../backend/fmt");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("dinero · consistencia (6/7/9/10)");

// ── dinero.9 · precisión única de porcentajes (1 decimal) ─────────────────────
test("dinero.9 · food_cost_pct sale a 1 decimal (no entero) en cuenta de resultados", () => {
  // Ratio no entero: 0,266 → debe salir 26.6, no 27 (entero).
  const r = CR.componer({ ventas: 1000, coste_materia: 266, food_cost_pct: 0.266, personal: 0, otros_fijos: 0, variables: 0, cuota_creditos: 0 });
  assert.strictEqual(r.cuenta.food_cost_pct, 26.6, "1 decimal, no redondeo a entero");
});

test("dinero.9 · fmt.pct1 y fmt.pctDe son la fuente única y coinciden", () => {
  assert.strictEqual(fmt.pct1(0.333), 33.3);
  assert.strictEqual(fmt.pctDe(1, 3), 33.3);
  assert.strictEqual(fmt.pct1(null), null);
  assert.strictEqual(fmt.pctDe(1, 0), null, "no divide por base 0");
});

// ── dinero.10 · valor de stock, helper único por ítem + agregado exacto ───────
test("dinero.10 · valorStockMateria por ítem y valorStock agregado (sin doble redondeo)", () => {
  const materias = [
    { id: "m1", disponibilidad_actual: 3.333, coste_medio: 1 }, // 3,333
    { id: "m2", disponibilidad_actual: 2, coste_medio: 0.5 },   // 1,00
  ];
  assert.strictEqual(costing.valorStockMateria(materias[0]), 3.33, "por ítem a 2 decimales");
  assert.strictEqual(costing.valorStockRaw(materias[0]), 3.333, "raw sin redondear");
  // Agregado: suma en crudo (3,333 + 1) = 4,333 → 4,33 (redondeo único).
  assert.strictEqual(costing.valorStock(materias), 4.33);
});

// ── dinero.7 · margen de carta (no ponderado) ≠ margen realizado (ponderado) ──
test("dinero.7 · margenPonderadoVentas pondera por el mix real (distinto del de catálogo)", () => {
  const materias = [{ id: "mc", coste_medio: 0.2 }, { id: "mp", coste_medio: 1.6 }];
  const idx = costing.indiceMaterias(materias);
  // Café: barato (food cost bajo, margen alto). Tostada: caro (margen bajo).
  const productos = [
    { id: "cafe", nombre: "Café", precio_venta: 2.2, iva: 0.10, ingredientes: [{ materia_id: "mc", cantidad: 1 }] },
    { id: "tosta", nombre: "Tosta", precio_venta: 2.2, iva: 0.10, ingredientes: [{ materia_id: "mp", cantidad: 1 }] },
  ];
  const menu = costing.margenMedioCarta(productos, idx); // trata ambos por igual
  // Mix real: se vende MUCHO más tosta (margen bajo) que café → el realizado baja.
  const ventas = [
    { producto_id: "cafe", cantidad: 1 },
    { producto_id: "tosta", cantidad: 9 },
  ];
  const real = costing.margenPonderadoVentas(productos, ventas, idx);
  assert.ok(menu != null && real != null, "ambos calculables");
  assert.ok(real < menu, `realizado (${real}) < catálogo (${menu}): el mix de baja-margen pesa`);
  // Sin ventas costeables → null (no inventa un número).
  assert.strictEqual(costing.margenPonderadoVentas(productos, [], idx), null);
});

// ── dinero.6 · interés mensual data-driven (sin 30% plano) ────────────────────
test("dinero.6 · interés por TIPO anual: pendiente × tipo / 12", () => {
  // 12.000 € al 6% anual → 60 €/mes de interés.
  const d = { status: "activa", outstanding_amount: 12000, monthly_payment: 500, interest_rate: 6 };
  assert.strictEqual(debts.interesMensual(d), 60, "1200·0,06/12 = 60");
  // Admite tipo en fracción (0,06) igual.
  assert.strictEqual(debts.interesMensual({ ...d, interest_rate: 0.06 }), 60);
});

test("dinero.6 · sin tipo, se deriva de la amortización real (no un 30% inventado)", () => {
  // Cuota 100 × 12 meses = 1200 pagados; pendiente 1000 → intereses totales 200;
  // 200 / 12 cuotas ≈ 16,67 €/mes. El 30% plano habría dado 30 € (100·0,3).
  const d = { status: "activa", outstanding_amount: 1000, monthly_payment: 100, end_date: new Date(Date.now() + 365 * 86400000).toISOString() };
  const im = debts.interesMensual(d);
  assert.ok(im > 15 && im < 18, `derivado de la amortización (${im}), no 30 € planos`);
  assert.notStrictEqual(im, 30, "no es el 30% de la cuota");
});

test("dinero.6 · deuda sin cuota ni tipo → 0 (no inventa interés)", () => {
  assert.strictEqual(debts.interesMensual({ status: "activa", outstanding_amount: 500 }), 0);
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
