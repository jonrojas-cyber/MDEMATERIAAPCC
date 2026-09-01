// Informe de compras: agrega líneas de recepciones por producto/proveedor/familia
// y periodo, sin inventar nada. Ejecutar: node tests/compras-informe.unit.js
const assert = require("assert");
const { agregar } = require("../backend/routes/compras-informe");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

const materias = [
  { id: "m1", nombre: "Tomate", unidad: "g", macro: "Fruta y verdura", subcategoria: "Verdura" },
  { id: "m2", nombre: "Lima", unidad: "g", macro: "Fruta y verdura" },
];
const proveedores = [{ id: "p1", nombre: "Frutería" }];
const recepciones = [
  { id: "r1", fecha: "2026-08-10T09:00:00Z", proveedor_id: "p1", importe_total: 100, tipo_documento: "albaran",
    lineas: [{ materia_id: "m1", cantidad: 5000, importe: 30, unidad_destino: "g" }, { materia_id: "m2", cantidad: 4800, importe: 18, unidad_destino: "g" }] },
  { id: "r2", fecha: "2026-08-20T09:00:00Z", proveedor_id: "p1", importe_total: 50, tipo_documento: "albaran",
    lineas: [{ materia_id: "m1", cantidad: 3000, importe: 20, unidad_destino: "g" }] },
  { id: "r3", fecha: "2026-07-01T09:00:00Z", proveedor_id: "p1", importe_total: 999, tipo_documento: "albaran",
    lineas: [{ materia_id: "m1", cantidad: 1000, importe: 5, unidad_destino: "g" }] },
];
const base = { recepciones, materias, proveedores };

console.log("informe de compras");

test("suma líneas del rango y agrupa por producto/proveedor", () => {
  const r = agregar(base, { desde: "2026-08-01", hasta: "2026-08-31" });
  assert.strictEqual(r.recepciones, 2);                 // r3 (julio) queda fuera
  assert.strictEqual(r.subtotal, 68);                   // 30+18+20
  assert.strictEqual(r.total_facturado, 150);           // 100+50 (sin filtro de línea)
  assert.strictEqual(r.gran_total, 150);
  const tomate = r.por_producto.find((x) => x.materia_id === "m1");
  assert.strictEqual(tomate.importe, 50);               // 30+20
  assert.strictEqual(tomate.cantidad, 8000);            // 5000+3000
  assert.strictEqual(tomate.familia, "Verdura");        // subcategoría manda
  assert.strictEqual(r.por_proveedor[0].importe, 68);
});

test("el rango de fechas excluye lo de fuera", () => {
  const r = agregar(base, { desde: "2026-07-01", hasta: "2026-07-31" });
  assert.strictEqual(r.recepciones, 1);
  assert.strictEqual(r.subtotal, 5);
});

test("filtro por familia deja total_facturado en null (no mezcla albaranes)", () => {
  const r = agregar(base, { desde: "2026-08-01", hasta: "2026-08-31", categoria: "Verdura" });
  assert.strictEqual(r.subtotal, 50);                   // solo Tomate (30+20)
  assert.strictEqual(r.total_facturado, null);
  assert.strictEqual(r.gran_total, 50);
  assert.strictEqual(r.por_producto.length, 1);
});

test("filtro por materia concreta", () => {
  const r = agregar(base, { desde: "2026-08-01", hasta: "2026-08-31", materia_id: "m2" });
  assert.strictEqual(r.subtotal, 18);
  assert.strictEqual(r.por_producto.length, 1);
  assert.strictEqual(r.por_producto[0].producto, "Lima");
});

test("filtro por proveedor", () => {
  const r = agregar(base, { proveedor_id: "p1" });
  assert.strictEqual(r.recepciones, 3);
  assert.strictEqual(r.subtotal, 73);                   // 30+18+20+5
});

if (fallos) { console.error(`\n${fallos} fallo(s) en informe de compras`); process.exit(1); }
console.log("  informe de compras OK");
