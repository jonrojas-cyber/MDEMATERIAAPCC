// Periodos y stock (bloque 06).
//  · motor-fechas.4: el comparativo "mes" no se desborda al mes siguiente cuando
//    el mes anterior es más corto (31 de marzo vs febrero).
//  · motor-fechas.5: el comparativo "año anterior" está alineado al día (sin la
//    hora), para no derivar 1 h en los cambios de horario.
//  · datos.7: un escandallo con materia inexistente se SEÑALA (no se traga en
//    silencio) y no descuenta stock fantasma.
// Ejecutar (en TZ Europe/Madrid, como el runner): node tests/periodos-stock.unit.js
const assert = require("assert");
const periods = require("../backend/periods");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("periodos y stock");

test("motor-fechas.4: comparativo 'mes' a 31 de marzo NO se desborda a marzo", () => {
  const now = new Date(2026, 2, 31, 12, 0, 0).getTime(); // 31 marzo 2026, mediodía
  const comp = periods.comparativoAnterior("mes", now);
  // El tramo anterior empieza el 1 de febrero y NO pasa del 1 de marzo (fin de febrero).
  assert.strictEqual(new Date(comp.desde).getMonth(), 1, "empieza en febrero");
  assert.ok(comp.hasta <= periods.startOfMonth(now), "no se desborda al mes en curso");
  assert.ok(comp.hasta <= periods.addMonths(comp.desde, 1), "capado al fin de febrero");
});

test("motor-fechas.5: comparativo 'año anterior' alineado al día (sin hora, sin deriva DST)", () => {
  const now = new Date(2026, 9, 25, 15, 30, 0).getTime(); // 25 oct 2026 (cambio de horario)
  const comp = periods.comparativoAnioAnterior("hoy", now);
  assert.strictEqual(new Date(comp.desde).getHours(), 0, "desde a medianoche");
  assert.strictEqual(new Date(comp.hasta).getHours(), 0, "hasta a medianoche");
  assert.strictEqual(new Date(comp.desde).getFullYear(), 2025, "año anterior");
});

test("semana siempre empieza en lunes", () => {
  // 2026-10-11 es domingo; su semana ISO empieza el lunes 2026-10-05.
  const now = new Date(2026, 9, 11, 12, 0, 0).getTime();
  const r = periods.rango("semana", now);
  assert.strictEqual(new Date(r.desde).getDay(), 1, "lunes");
});

// ── datos.7: integridad referencial en la ingesta de Ágora ───────────────────
const store = require("../backend/data-store");
function montarAgora() {
  const db = {
    productos: [{ id: "p-cafe", nombre: "Café", ingredientes: [{ materia_id: "m-existe", cantidad: 1 }, { materia_id: "m-NO", cantidad: 2 }] }],
    materias: [{ id: "m-existe", nombre: "Grano", disponibilidad_actual: 100, unidad: "g" }],
    ventas: [], docs_agora: [], stock_movements: [], sincronizaciones: [],
  };
  let seq = 0;
  store.readAll = (n) => (db[n] || (db[n] = []));
  store.writeAll = (n, a) => { db[n] = a; };
  store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
  store.insert = (n, o) => { (db[n] = db[n] || []).push(o); return o; };
  store.insertMany = (n, rows) => { const a = (db[n] = db[n] || []); (rows || []).forEach((r) => a.push(r)); return rows; };
  store.update = (n, id, patch) => { const x = (db[n] || []).find((y) => y.id === id); if (x) Object.assign(x, patch); return x; };
  store.nextId = (p) => `${p}-${++seq}`;
  store.flush = async () => {};
  return db;
}
const agora = require("../backend/agora");

test("datos.7: materia inexistente en escandallo se SEÑALA y no descuenta stock fantasma", () => {
  const db = montarAgora();
  const r = agora.importarDocs({ Invoices: [{ Serie: "T", Number: 1, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 1, TotalAmount: 2 }] }] }, {});
  assert.ok(Array.isArray(r.materias_faltantes) && r.materias_faltantes.length === 1, "señala 1 materia faltante");
  assert.ok(/m-NO/.test(r.materias_faltantes[0]), "identifica la materia inexistente");
  // La materia que SÍ existe se descontó (100 − 1 = 99); la inexistente no creó nada.
  assert.strictEqual(db.materias.find((m) => m.id === "m-existe").disponibilidad_actual, 99);
  assert.strictEqual(db.materias.length, 1, "no se inventó la materia inexistente");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
