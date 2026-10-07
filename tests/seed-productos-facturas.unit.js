// Seed de productos por proveedor (facturas 3T 2026): enlaza cada producto con su
// proveedor como catálogo de compra, SIN duplicar proveedores, reaprovechando los
// que ya existen (match por CIF/nombre) y de forma idempotente.
// Ejecutar: node tests/seed-productos-facturas.unit.js
const assert = require("assert");
const seed = require("../backend/seed-productos-facturas");
const DATA = require("../backend/seed-data/productos-proveedores-3t2026.json");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

function fakeStore(prov) {
  // readAll devuelve el array interno POR REFERENCIA (como el data-store real): el
  // seed debe trabajar sobre una copia o duplicaría cada proveedor.
  const db = { config: [], proveedores: prov || [], compras_productos: [] };
  return {
    _db: db,
    findById: (e, id) => (db[e] || []).find((x) => x.id === id),
    insert: (e, o) => { (db[e] = db[e] || []).push(o); return o; },
    update: (e, id, p) => { const x = (db[e] || []).find((y) => y.id === id); if (x) Object.assign(x, p); return x; },
    readAll: (e) => db[e] || [],
  };
}

console.log("seed productos por proveedor (facturas 3T)");

const EXISTENTES = () => ([
  { id: "prov-fruteria", nombre: "Málaga Costa Fruit SL", cif: "B-01751502" },
  { id: "prov-panaderia", nombre: "Pan con Alma y Pasión, S.L.", nif_cif: "B40821753" },
  { id: "prov-charcuteria", nombre: "Jamonería Isa Brava", nif_cif: "44652877" },
]);

test("enlaza productos sin duplicar proveedores (bug del push sobre readAll)", () => {
  const st = fakeStore(EXISTENTES());
  const r = seed.aplicar(st);
  const pv = st.readAll("proveedores");
  const byId = {}; pv.forEach((p) => (byId[p.id] = (byId[p.id] || 0) + 1));
  const dup = Object.entries(byId).filter(([k, n]) => n > 1);
  assert.deepStrictEqual(dup, [], "ningún proveedor duplicado: " + JSON.stringify(dup));
  assert.strictEqual(pv.filter((p) => p.id === "prov-f-mercadona").length, 1, "Mercadona una sola vez");
  assert.strictEqual(r.productos, DATA.proveedores.reduce((s, p) => s + (p.productos || []).length, 0), "todos los productos enlazados");
  assert.ok(r.proveedores_nuevos >= 15, "crea los proveedores que no existían");
});

test("reaprovecha proveedores existentes por CIF/nombre (no los duplica)", () => {
  const st = fakeStore(EXISTENTES());
  seed.aplicar(st);
  // Málaga Costa Fruit ya existía → no se crea prov-f-malaga-costa-fruit.
  assert.ok(!st.findById("proveedores", "prov-f-malaga-costa-fruit"), "no duplica la frutería");
  // Osos (CIF 44652877x) casa con la charcutería (44652877): sus productos van ahí.
  const chc = st.readAll("compras_productos").filter((c) => c.proveedor_id === "prov-charcuteria");
  assert.ok(chc.length >= 1, "los productos de Osos se enlazan a la charcutería por CIF");
  // Pan con Alma casa con la panadería existente.
  assert.ok(!st.findById("proveedores", "prov-f-pan-con-alma-y-pasion-sl"), "no duplica la panadería");
});

test("precios y formato se guardan desde la factura (sin inventar)", () => {
  const st = fakeStore(EXISTENTES());
  seed.aplicar(st);
  const cps = st.readAll("compras_productos").filter((c) => c.origen === "factura_3t2026");
  assert.ok(cps.every((c) => c.proveedor_id && c.nombre), "cada artículo tiene proveedor y nombre");
  assert.ok(cps.some((c) => Number(c.precio_sin_iva) > 0), "hay precios reales");
  assert.ok(cps.every((c) => c.formato), "cada artículo tiene formato (unidad de pedido)");
});

test("idempotente: segunda aplicación no cambia nada", () => {
  const st = fakeStore(EXISTENTES());
  seed.aplicar(st);
  const nProv = st.readAll("proveedores").length, nProd = st.readAll("compras_productos").length;
  const r2 = seed.aplicar(st);
  assert.strictEqual(r2, null, "segunda llamada no hace nada (flag)");
  assert.strictEqual(st.readAll("proveedores").length, nProv);
  assert.strictEqual(st.readAll("compras_productos").length, nProd);
});

test("cifMatch tolera la letra de control que falte", () => {
  assert.ok(seed.cifMatch("44652877X", "44652877"), "NIF con y sin letra casan");
  assert.ok(seed.cifMatch("B-01751502", "B01751502"), "ignora guiones/espacios");
  assert.ok(!seed.cifMatch("B16821753", "B40821753"), "CIFs distintos no casan");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en seed productos por proveedor`); process.exit(1); }
console.log("  seed productos por proveedor OK");
