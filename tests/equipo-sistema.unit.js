// Sistema de Equipo: lógica pura de ausencias (días, activa hoy), orden del
// tablón y de incidencias. Ejecutar: node tests/equipo-sistema.unit.js
const assert = require("assert");
const aus = require("../backend/routes/ausencias");
const tab = require("../backend/routes/tablon");
const inc = require("../backend/routes/incidencias");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("sistema de equipo");

test("ausencias.dias cuenta días naturales inclusivos", () => {
  assert.strictEqual(aus.dias("2026-09-01", "2026-09-01"), 1);
  assert.strictEqual(aus.dias("2026-09-01", "2026-09-05"), 5);
  assert.strictEqual(aus.dias("2026-09-05", "2026-09-01"), 0); // fin < inicio
});

test("ausencias.activaEn: solo aprobadas y dentro del rango", () => {
  const a = { estado: "aprobada", desde: "2026-09-10", hasta: "2026-09-15" };
  assert.strictEqual(aus.activaEn(a, "2026-09-12"), true);
  assert.strictEqual(aus.activaEn(a, "2026-09-16"), false);
  assert.strictEqual(aus.activaEn({ ...a, estado: "pendiente" }, "2026-09-12"), false);
});

test("tablon.orden: fijados primero, luego por fecha desc", () => {
  const items = [
    { id: "a", fijado: false, fecha: "2026-09-01" },
    { id: "b", fijado: true, fecha: "2026-08-01" },
    { id: "c", fijado: false, fecha: "2026-09-10" },
  ];
  const o = tab.orden(items).map((x) => x.id);
  assert.deepStrictEqual(o, ["b", "c", "a"]); // fijado, luego más reciente
});

test("incidencias.orden: abiertas antes que resueltas; alta prioridad primero", () => {
  const items = [
    { id: "r", estado: "resuelta", prioridad: "alta", fecha: "2026-09-10" },
    { id: "baja", estado: "abierta", prioridad: "baja", fecha: "2026-09-10" },
    { id: "alta", estado: "abierta", prioridad: "alta", fecha: "2026-09-09" },
  ];
  const o = inc.orden(items).map((x) => x.id);
  assert.deepStrictEqual(o, ["alta", "baja", "r"]);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en sistema de equipo`); process.exit(1); }
console.log("  sistema de equipo OK");
