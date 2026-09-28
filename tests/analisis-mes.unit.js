// Análisis del mes: parser del export de Ágora + snapshot sembrado.
// Ejecutar: node tests/analisis-mes.unit.js
const assert = require("assert");
const am = require("../backend/analisis-mes");
const seed = require("../backend/seed-analisis-mes");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("análisis del mes");

// CSV sintético con el formato jerárquico del "Análisis de Ventas" de Ágora.
const CSV = [
  " ;Familia;Formato;Cantidad;Base;Total;Coste;Margen",
  "01/09/2026;;;10;100;110;0;100",
  "01/09/2026 -> T/001;;;3;30;33;0;30",
  ";Cafes;Latte;2;4;4,4;0;4",
  ";--;Tosta;1;6;6,6;0;6",
  "02/09/2026;;;5;50;55;0;50",
  "02/09/2026 -> T/002;;;5;50;55;0;50",
  ";Cafes;Latte;3;6;6,6;0;6",
].join("\n");

test("parseExportAgora suma días, cuenta tickets y agrega por familia", () => {
  const s = am.parseExportAgora(CSV);
  assert.strictEqual(s.mes, "2026-09");
  assert.strictEqual(s.neto, 150);          // 100 + 50 (filas de día)
  assert.strictEqual(s.total, 165);         // 110 + 55
  assert.strictEqual(s.uds, 15);            // 10 + 5
  assert.strictEqual(s.tickets, 2);         // dos filas "-> T/"
  assert.strictEqual(s.ticket_medio, 75);   // 150 / 2
  assert.strictEqual(s.dias_venta, 2);
});

test("renombra familias (Cafes→Cafés, --→Comida) y calcula %", () => {
  const s = am.parseExportAgora(CSV);
  const nombres = s.por_familia.map((f) => f.familia);
  assert.ok(nombres.includes("Cafés"), "falta Cafés: " + nombres.join(","));
  assert.ok(nombres.includes("Comida"), "falta Comida: " + nombres.join(","));
  const cafes = s.por_familia.find((f) => f.familia === "Cafés");
  assert.strictEqual(cafes.neto, 10);       // 4 + 6
});

test("patrón por día de semana con nombres correctos", () => {
  const s = am.parseExportAgora(CSV);
  const dias = s.por_dia_semana.map((d) => d.dia);
  assert.ok(dias.includes("Martes"), "01/09/2026 es martes");     // 1 sep 2026 = martes
  assert.ok(dias.includes("Miércoles"), "02/09/2026 es miércoles");
});

test("mesForzado tiene prioridad sobre la fecha detectada", () => {
  const s = am.parseExportAgora(CSV, "2026-08");
  assert.strictEqual(s.mes, "2026-08");
  assert.strictEqual(s.id, "am-2026-08");
});

test("un CSV sin ventas reconocibles lanza error", () => {
  assert.throws(() => am.parseExportAgora("hola;mundo\n;;;;;"), /vac|ventas|mes/i);
});

test("el snapshot sembrado de septiembre 2026 es coherente", () => {
  const s = seed.SNAP;
  assert.strictEqual(s.mes, "2026-09");
  assert.ok(Math.abs(s.neto - 12484.81) < 0.5, "neto=" + s.neto);
  assert.strictEqual(s.tickets, 1902);
  assert.ok(s.por_familia.some((f) => f.familia === "Comida"));
  assert.ok(s.por_familia.some((f) => f.familia === "Cafés"));
  assert.ok(s.serie.length >= 18, "serie=" + s.serie.length);
  // Los % de familia deben sumar ~100.
  const suma = s.por_familia.reduce((a, f) => a + f.pct, 0);
  assert.ok(Math.abs(suma - 100) < 1.5, "suma %=" + suma);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en análisis del mes`); process.exit(1); }
console.log("  análisis del mes OK");
