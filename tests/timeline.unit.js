// Prueba de los motores de PRD 002: Timeline+Delta, Forecast y Anomaly.
// Ejecutar: node tests/timeline.unit.js  (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const timeline = require("../backend/timeline");
const forecast = require("../backend/forecast");
const anomaly = require("../backend/anomaly");

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }

// Serie sintética de 30 días: patrimonio +100/día desde 1000; liquidez −50/día
// desde 3000; ventas 200/día constantes; un pico de merma el último día.
const base = new Date(2026, 5, 1).getTime();
const snaps = [];
for (let i = 0; i < 30; i++) {
  const f = new Date(base + i * 86400000);
  const ymd = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
  snaps.push({
    id: "snap-principal-" + ymd, local_id: "principal", fecha: ymd,
    patrimonio_neto: 1000 + i * 100, liquidez: 3000 - i * 50, deuda_total: 5000, salud: 55,
    ventas_dia: 200, beneficio_dia: 40, coste_laboral_dia: 60, coste_materia_dia: 60,
    merma_dia: i === 29 ? 120 : 8, valor_almacen: 2000, banco: 2000, caja: 500,
  });
}
store.writeAll("financial_snapshots", snaps);

console.log("timeline · delta / forecast / anomaly");

test("delta detecta la tendencia y la velocidad de un stock (patrimonio +100/día)", () => {
  const d = timeline.delta("patrimonio_neto");
  assert.strictEqual(d.tipo, "stock");
  assert.strictEqual(d.tendencia, "sube");
  assert.ok(Math.abs(d.velocidad_dia - 100) < 0.01, "velocidad ≈ 100/día, fue " + d.velocidad_dia);
});

test("delta de un flujo compara sumas de ventana (ventas semana)", () => {
  const d = timeline.delta("ventas_dia");
  assert.strictEqual(d.tipo, "flow");
  // 7 días × 200 = 1400 esta semana y la anterior → variación 0%.
  assert.ok(d.semana && d.semana.actual === 1400, "suma semanal = 1400, fue " + (d.semana && d.semana.actual));
});

test("forecast lineal proyecta un stock con confianza R²≈1", () => {
  const f = forecast.proyectar("patrimonio_neto", 30);
  assert.ok(f.disponible);
  assert.strictEqual(f.valor_actual, 3900);              // día 29 = 1000 + 29·100
  assert.strictEqual(f.valor_horizonte, 6900);           // + 30 días · 100
  assert.ok(f.confianza >= 0.99, "R² ≈ 1, fue " + f.confianza);
});

test("forecast responde '¿cuándo me quedo sin caja?' (runway a cero)", () => {
  const rw = forecast.runwayCaja();
  assert.strictEqual(rw.en_riesgo, true);
  // liquidez última = 1550, cae 50/día → ~31 días a cero.
  assert.ok(Math.abs(rw.dias_hasta_cero - 31) <= 1, "≈31 días, fue " + rw.dias_hasta_cero);
});

test("escenario '¿y si las ventas caen 10%?' reduce la proyección", () => {
  const e = forecast.escenario("ventas_dia", 30, -10);
  assert.strictEqual(e.base, 6000);       // 200 × 30
  assert.strictEqual(e.escenario, 5400);  // −10%
  assert.strictEqual(e.diferencia, -600);
});

test("anomaly detecta el pico de merma con severidad y acción", () => {
  const an = anomaly.detectar();
  const merma = an.find((a) => a.metric === "merma_dia");
  assert.ok(merma, "esperaba una anomalía de merma");
  assert.strictEqual(merma.preocupante, true);
  assert.ok(merma.accion && merma.explicacion, "trae explicación y acción");
});

test("no inventa anomalías cuando la serie es estable", () => {
  const estable = [];
  for (let i = 0; i < 20; i++) { const f = new Date(base + i * 86400000); const ymd = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`; estable.push({ id: "s-" + ymd, local_id: "principal", fecha: ymd, merma_dia: 10, ventas_dia: 200, liquidez: 2000, beneficio_dia: 30, coste_laboral_dia: 50, valor_almacen: 1000 }); }
  store.writeAll("financial_snapshots", estable);
  assert.strictEqual(anomaly.detectar().length, 0, "sin anomalías en serie estable");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de timeline fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de timeline OK");
