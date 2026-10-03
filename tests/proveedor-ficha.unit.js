// Ficha de proveedor (Gstock): artículos con tarifa + facturas del mes + totales.
// Ejecutar: node tests/proveedor-ficha.unit.js
const assert = require("assert");
const pf = require("../backend/proveedor-ficha");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("ficha de proveedor");

function fakeStore(seed) {
  const d = JSON.parse(JSON.stringify(seed || {}));
  return { readAll: (e) => d[e] || (d[e] = []), findById: (e, id) => (d[e] || []).find((r) => r.id === id) || null };
}

const STORE = fakeStore({
  proveedores: [
    { id: "p1", nombre: "Malaga Costa Fruit", estado: "Activo", categoria: "Fruta y verdura", contacto: "Juan", cif: "B111" },
    { id: "p2", nombre: "Otro", estado: "Activo" },
  ],
  compras_productos: [
    { id: "a1", proveedor_id: "p1", nombre: "Tomate rama", formato: "kg", cantidad_formato: 1, precio_sin_iva: 2, iva: 10 },
    { id: "a2", proveedor_id: "p1", nombre: "Lechuga", formato: "", cantidad_formato: 0, precio_sin_iva: 0, iva: null }, // pendiente
    { id: "a3", proveedor_id: "p2", nombre: "Ajeno", formato: "kg", cantidad_formato: 1, precio_sin_iva: 1, iva: 10 },
  ],
  recepciones: [
    { id: "r1", proveedor_id: "p1", tipo_documento: "factura", numero_documento: "F1", fecha: "2026-09-10T12:00:00Z", importe_total: 100, pendiente_pago: 100, estado: "Pendiente de confirmar", moneda: "EUR", origen: "gmail_paquete", documento_pdf_url: "data:application/pdf;base64,AA" },
    { id: "r2", proveedor_id: "p1", tipo_documento: "albaran", numero_documento: "ALB9", fecha: "2026-09-20T12:00:00Z", importe_total: 50, pendiente_pago: 0, estado: "Aceptado", moneda: "EUR" },
    { id: "r3", proveedor_id: "p1", tipo_documento: "factura", numero_documento: "F2", fecha: "2026-08-05T12:00:00Z", importe_total: 30, pendiente_pago: 30, estado: "Pendiente de confirmar", moneda: "EUR" },
    { id: "r4", proveedor_id: "p2", tipo_documento: "factura", numero_documento: "X", fecha: "2026-09-01T12:00:00Z", importe_total: 999, moneda: "EUR" },
  ],
});

test("devuelve artículos del proveedor con tarifa calculada y estado", () => {
  const f = pf.ficha(STORE, "p1", "2026-09");
  assert.strictEqual(f.n_articulos, 2);
  const tomate = f.articulos.find((a) => a.nombre === "Tomate rama");
  assert.strictEqual(tomate.precio_con_iva, 2.2);      // 2 * 1.10
  assert.strictEqual(tomate.precio_unitario_real, 2.2); // /1 kg
  assert.strictEqual(tomate.pendiente, false);
  const lechuga = f.articulos.find((a) => a.nombre === "Lechuga");
  assert.strictEqual(lechuga.pendiente, true);
  // Pendientes primero en el orden.
  assert.strictEqual(f.articulos[0].nombre, "Lechuga");
});

test("lista solo las facturas del mes pedido y calcula totales EUR", () => {
  const f = pf.ficha(STORE, "p1", "2026-09");
  assert.strictEqual(f.facturas.length, 2);               // r1 y r2 (septiembre)
  assert.strictEqual(f.resumen.n_facturas, 1);            // r1
  assert.strictEqual(f.resumen.n_albaranes, 1);           // r2
  assert.strictEqual(f.resumen.total_mes, 150);           // 100 + 50
  assert.strictEqual(f.resumen.pendiente_mes, 100);       // solo r1 pendiente
  // No mezcla el proveedor p2.
  assert.ok(!f.facturas.some((x) => x.numero_documento === "X"));
});

test("el navegador de meses ofrece los meses con documentos (desc)", () => {
  const f = pf.ficha(STORE, "p1");
  assert.deepStrictEqual(f.meses, ["2026-09", "2026-08"]);
  assert.strictEqual(f.mes, "2026-09"); // por defecto el más reciente
});

test("factura del mes expone tiene_documento_pdf para 'Ver factura'", () => {
  const f = pf.ficha(STORE, "p1", "2026-09");
  const r1 = f.facturas.find((x) => x.numero_documento === "F1");
  assert.strictEqual(r1.tiene_documento_pdf, true);
});

test("proveedor inexistente devuelve null", () => {
  assert.strictEqual(pf.ficha(STORE, "nope", "2026-09"), null);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en ficha de proveedor`); process.exit(1); }
console.log("  ficha de proveedor OK");
