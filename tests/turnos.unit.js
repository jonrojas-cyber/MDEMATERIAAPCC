// Turnos (por fecha): horas, semana, cuadrante, solapes.
// Ejecutar: node tests/turnos.unit.js
const assert = require("assert");
const T = require("../backend/turnos");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("turnos (por fecha)");

test("horasTurno calcula la duración (y cruza medianoche)", () => {
  assert.strictEqual(T.horasTurno({ inicio: "07:00", fin: "15:00" }), 8);   // Apertura
  assert.strictEqual(T.horasTurno({ inicio: "10:00", fin: "14:00" }), 4);   // Apoyo
  assert.strictEqual(T.horasTurno({ inicio: "11:00", fin: "17:00" }), 6);   // Vuelta
  assert.strictEqual(T.horasTurno({ inicio: "22:00", fin: "02:00" }), 4);
});

test("lunesDe y diaIdx sin desfase de zona", () => {
  assert.strictEqual(T.lunesDe("2026-09-09"), "2026-09-07"); // miércoles → lunes 7
  assert.strictEqual(T.lunesDe("2026-09-07"), "2026-09-07");
  assert.strictEqual(T.lunesDe("2026-09-13"), "2026-09-07"); // domingo → mismo lunes
  assert.strictEqual(T.diaIdx("2026-09-07"), 0); // lunes
  assert.strictEqual(T.diaIdx("2026-09-13"), 6); // domingo
  assert.deepStrictEqual(T.fechasSemana("2026-09-07")[6], "2026-09-13");
});

test("cuadranteSemana coloca cada turno en persona/fecha y suma horas", () => {
  const turnos = [
    { id: "a", persona: "Daniel", fecha: "2026-09-07", inicio: "09:00", fin: "17:00", funcion: "Cierre" }, // 8h
    { id: "b", persona: "Daniel", fecha: "2026-09-09", inicio: "07:00", fin: "15:00", funcion: "Apertura" }, // 8h
    { id: "c", persona: "Jon", fecha: "2026-09-07", inicio: "07:00", fin: "15:00", funcion: "Apertura" }, // 8h
    { id: "z", persona: "Daniel", fecha: "2026-09-20", inicio: "09:00", fin: "17:00" }, // otra semana
  ];
  const c = T.cuadranteSemana(turnos, "2026-09-10"); // jueves de la semana del 7
  assert.strictEqual(c.lunes, "2026-09-07");
  assert.strictEqual(c.fechas.length, 7);
  assert.deepStrictEqual(c.personas, ["Daniel", "Jon"]);
  assert.strictEqual(c.grid["Daniel"]["2026-09-07"].length, 1);
  assert.strictEqual(c.grid["Daniel"]["2026-09-20"], undefined); // fuera de la semana
  const dani = c.resumen.find((r) => r.persona === "Daniel");
  assert.strictEqual(dani.horas, 16); // 8 + 8 (no cuenta el de otra semana)
});

test("detecta solapes de la misma persona la misma fecha (no en fechas distintas)", () => {
  const turnos = [
    { persona: "Ana", fecha: "2026-09-07", inicio: "09:00", fin: "13:00" },
    { persona: "Ana", fecha: "2026-09-07", inicio: "12:00", fin: "16:00" },
    { persona: "Ana", fecha: "2026-09-08", inicio: "09:00", fin: "13:00" },
  ];
  const s = T.solapesDe(turnos);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].fecha, "2026-09-07");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en turnos`); process.exit(1); }
console.log("  turnos OK");
