// Fichaje: jornada (entrada/pausa/salida), estado, transiciones, comparación con
// el turno y resumen real vs plan. Ejecutar: node tests/fichaje.unit.js
const assert = require("assert");
const F = require("../backend/fichaje");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
// Timestamps en hora local de Málaga (CEST +02:00 en septiembre) → el motor los
// convierte a Europe/Madrid, así que las horas locales quedan como se escriben.
const T = (h) => new Date(`2026-09-13T${h}:00+02:00`).toISOString();

console.log("fichaje");

test("jornada suma horas trabajadas descontando la pausa", () => {
  const evs = [
    { tipo: "entrada", ts: T("07:00") },
    { tipo: "pausa_inicio", ts: T("11:00") },
    { tipo: "pausa_fin", ts: T("11:30") },
    { tipo: "salida", ts: T("15:00") },
  ];
  const j = F.jornada(evs, new Date(T("16:00")).getTime());
  assert.strictEqual(j.estado, "fuera");
  assert.strictEqual(j.entrada_hm, "07:00");
  assert.strictEqual(j.salida_hm, "15:00");
  assert.strictEqual(j.pausa_min, 30);
  assert.strictEqual(j.horas_trabajadas, 7.5); // 8h − 0,5h pausa
});

test("estado en curso cuenta hasta 'now' y ofrece las acciones válidas", () => {
  const evs = [{ tipo: "entrada", ts: T("09:00") }];
  const j = F.jornada(evs, new Date(T("12:00")).getTime());
  assert.strictEqual(j.estado, "trabajando");
  assert.strictEqual(j.horas_trabajadas, 3);
  assert.deepStrictEqual(j.permitidos, ["pausa_inicio", "salida"]);
});

test("transiciones: fuera→entrada; pausa→volver/salir", () => {
  assert.deepStrictEqual(F.permitidos("fuera"), ["entrada"]);
  assert.deepStrictEqual(F.permitidos("pausa"), ["pausa_fin", "salida"]);
});

test("contraTurno calcula retraso y salida anticipada", () => {
  const evs = [{ tipo: "entrada", ts: T("07:12") }, { tipo: "salida", ts: T("14:40") }];
  const j = F.jornada(evs, new Date(T("15:00")).getTime());
  const c = F.contraTurno(j, { inicio: "07:00", fin: "15:00", funcion: "Apertura" });
  assert.strictEqual(c.con_turno, true);
  assert.strictEqual(c.retraso_min, 12);       // entró 12 min tarde
  assert.strictEqual(c.salida_antes_min, 20);  // salió 20 min antes
  assert.strictEqual(c.horas_plan, 8);
});

test("resumen compara horas reales vs planificadas por persona", () => {
  const fichajes = [
    { persona: "Lara", fecha: "2026-09-13", tipo: "entrada", ts: T("09:00") },
    { persona: "Lara", fecha: "2026-09-13", tipo: "salida", ts: T("16:00") }, // 7h reales
  ];
  const turnos = [{ persona: "Lara", fecha: "2026-09-13", inicio: "09:00", fin: "17:00" }]; // 8h plan
  const r = F.resumen(fichajes, turnos, "2026-09-01", "2026-09-30");
  const lara = r.find((x) => x.persona === "Lara");
  assert.strictEqual(lara.horas_reales, 7);
  assert.strictEqual(lara.horas_plan, 8);
  assert.strictEqual(lara.diferencia, -1);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en fichaje`); process.exit(1); }
console.log("  fichaje OK");
