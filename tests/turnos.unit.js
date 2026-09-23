// Turnos: horas por turno, resumen por persona, solapes y cuadrante.
// Ejecutar: node tests/turnos.unit.js
const assert = require("assert");
const T = require("../backend/turnos");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("turnos");

test("horasTurno calcula la duración (y cruza medianoche)", () => {
  assert.strictEqual(T.horasTurno({ inicio: "09:00", fin: "16:00" }), 7);
  assert.strictEqual(T.horasTurno({ inicio: "11:30", fin: "15:00" }), 3.5);
  assert.strictEqual(T.horasTurno({ inicio: "22:00", fin: "02:00" }), 4); // cruza medianoche
  assert.strictEqual(T.horasTurno({ inicio: "malo", fin: "16:00" }), 0);
});

test("resumenPorPersona suma horas, turnos y funciones", () => {
  const turnos = [
    { persona: "Lara", dia: 1, inicio: "09:00", fin: "16:00", funcion: "Barra / Café" },
    { persona: "Lara", dia: 2, inicio: "09:00", fin: "14:00", funcion: "Cocina" },
    { persona: "Daniel", dia: 1, inicio: "10:00", fin: "18:00", funcion: "Cocina" },
  ];
  const r = T.resumenPorPersona(turnos);
  const lara = r.find((x) => x.persona === "Lara");
  assert.strictEqual(lara.horas, 12);   // 7 + 5
  assert.strictEqual(lara.turnos, 2);
  assert.deepStrictEqual(lara.funciones.sort(), ["Barra / Café", "Cocina"]);
  assert.strictEqual(r[0].persona, "Lara"); // ordenado por horas desc (Lara 12 > Daniel 8)
});

test("detecta solapes de la misma persona el mismo día", () => {
  const turnos = [
    { id: "a", persona: "Ana", dia: 3, inicio: "09:00", fin: "13:00", funcion: "Sala" },
    { id: "b", persona: "Ana", dia: 3, inicio: "12:00", fin: "16:00", funcion: "Barra / Café" },
    { id: "c", persona: "Ana", dia: 4, inicio: "09:00", fin: "13:00", funcion: "Sala" }, // otro día, no choca
  ];
  const s = T.solapesDe(turnos);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].persona, "Ana");
  assert.strictEqual(s[0].dia, 3);
});

test("no marca solape cuando se tocan justo (13:00–13:00)", () => {
  const turnos = [
    { persona: "Ana", dia: 1, inicio: "09:00", fin: "13:00" },
    { persona: "Ana", dia: 1, inicio: "13:00", fin: "17:00" },
  ];
  assert.strictEqual(T.solapesDe(turnos).length, 0);
});

test("cuadrante coloca cada turno en su persona/día, ordenado por hora", () => {
  const turnos = [
    { persona: "Lara", dia: 1, inicio: "14:00", fin: "18:00", funcion: "Cierre" },
    { persona: "Lara", dia: 1, inicio: "09:00", fin: "13:00", funcion: "Apertura" },
  ];
  const c = T.cuadrante(turnos);
  assert.deepStrictEqual(c.personas, ["Lara"]);
  assert.strictEqual(c.grid["Lara"][1].length, 2);
  assert.strictEqual(c.grid["Lara"][1][0].inicio, "09:00"); // ordenado
  assert.strictEqual(c.grid["Lara"][1][1].inicio, "14:00");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en turnos`); process.exit(1); }
console.log("  turnos OK");
