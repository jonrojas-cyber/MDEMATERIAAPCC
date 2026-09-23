// Siembra de la rotación de turnos: verifica que los cómputos del ciclo cuadran
// con las hojas (Daniel 200 h, Lara 200 h, Jon 160 h) y que es idempotente.
// Ejecutar: node tests/seed-turnos.unit.js
const assert = require("assert");
const { filas, aplicar, SEMANAS, FLAG } = require("../backend/seed-turnos");
const T = require("../backend/turnos");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

function fakeStore(data) {
  return {
    readAll: (e) => data[e] || [],
    findById: (e, id) => (data[e] || []).find((r) => r.id === id) || null,
    insert: (e, r) => { (data[e] = data[e] || []).push(r); return r; },
    update: (e, id, patch) => { const r = (data[e] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
  };
}

console.log("seed de la rotación de turnos");

test("los cómputos cuadran por ciclo (Daniel/Lara 200 y 196, Jon 160×2)", () => {
  // Hoja 1 (5 semanas, 7–11 sep→oct): Daniel 200, Lara 200, Jon 160.
  const hoja1 = filas().filter((t) => t.fecha < "2026-10-12");
  const r1 = T.resumenPorPersona(hoja1);
  const h1 = (p) => r1.find((x) => x.persona === p).horas;
  assert.strictEqual(h1("Daniel"), 200);
  assert.strictEqual(h1("Lara"), 200);
  assert.strictEqual(h1("Jon"), 160);
  // Hoja 2 (con 'R'): 196 presenciales (+4 regaladas → 200 pagadas); Jon 160.
  const hoja2 = filas().filter((t) => t.fecha >= "2026-10-12");
  const r2 = T.resumenPorPersona(hoja2);
  const h2 = (p) => r2.find((x) => x.persona === p).horas;
  assert.strictEqual(h2("Daniel"), 196);
  assert.strictEqual(h2("Lara"), 196);
  assert.strictEqual(h2("Jon"), 160);
});

test("Jon es fijo: Apertura Lun/Mar, Apoyo Mié–Sáb, descansa Dom", () => {
  // semana 1: lunes 7 Apertura
  const l = filas().find((t) => t.persona === "Jon" && t.fecha === "2026-09-07");
  assert.strictEqual(l.funcion, "Apertura");
  const mi = filas().find((t) => t.persona === "Jon" && t.fecha === "2026-09-09");
  assert.strictEqual(mi.funcion, "Apoyo");
  const dom = filas().find((t) => t.persona === "Jon" && t.fecha === "2026-09-13");
  assert.strictEqual(dom, undefined); // domingo: descanso, sin turno
});

test("descansos (D) no crean turno; los tipos tienen su horario", () => {
  const f = filas();
  // Domingos: nadie trabaja.
  assert.strictEqual(f.filter((t) => t.fecha === "2026-09-13").length, 0);
  // Una 'R' de Lara (miércoles 14 oct) es 11:00–17:00 Vuelta.
  const r = f.find((t) => t.persona === "Lara" && t.fecha === "2026-10-14");
  assert.ok(r && r.funcion === "Vuelta" && r.inicio === "11:00" && r.fin === "17:00");
});

test("aplicar es idempotente por flag e id estable", () => {
  const data = { turnos: [], config: [] };
  const st = fakeStore(data);
  const r1 = aplicar(st);
  assert.ok(r1.ranAny && r1.creados > 0);
  const n = data.turnos.length;
  const r2 = aplicar(st);
  assert.strictEqual(r2.ranAny, false);
  assert.strictEqual(data.turnos.length, n);
  assert.ok(data.config.some((c) => c.id === FLAG));
  // ids únicos (una fila por persona+fecha).
  assert.strictEqual(new Set(data.turnos.map((t) => t.id)).size, data.turnos.length);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en seed-turnos`); process.exit(1); }
console.log("  seed-turnos OK");
