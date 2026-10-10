// Cuadre con Ágora: la ingesta NO debe sumar de más frente a "VENTAS HOY" de Ágora.
//  (1) Un PEDIDO (SalesOrder) no es venta cerrada → no se cuenta.
//  (2) Una DEVOLUCIÓN (línea con cantidad negativa) RESTA (antes se descartaba).
// Ejecutar: node tests/agora-cuadre.unit.js
const assert = require("assert");
const store = require("../backend/data-store");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

function montar() {
  const db = {
    productos: [{ id: "p-cafe", nombre: "Café", ingredientes: [] }],
    materias: [], ventas: [], docs_agora: [], stock_movements: [], sincronizaciones: [],
  };
  let seq = 0;
  store.readAll = (n) => (db[n] || (db[n] = []));
  store.writeAll = (n, a) => { db[n] = a; };
  store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
  store.insert = (n, o) => { (db[n] = db[n] || []).push(o); return o; };
  store.update = (n, id, patch) => { const x = (db[n] || []).find((y) => y.id === id); if (x) Object.assign(x, patch); return x; };
  store.nextId = (p) => `${p}-${++seq}`;
  store.flush = async () => {};
  return db;
}

const agora = require("../backend/agora");

console.log("cuadre de ingesta con Ágora");

test("un PEDIDO (SalesOrder) no se cuenta como venta", () => {
  const db = montar();
  const docs = {
    Invoices: [{ Serie: "T", Number: 1, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 10, TotalAmount: 20 }] }],
    SalesOrders: [{ Serie: "P", Number: 1, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 5, TotalAmount: 10 }] }],
  };
  const r = agora.importarDocs(docs, {});
  assert.strictEqual(r.pedidos_omitidos, 1, "el pedido se omite");
  assert.strictEqual(r.importe_total, 20, "solo cuenta la factura (20), no el pedido (10)");
  assert.strictEqual(db.ventas.length, 1, "una sola venta registrada (la factura)");
});

test("una DEVOLUCIÓN (cantidad negativa) RESTA del total", () => {
  const db = montar();
  const docs = {
    Invoices: [
      { Serie: "T", Number: 1, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 10, TotalAmount: 20 }] },
      { Serie: "T", Number: 2, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: -2, TotalAmount: 4 }] },
    ],
  };
  const r = agora.importarDocs(docs, {});
  assert.strictEqual(r.importe_total, 16, "20 − 4 (devolución) = 16");
  assert.strictEqual(r.unidades_vendidas, 8, "10 − 2 = 8");
  const dev = db.ventas.find((v) => v.importe < 0);
  assert.ok(dev && dev.importe === -4, "la devolución queda registrada en negativo");
});

test("la devolución repone stock (no lo descuenta)", () => {
  const db = montar();
  db.productos = [{ id: "p-cafe", nombre: "Café", ingredientes: [{ materia_id: "m1", cantidad: 2 }] }];
  db.materias = [{ id: "m1", nombre: "Grano", disponibilidad_actual: 100, unidad: "g" }];
  const docs = { Invoices: [{ Serie: "T", Number: 5, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: -3, TotalAmount: 6 }] }] };
  agora.importarDocs(docs, {});
  // Devolución de 3 cafés × 2 g = +6 g repuestos.
  assert.strictEqual(db.materias[0].disponibilidad_actual, 106, "stock repuesto (+6), no descontado");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
