// Libro de stock único: toda entrada/salida deja asiento, los faltantes quedan
// visibles (no se ocultan con un recorte a 0), la taxonomía de mermas es única y la
// reconciliación reporta cobertura y descuadres. Ejecutar: node tests/stock-ledger.unit.js
// (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const ledger = require("../backend/stock-ledger");
const M = require("../backend/mermas-motivos");

let fallos = 0;
function test(nombre, fn) { try { fn(); console.log("  ✓ " + nombre); } catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); } }
function cerca(a, b, msg) { assert.ok(Math.abs(a - b) < 0.001, `${msg} (${a} vs ${b})`); }

function limpiar() {
  ["materias", "stock_movements", "ajustes", "lotes", "recetas"].forEach((e) => store.writeAll(e, []));
}

console.log("libro de stock único · asientos, faltantes, taxonomía y reconciliación");

test("entrada: suma al saldo y deja asiento 'compra'", () => {
  limpiar();
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "kg", disponibilidad_actual: 10, coste_medio: 2 }]);
  const r = ledger.aplicar(store, { materia_id: "m1", delta: 5, reason: "compra" });
  cerca(r.saldo, 15, "saldo tras entrada");
  cerca(store.findById("materias", "m1").disponibilidad_actual, 15, "disponibilidad actualizada");
  const movs = store.readAll("stock_movements");
  assert.strictEqual(movs.length, 1, "un asiento");
  assert.strictEqual(movs[0].reason, "compra");
  cerca(movs[0].delta, 5, "delta del asiento");
});

test("salida: resta del saldo y deja asiento con delta negativo", () => {
  limpiar();
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "kg", disponibilidad_actual: 10, coste_medio: 2 }]);
  const r = ledger.aplicar(store, { materia_id: "m1", delta: -3, reason: "merma" });
  cerca(r.saldo, 7, "saldo tras salida");
  cerca(r.faltante, 0, "sin faltante");
  cerca(store.readAll("stock_movements")[0].delta, -3, "delta negativo");
});

test("salida mayor que el stock: NO se oculta, se registra el faltante y se marca negativo", () => {
  limpiar();
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "kg", disponibilidad_actual: 4, coste_medio: 2 }]);
  const r = ledger.aplicar(store, { materia_id: "m1", delta: -10, reason: "merma" });
  cerca(store.findById("materias", "m1").disponibilidad_actual, 0, "el saldo no baja de 0");
  cerca(r.delta_efectivo, -4, "delta efectivo = lo que de verdad salió");
  cerca(r.faltante, 6, "faltante = lo que no se pudo descontar");
  const mv = store.readAll("stock_movements")[0];
  assert.strictEqual(mv.negativo, true, "asiento marcado como negativo");
  cerca(mv.faltante, 6, "faltante en el asiento");
});

test("asiento sin mover saldo: para el llamador que ya movió el stock (recepción)", () => {
  limpiar();
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "kg", disponibilidad_actual: 20, coste_medio: 2 }]);
  ledger.asiento(store, { materia_id: "m1", delta: 8, reason: "compra" });
  cerca(store.findById("materias", "m1").disponibilidad_actual, 20, "el saldo NO lo mueve el asiento");
  cerca(store.readAll("stock_movements")[0].delta, 8, "pero el asiento guarda el delta pedido");
});

test("flujo del periodo: entradas, salidas y mermas en unidades y €", () => {
  limpiar();
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "kg", disponibilidad_actual: 100, coste_medio: 3 }]);
  const hoy = new Date().toISOString();
  ledger.aplicar(store, { materia_id: "m1", delta: 10, reason: "compra", created_at: hoy });
  ledger.aplicar(store, { materia_id: "m1", delta: -4, reason: "venta", created_at: hoy });
  ledger.aplicar(store, { materia_id: "m1", delta: -2, reason: "merma", created_at: hoy });
  const f = ledger.flujo(store, hoy.slice(0, 10), hoy.slice(0, 10));
  cerca(f.entradas, 10, "entradas"); cerca(f.salidas, 6, "salidas"); cerca(f.mermas, 2, "mermas");
  cerca(f.entradas_eur, 30, "entradas €"); cerca(f.mermas_eur, 6, "mermas €");
});

test("reconciliación: cobertura del libro + faltantes visibles", () => {
  limpiar();
  store.writeAll("materias", [
    { id: "m1", nombre: "Café", unidad: "kg", disponibilidad_actual: 0, coste_medio: 2 },
    { id: "m2", nombre: "Leche", unidad: "L", disponibilidad_actual: 5, coste_medio: 1 }, // sin movimientos
  ]);
  ledger.aplicar(store, { materia_id: "m1", delta: -10, reason: "merma" }); // faltante 10 (sobre saldo 0)
  const rec = ledger.reconciliar(store);
  assert.strictEqual(rec.n_materias, 2);
  assert.strictEqual(rec.con_libro, 1, "solo m1 tiene asiento");
  assert.strictEqual(rec.sin_libro, 1, "m2 sin libro");
  assert.strictEqual(rec.con_faltante, 1, "m1 con faltante");
  cerca(rec.faltante_total_eur, 20, "faltante € = 10 uds × 2 €");
});

test("movimientosDe: saldo corrido hacia atrás, más reciente primero", () => {
  limpiar();
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "kg", disponibilidad_actual: 0, coste_medio: 2 }]);
  ledger.aplicar(store, { materia_id: "m1", delta: 10, reason: "compra", created_at: "2026-01-01T10:00:00.000Z" });
  ledger.aplicar(store, { materia_id: "m1", delta: -3, reason: "venta", created_at: "2026-01-02T10:00:00.000Z" });
  const libro = ledger.movimientosDe(store, "m1");
  assert.strictEqual(libro.movimientos[0].reason, "venta", "el más reciente primero");
  cerca(libro.movimientos[0].saldo_tras, 7, "saldo tras la venta");
  cerca(libro.movimientos[1].saldo_tras, 10, "saldo tras la compra");
});

// ── Taxonomía de mermas ÚNICA (ajustes ↔ mermas) ──
test("taxonomía única: los motivos antiguos de /ajustes se normalizan a la canónica", () => {
  // Los 6 strings de la lista plana antigua deben resolver a un motivo canónico con grupo.
  const legacy = ["caducidad", "error de preparación", "rotura", "sobreproducción", "devolución", "prueba I+D"];
  legacy.forEach((s) => {
    const mot = M.normalizar(s);
    assert.ok(mot && mot.k && mot.grupo, `'${s}' debe normalizar a un motivo canónico con grupo`);
  });
  // Y una etiqueta canónica y una clave también resuelven (misma taxonomía).
  assert.strictEqual(M.normalizar("Caducado").k, "caducado", "por etiqueta");
  assert.strictEqual(M.normalizar("roto").k, "roto", "por clave");
  assert.strictEqual(M.normalizar("inventado"), null, "un motivo inexistente no cuela");
  // Mapeos concretos de compatibilidad.
  assert.strictEqual(M.normalizar("rotura").k, "roto");
  assert.strictEqual(M.normalizar("sobreproducción").k, "sobrante");
});

if (fallos) { console.error(`\n${fallos} prueba(s) del libro de stock fallaron`); process.exit(1); }
console.log("\nTodas las pruebas del libro de stock OK");
