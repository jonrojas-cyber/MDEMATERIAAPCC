// Prueba del Business Health Engine (PRD 003): categorías, pesos configurables,
// RiskEngine y forecast de salud. Ejecutar: node tests/health.unit.js
// (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const health = require("../backend/business-health");
const risk = require("../backend/risk");
const forecast = require("../backend/forecast");
const periods = require("../backend/periods");

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }

const NOW = new Date(2026, 6, 2, 14, 0, 0).getTime();
const R = periods.rango("semana", NOW);

// Escenario base con algo de dato real (ventas, materias, deuda) y una serie de
// snapshots con liquidez cayendo (para el RiskEngine y el forecast de salud).
function seed() {
  store.writeAll("business_health_config", []);
  store.writeAll("materias", [
    { id: "m1", nombre: "Café", unidad: "g", disponibilidad_actual: 50, coste_medio: 0.02, stock_minimo: 100 },
    { id: "m2", nombre: "Leche", unidad: "ml", disponibilidad_actual: 3000, coste_medio: 0.001, stock_minimo: 500 },
  ]);
  store.writeAll("productos", [{ id: "p1", nombre: "Latte", activo: true, precio_venta: 3, ingredientes: [{ materia_id: "m1", cantidad: 8 }] }]);
  store.writeAll("ventas", [{ id: "v1", producto_id: "p1", producto: "Latte", cantidad: 50, importe: 150, fecha: new Date(NOW - 2 * 86400000).toISOString() }]);
  store.writeAll("ajustes", []);
  store.writeAll("debts", [{ id: "d1", name: "Préstamo", type: "loan", outstanding_amount: 8000, monthly_payment: 400, status: "activa" }]);
  store.writeAll("financial_accounts", [{ id: "a1", name: "Banco", type: "banco", balance: 2000, active: true }]);
  store.writeAll("fixed_costs", []); store.writeAll("staff_finance", []); store.writeAll("assets", []); store.writeAll("revisiones", []); store.writeAll("precios_historico", []);
  // Serie de liquidez descendente para RiskEngine/forecast.
  const snaps = [];
  for (let i = 0; i < 12; i++) { const f = new Date(NOW - (11 - i) * 86400000); const ymd = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`; snaps.push({ id: "snap-principal-" + ymd, local_id: "principal", fecha: ymd, liquidez: 3000 - i * 120, salud: 70 - i, patrimonio_neto: 5000, ventas_dia: 150, caja: 300, banco: 2000 - i * 120 }); }
  store.writeAll("financial_snapshots", snaps);
}

console.log("business-health · categorías, pesos, riesgo y forecast");
seed();

test("la salud se descompone en categorías con una nota global 0–100", () => {
  const h = health.calcular(R, NOW);
  assert.ok(h.score >= 0 && h.score <= 100, "score fuera de rango: " + h.score);
  assert.ok(Array.isArray(h.categorias) && h.categorias.length >= 8, "debe haber categorías");
  const claves = h.categorias.map((c) => c.clave);
  ["financial", "cash_flow", "inventory", "risk", "customer"].forEach((k) => assert.ok(claves.includes(k), "falta categoría " + k));
});

test("los pesos son configurables y cambian la nota global (no hardcodeados)", () => {
  const base = health.calcular(R, NOW).score;
  const riskScore = health.calcular(R, NOW).categorias.find((c) => c.clave === "risk").score;
  // Peso extremo a 'risk' → la global debe converger a la nota de riesgo.
  const pesos = {}; Object.keys(health.DEFAULT_PESOS).forEach((k) => (pesos[k] = 0.0001)); pesos.risk = 1000;
  store.writeAll("business_health_config", [{ id: "pesos", pesos }]);
  const soloRiesgo = health.calcular(R, NOW).score;
  assert.strictEqual(soloRiesgo, riskScore, `con todo el peso en riesgo la global (${soloRiesgo}) = nota de riesgo (${riskScore})`);
  assert.notStrictEqual(soloRiesgo, base, "cambiar los pesos cambia la nota global");
  store.writeAll("business_health_config", []); // restaura
});

test("el RiskEngine detecta el riesgo de caja con prioridad y acción", () => {
  const riesgos = risk.detectar(NOW);
  const caja = riesgos.find((r) => r.tipo === "caja");
  assert.ok(caja, "esperaba un riesgo de caja (liquidez cayendo)");
  assert.ok(caja.prioridad > 0 && caja.probabilidad > 0 && caja.impacto > 0, "prioridad = prob × impacto");
  assert.ok(caja.accion && caja.explicacion, "trae explicación y acción");
});

test("saludRiesgo devuelve 100 cuando no hay riesgos", () => {
  store.writeAll("financial_snapshots", []); store.writeAll("debts", []); store.writeAll("materias", []); store.writeAll("precios_historico", []); store.writeAll("revisiones", []);
  assert.strictEqual(risk.saludRiesgo(NOW).score, 100);
  seed(); // restaura escenario
});

test("el forecast de salud proyecta desde la serie histórica", () => {
  const f = forecast.proyectar("salud", 30, "principal");
  assert.ok(f.disponible, "con 12 días de histórico la previsión está disponible");
  assert.ok(f.valor_horizonte >= 0 && f.valor_horizonte <= 100, "la salud proyectada está en 0–100: " + f.valor_horizonte);
});

if (fallos) { console.error(`\n${fallos} prueba(s) de salud fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de business-health OK");
