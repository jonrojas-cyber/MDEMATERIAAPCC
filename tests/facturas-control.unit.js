// Importador del "control de facturas" (Excel del Gmail): localiza la hoja de
// detalle, mapea columnas, empareja proveedor, dedupe y admite rectificativas.
// Ejecutar: node tests/facturas-control.unit.js
const assert = require("assert");
const fc = require("../backend/facturas-control");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("control de facturas");

function fakeStore(seed) {
  const d = JSON.parse(JSON.stringify(seed || {})); const s = {};
  return {
    readAll: (e) => d[e] || (d[e] = []),
    insert: (e, r) => { (d[e] || (d[e] = [])).push(r); return r; },
    findById: (e, id) => (d[e] || []).find((r) => r.id === id) || null,
    nextId: (p, e) => { s[e] = (s[e] || 0) + 1; return `${p}_${s[e]}`; },
    flush: async () => {}, _d: d,
  };
}

// Libro con DOS hojas: una de resumen (que NO debe confundirse) y el detalle.
const RESUMEN = [
  ["FACTURAS 2026 · M DE MATERIA"],
  ["Proveedor", "N.º facturas", "Total EUR", "Total USD"],
  ["Panamar", "2", "164.92", "0"],
];
const DETALLE = [
  ["Fecha factura", "Proveedor", "N.º factura", "Asunto del correo", "Fecha correo", "Moneda", "Base imponible", "IVA", "Total", "Archivo original"],
  ["2026-10-02T10:00:00.000Z", "Panamar Bakery Group", "2682029052", "Factura: 2682029052", "Fri, 2 Oct 2026", "EUR", "", "", "65.97", "2682029052.PDF"],
  ["2026-09-24T10:00:00.000Z", "Panamar Bakery Group", "2682028223", "Factura: 2682028223", "Thu, 24 Sep 2026", "EUR", "", "", "98.95", "2682028223.PDF"],
  ["2026-09-01T10:00:00.000Z", "Render Services", "A5PTFXWB-0003", "Your receipt", "Thu, 3 Sep 2026", "USD", "", "", "17.5", "Invoice.pdf"],
  ["2026-08-07T10:00:00.000Z", "Klimer 2000", "RECT26-374", "Rectificativa", "Fri, 7 Aug 2026", "EUR", "-31.8", "-6.68", "-38.48", "RECT.pdf"],
  ["", "", "", "", "", "", "", "", "", ""], // fila vacía
];
const HOJAS = [{ name: "sheet1", rows: RESUMEN }, { name: "sheet2", rows: DETALLE }];

test("localizarDetalle ignora el resumen y encuentra la hoja de detalle", () => {
  const { cols } = fc.localizarDetalle(HOJAS);
  assert.strictEqual(cols.total, 8);
  assert.strictEqual(cols.proveedor, 1);
  assert.strictEqual(cols.numero, 2);
  assert.strictEqual(cols.archivo, 9);
});

test("parseFilas limpia fechas ISO, moneda e importes y descarta filas vacías", () => {
  const fs = fc.parseFilas(HOJAS);
  assert.strictEqual(fs.length, 4);
  assert.strictEqual(fs[0].fecha, "2026-10-02");
  assert.strictEqual(fs[0].total, 65.97);
  assert.strictEqual(fs[2].moneda, "USD");
  assert.strictEqual(fs[3].total, -38.48); // rectificativa negativa
});

test("importar crea facturas pendientes con origen gmail_control y empareja proveedor", () => {
  const store = fakeStore({ proveedores: [], recepciones: [] });
  const { res } = fc.importar(HOJAS, { store });
  assert.strictEqual(res.creadas, 4);
  assert.strictEqual(res.no_eur, 1);
  assert.strictEqual(res.total_eur, 126.44); // 65.97 + 98.95 - 38.48 (Panamar + abono)
  const recs = store.readAll("recepciones");
  assert.ok(recs.every((r) => r.tipo_documento === "factura" && r.estado === "Pendiente de confirmar" && r.origen === "gmail_control"));
  // Panamar aparece una vez como proveedor (dos facturas, un alta).
  const provs = store.readAll("proveedores");
  assert.strictEqual(provs.filter((p) => /panamar/i.test(p.nombre)).length, 1);
});

test("la rectificativa conserva el importe negativo y queda marcada", () => {
  const store = fakeStore({ proveedores: [], recepciones: [] });
  fc.importar(HOJAS, { store });
  const rect = store.readAll("recepciones").find((r) => r.numero_documento === "RECT26-374");
  assert.ok(rect);
  assert.strictEqual(rect.importe_total, -38.48);
  assert.strictEqual(rect.pendiente_pago, -38.48);
  assert.strictEqual(rect.rectificativa, true);
});

test("no duplica al reimportar el mismo control", () => {
  const store = fakeStore({ proveedores: [], recepciones: [] });
  fc.importar(HOJAS, { store });
  const { res } = fc.importar(HOJAS, { store });
  assert.strictEqual(res.creadas, 0);
  assert.strictEqual(res.duplicadas, 4);
  assert.strictEqual(store.readAll("recepciones").length, 4);
});

test("empareja proveedor existente por nombre (no lo duplica)", () => {
  const store = fakeStore({ proveedores: [{ id: "prov_z", nombre: "Render Services", cif: "" }], recepciones: [] });
  fc.importar(HOJAS, { store });
  assert.strictEqual(store.readAll("proveedores").filter((p) => /render/i.test(p.nombre)).length, 1);
  const usd = store.readAll("recepciones").find((r) => r.moneda === "USD");
  assert.strictEqual(usd.proveedor_id, "prov_z");
});

test("una sola matriz (sin envoltorio de hojas) también vale", () => {
  const fs = fc.parseFilas(DETALLE);
  assert.strictEqual(fs.length, 4);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en control de facturas`); process.exit(1); }
console.log("  control de facturas OK");
