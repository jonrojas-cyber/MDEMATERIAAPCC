// Conciliación diaria Control M ⇄ Ágora: desglose por naturaleza, anulaciones,
// bloqueados y veredicto, más el job diario idempotente con alarma.
// Ejecutar: node tests/conciliacion-diaria.unit.js (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const cd = require("../backend/conciliacion-diaria");

let fallos = 0;
const tests = [];
function test(n, fn) { tests.push([n, fn]); }
function cerca(a, b, m) { assert.ok(Math.abs(a - b) < 0.001, `${m} (${a} vs ${b})`); }

const DIA = "2026-09-15";
const TARDE = new Date(DIA + "T18:00:00.000Z").getTime(); // ~20:00 Madrid (pasada la hora)

function limpiar() { ["ventas", "docs_agora", "productos", "materias", "config"].forEach((e) => store.writeAll(e, [])); }

test("día que cuadra: desglosa ventas/invitaciones/devoluciones y da veredicto 'cuadra'", () => {
  limpiar();
  store.writeAll("productos", [{ id: "p1", nombre: "Café" }]);
  store.writeAll("ventas", [
    { id: "v1", producto_id: "p1", producto: "Café", cantidad: 2, importe: 5.5, importe_neto: 5.0, fecha: DIA + "T10:00:00.000Z", naturaleza: "venta", doc_clave: "d1", doc_serie: "A", doc_number: 1 },
    { id: "v2", producto_id: "p1", producto: "Café", cantidad: 1, importe: 0, importe_neto: 0, fecha: DIA + "T11:00:00.000Z", naturaleza: "invitacion", doc_clave: "d2", doc_serie: "A", doc_number: 2 },
    { id: "v3", producto_id: "p1", producto: "Café", cantidad: -1, importe: -2.75, importe_neto: -2.5, fecha: DIA + "T12:00:00.000Z", naturaleza: "devolucion", doc_clave: "d3", doc_serie: "A", doc_number: 3 },
  ]);
  store.writeAll("docs_agora", [
    { id: "d1", status: "processed", type: "Ticket", serie: "A", number: 1, fecha: DIA },
    { id: "d2", status: "processed", type: "Ticket", serie: "A", number: 2, fecha: DIA },
    { id: "d3", status: "processed", type: "Ticket", serie: "A", number: 3, fecha: DIA },
  ]);
  const c = cd.cuadreDia(DIA, TARDE);
  assert.strictEqual(c.veredicto, "cuadra");
  cerca(c.ventas.bruto, 5.5, "bruto solo de ventas (no invit/devol)");
  cerca(c.ventas.neto, 5.0, "neto de ventas");
  cerca(c.ventas.iva, 0.5, "iva = bruto - neto");
  assert.strictEqual(c.invitaciones.n, 1, "una invitación aparte");
  assert.strictEqual(c.devoluciones.n, 1, "una devolución aparte");
  cerca(c.devoluciones.importe, -2.75, "importe devuelto (negativo)");
});

test("documento bloqueado (producto sin vincular) → 'descuadre' con incidencia", () => {
  limpiar();
  store.writeAll("docs_agora", [{ id: "b1", status: "blocked", type: "Ticket", serie: "A", number: 9, fecha: DIA, no_vinculados: ["Croissant nuevo"] }]);
  const c = cd.cuadreDia(DIA, TARDE);
  assert.strictEqual(c.veredicto, "descuadre");
  assert.strictEqual(c.bloqueados.n, 1);
  assert.ok(c.incidencias.some((i) => i.tipo === "bloqueados"), "incidencia de bloqueados");
});

test("anulaciones se cuentan desde docs_agora y NO rompen el cuadre", () => {
  limpiar();
  store.writeAll("docs_agora", [{ id: "a1", status: "processed", anulado: true, type: "Ticket", serie: "A", number: 5, fecha: DIA }]);
  const c = cd.cuadreDia(DIA, TARDE);
  assert.strictEqual(c.anulaciones.n, 1);
  assert.strictEqual(c.veredicto, "cuadra");
});

test("cronTick: concilia el día anterior una vez y es idempotente", async () => {
  limpiar();
  const r1 = await cd.cronTick(TARDE);
  assert.ok(["sin_novedades", "avisado", "omitido_sin_dispositivos"].includes(r1.accion), `primera vez concilia (${r1.accion})`);
  const r2 = await cd.cronTick(TARDE);
  assert.strictEqual(r2.accion, "omitido");
  assert.strictEqual(r2.motivo, "ya_conciliado_hoy");
});

test("cronTick: antes de la hora configurada no concilia", async () => {
  limpiar();
  const madrugada = new Date(DIA + "T03:00:00.000Z").getTime(); // ~05:00 Madrid
  const r = await cd.cronTick(madrugada);
  assert.strictEqual(r.accion, "omitido");
  assert.ok(/fuera_de_hora/.test(r.motivo), "motivo fuera_de_hora");
});

(async () => {
  console.log("conciliación diaria Control M ⇄ Ágora");
  for (const [n, fn] of tests) {
    try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); }
  }
  if (fallos) { console.error(`\n${fallos} prueba(s) de conciliación diaria fallaron`); process.exit(1); }
  console.log("\nTodas las pruebas de conciliación diaria OK");
})();
