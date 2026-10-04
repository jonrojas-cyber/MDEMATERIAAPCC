// Migración: limpia ventas duplicadas heredadas (sin doc_clave) en meses que ya
// tienen consumo (con doc_clave). Ejecutar: node tests/migracion-ventas-dup.unit.js
const assert = require("assert");
const mig = require("../backend/migracion-ventas-dup");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

function fakeStore(seed) {
  const d = JSON.parse(JSON.stringify(seed || {}));
  return { readAll: (e) => d[e] || (d[e] = []), writeAll: (e, v) => { d[e] = v; }, _data: d };
}

console.log("migración ventas duplicadas");

test("borra las ventas sin doc_clave del mes que ya tiene consumo (con doc_clave)", () => {
  const st = fakeStore({ ventas: [
    { id: "v1", producto_id: "p", cantidad: 1, importe: 2.2, importe_neto: 2, fecha: "2026-09-10", doc_clave: "TicketExport:T:1" }, // limpia
    { id: "v2", producto_id: "p", cantidad: 1, importe: 2.2, fecha: "2026-09-10" },                                                   // heredada (dup)
  ] });
  const r = mig.aplicar(st);
  assert.strictEqual(r.eliminadas, 1);
  const q = st.readAll("ventas");
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].id, "v1"); // se queda la del consumo (doc_clave)
});

test("NO toca un mes que solo tiene ventas antiguas (son el único dato)", () => {
  const st = fakeStore({ ventas: [
    { id: "a", producto_id: "p", cantidad: 1, importe: 2, fecha: "2026-07-05" }, // julio: sin consumo
    { id: "b", producto_id: "p", cantidad: 1, importe: 2, fecha: "2026-07-06" },
    { id: "c", producto_id: "p", cantidad: 1, importe: 2, fecha: "2026-09-10", doc_clave: "T:1" }, // sept: con consumo
  ] });
  const r = mig.aplicar(st);
  assert.strictEqual(r.eliminadas, 0);         // julio no se toca; sept no tiene heredadas
  assert.strictEqual(st.readAll("ventas").length, 3);
});

test("es idempotente: una segunda pasada no borra nada", () => {
  const st = fakeStore({ ventas: [
    { id: "v1", cantidad: 1, importe: 2.2, fecha: "2026-09-10", doc_clave: "T:1" },
    { id: "v2", cantidad: 1, importe: 2.2, fecha: "2026-09-10" },
  ] });
  mig.aplicar(st);
  const r2 = mig.aplicar(st);
  assert.strictEqual(r2.eliminadas, 0);
  assert.strictEqual(st.readAll("ventas").length, 1);
});

test("reconoce el consumo por doc_serie/doc_number aunque no haya doc_clave", () => {
  const st = fakeStore({ ventas: [
    { id: "v1", cantidad: 1, importe: 2.2, fecha: "2026-09-10", doc_serie: "T", doc_number: "1" }, // consumo
    { id: "v2", cantidad: 1, importe: 2.2, fecha: "2026-09-10" },                                   // heredada
  ] });
  const r = mig.aplicar(st);
  assert.strictEqual(r.eliminadas, 1);
  assert.strictEqual(st.readAll("ventas")[0].id, "v1");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en migración ventas`); process.exit(1); }
console.log("  migración ventas duplicadas OK");
