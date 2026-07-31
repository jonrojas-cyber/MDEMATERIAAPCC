// Zona horaria de Málaga (Europe/Madrid): la hora que se MUESTRA no debe
// depender de la zona del servidor (Render corre en UTC). Verano CEST +2,
// invierno CET +1. Ejecutar: node tests/tz.unit.js
const assert = require("assert");
const { partes } = require("../backend/tz");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("zona horaria · Europe/Madrid");

test("verano (CEST, +2): 10:21 UTC → 12:21 en Málaga", () => {
  const p = partes("2026-07-31T10:21:00Z");
  assert.strictEqual(p.day, "31");
  assert.strictEqual(p.month, "07");
  assert.strictEqual(p.year, "2026");
  assert.strictEqual(p.hour, "12");
  assert.strictEqual(p.minute, "21");
});

test("invierno (CET, +1): 10:00 UTC → 11:00 en Málaga", () => {
  const p = partes("2026-01-15T10:00:00Z");
  assert.strictEqual(p.hour, "11");
  assert.strictEqual(p.day, "15");
  assert.strictEqual(p.month, "01");
});

test("cambio de día: 23:30 UTC en verano → 01:30 del día siguiente en Málaga", () => {
  const p = partes("2026-07-31T23:30:00Z");
  assert.strictEqual(p.day, "01");
  assert.strictEqual(p.month, "08");
  assert.strictEqual(p.hour, "01");
  assert.strictEqual(p.minute, "30");
});

test("fecha inválida → null", () => {
  assert.strictEqual(partes("no-es-fecha"), null);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en tz`); process.exit(1); }
console.log("  tz OK");
