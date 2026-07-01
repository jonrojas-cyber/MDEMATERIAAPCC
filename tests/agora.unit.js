// Pruebas de la lógica de importación de Ágora (sin servidor HTTP).
// Llama a agora.importarDocs directamente contra el store (modo JSON) y
// valida las reglas críticas de la guía v8.9.3:
//   · idempotencia por GlobalId / Serie+Number
//   · bloqueo de documentos con producto no vinculado (no descuenta)
//   · libro de movimientos de stock
// Ejecutar: node tests/agora.unit.js  (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const agora = require("../backend/agora");

let fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log("  ✓ " + nombre); }
  catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); }
}

// Estado limpio de las entidades que tocamos.
["docs_agora", "stock_movements", "ventas"].forEach((n) => store.writeAll(n, []));

// Producto vinculado real del seed + una de sus materias.
const productos = store.readAll("productos");
const prod = productos.find((p) => (p.ingredientes || []).length) || productos[0];
assert.ok(prod, "hace falta al menos un producto con escandallo en el seed");
const ing0 = prod.ingredientes[0];
const stockAntes = (store.readAll("materias").find((m) => m.id === ing0.materia_id) || {}).disponibilidad_actual;

console.log("agora.importarDocs · reglas de la guía v8.9.3");

test("documento vinculado: procesa, descuenta stock y crea movimiento", () => {
  const r = agora.importarDocs({ docs: [{ type: "Invoice", Serie: "F", Number: 121, GlobalId: "uuid-1", Lines: [{ ProductName: prod.nombre, Quantity: 2, Amount: 17 }] }] });
  assert.strictEqual(r.procesados, 1, "1 procesado");
  assert.strictEqual(r.bloqueados, 0, "0 bloqueados");
  assert.deepStrictEqual(r.procesados_ref, [{ Serie: "F", Number: "121" }], "ref para confirmar a Ágora");
  const stockDespues = store.readAll("materias").find((m) => m.id === ing0.materia_id).disponibilidad_actual;
  assert.ok(stockDespues < stockAntes, "descontó stock");
  const movs = store.readAll("stock_movements").filter((m) => m.materia_id === ing0.materia_id);
  assert.ok(movs.length >= 1 && movs[0].delta < 0 && movs[0].source === "agora", "movimiento negativo registrado");
});

test("reimportar el MISMO documento (GlobalId) no descuenta dos veces", () => {
  const antes = store.readAll("materias").find((m) => m.id === ing0.materia_id).disponibilidad_actual;
  const r = agora.importarDocs({ docs: [{ type: "Invoice", Serie: "F", Number: 121, GlobalId: "uuid-1", Lines: [{ ProductName: prod.nombre, Quantity: 2, Amount: 17 }] }] });
  assert.strictEqual(r.procesados, 0, "0 procesados");
  assert.strictEqual(r.omitidos_ya_procesados, 1, "1 omitido (idempotente)");
  const despues = store.readAll("materias").find((m) => m.id === ing0.materia_id).disponibilidad_actual;
  assert.strictEqual(despues, antes, "el stock no volvió a bajar");
});

test("producto NO vinculado: bloquea el documento y no descuenta nada", () => {
  const antes = store.readAll("materias").find((m) => m.id === ing0.materia_id).disponibilidad_actual;
  const movsAntes = store.readAll("stock_movements").length;
  const r = agora.importarDocs({ docs: [{ type: "Invoice", Serie: "F", Number: 200, Lines: [{ ProductName: "ProductoQueNoExiste", Quantity: 1, Amount: 3 }] }] });
  assert.strictEqual(r.procesados, 0, "no procesa");
  assert.strictEqual(r.bloqueados, 1, "1 bloqueado");
  assert.ok(r.productos_no_vinculados.includes("ProductoQueNoExiste"), "reporta el no vinculado");
  const despues = store.readAll("materias").find((m) => m.id === ing0.materia_id).disponibilidad_actual;
  assert.strictEqual(despues, antes, "no tocó el stock");
  assert.strictEqual(store.readAll("stock_movements").length, movsAntes, "no creó movimientos");
});

test("idempotencia por Serie+Number cuando no hay GlobalId", () => {
  const uno = agora.importarDocs({ docs: [{ type: "DeliveryNote", Serie: "A", Number: 5, Lines: [{ ProductName: prod.nombre, Quantity: 1, Amount: 8.5 }] }] });
  assert.strictEqual(uno.procesados, 1);
  const dos = agora.importarDocs({ docs: [{ type: "DeliveryNote", Serie: "A", Number: 5, Lines: [{ ProductName: prod.nombre, Quantity: 1, Amount: 8.5 }] }] });
  assert.strictEqual(dos.procesados, 0);
  assert.strictEqual(dos.omitidos_ya_procesados, 1);
});

console.log(fallos ? `\n${fallos} prueba(s) FALLIDA(s)` : "\nTodas las pruebas de Ágora OK");
process.exit(fallos ? 1 : 0);
