// Cuadre Ágora de solo lectura (bloque 11): facturas + albaranes − devoluciones,
// pedidos excluidos, aviso de posible albarán+factura. Ejecutar:
//   node tests/cuadre-agora.unit.js
const assert = require("assert");
const { analizarExport } = require("../backend/cuadre-agora");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("cuadre Ágora (solo lectura)");

const EXPORT = {
  Invoices: [
    { Serie: "T", Number: 100, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 2, TotalAmount: 5 }] },
    { Serie: "T", Number: 101, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Tosta", Quantity: 1, TotalAmount: 8 }] },
    // Devolución: cantidad negativa → resta.
    { Serie: "T", Number: 102, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: -1, TotalAmount: -2.5 }] },
  ],
  DeliveryNotes: [
    // Albarán que coincide en Serie+Número con la factura T/100 → posible doble conteo.
    { Serie: "T", Number: 100, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 2, TotalAmount: 5 }] },
  ],
  SalesOrders: [
    // Pedido (comanda): NO es venta → excluido.
    { Serie: "P", Number: 7, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 3, TotalAmount: 7.5 }] },
  ],
};

test("suma facturas, resta devoluciones y EXCLUYE pedidos", () => {
  const r = analizarExport(EXPORT, { dia: "2026-10-10" });
  const d = r.dias[0];
  assert.strictEqual(d.facturas, 13, "5 + 8 = 13 (la devolución no suma aquí)");
  assert.strictEqual(d.albaranes, 5, "albarán 5");
  assert.strictEqual(d.devoluciones, -2.5, "devolución resta");
  assert.strictEqual(d.pedidos_excluidos, 7.5, "el pedido se informa aparte, no cuenta");
  // ventas = facturas + albaranes + devoluciones (albarán duplica T/100 a propósito aquí)
  assert.strictEqual(d.ventas_brutas, 15.5, "13 + 5 − 2,5");
});

test("avisa del posible doble conteo albarán+factura (mismo Serie+Número)", () => {
  const r = analizarExport(EXPORT, { dia: "2026-10-10" });
  assert.ok(r.posible_doble_conteo.includes("T|100"), "T/100 está como factura y como albarán");
  assert.strictEqual(r.posible_doble_conteo.length, 1);
});

test("totales agregados correctos", () => {
  const r = analizarExport(EXPORT);
  assert.strictEqual(r.total.pedidos_excluidos, 7.5);
  assert.strictEqual(r.total.devoluciones, -2.5);
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
