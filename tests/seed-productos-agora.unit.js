// Siembra de productos de venta de Ágora: crea los artículos que Control M no
// tenía (nombre exacto de Ágora + PVP), sin duplicar los existentes y sin
// inventar escandallo. Ejecutar: node tests/seed-productos-agora.unit.js
const assert = require("assert");
const { aplicar, CATALOGO, FLAG, PRECIOS_CARTA_NOV2026, FLAG_PRECIOS } = require("../backend/seed-productos-agora");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

function fakeStore(data) {
  return {
    readAll: (e) => data[e] || [],
    findById: (e, id) => (data[e] || []).find((r) => r.id === id) || null,
    insert: (e, r) => { (data[e] = data[e] || []).push(r); return r; },
    update: (e, id, patch) => { const r = (data[e] || []).find((x) => x.id === id); if (r) Object.assign(r, patch); return r; },
    _data: data,
  };
}

console.log("seed de productos de Ágora");

test("crea los artículos del catálogo con nombre exacto y sin escandallo", () => {
  const data = { productos: [{ id: "prod-005", clave: "Matcha latte", nombre: "Matcha latte", ingredientes: [{}] }], config: [] };
  const st = fakeStore(data);
  const { creados, ranAny } = aplicar(st);
  assert.ok(ranAny);
  assert.strictEqual(creados, CATALOGO.length + 2 + 1); // catálogo + 2 extra + Matcha latte (garantizado)
  const lim = data.productos.find((p) => p.clave === "Limonada origen");
  assert.ok(lim, "crea Limonada origen");
  assert.strictEqual(lim.nombre, "Limonada origen");
  assert.strictEqual(lim.agora_ref, "Limonada origen");   // el conector empareja por agora_ref
  assert.strictEqual(lim.precio_venta, 3.00);             // carta nov-2026
  assert.deepStrictEqual(lim.ingredientes, []);           // sin escandallo inventado
  assert.strictEqual(lim.activo, true);
  const zumo = data.productos.find((p) => p.clave === "Zumo materia");
  assert.ok(zumo && zumo.precio_venta === 3.50);
  assert.strictEqual(zumo.coste_materia, undefined);     // sin coste inventado
  // Las tostas SÍ llevan su coste real (suma del escandallo del LAB).
  const to = data.productos.find((p) => p.id === "prod-agora-tosta-origen");
  assert.strictEqual(to.coste_materia, 0.99);
  const tc = data.productos.find((p) => p.id === "prod-agora-tosta-coleccion");
  assert.strictEqual(tc.coste_materia, 1.43);
});

test("el motor de coste usa el coste directo cuando existe (costing)", () => {
  const { margenProducto } = require("../backend/costing");
  const m = margenProducto({ precio_venta: 3.50, coste_materia: 0.99, iva: 0.10 }, {});
  assert.ok(Math.abs(m.coste - 0.99) < 1e-6, "coste NETO = 0,99 (igual que el P&L)");
  assert.ok(Math.abs(m.precio_neto - 3.1818) < 1e-3, "precio neto = 3,50 / 1,10");
  assert.ok(m.margen_bruto > 0.6 && m.margen_bruto < 0.72, "margen ≈ 69 % (ratio invariante)");
  assert.ok(Math.abs(m.margen_euros - 2.19) < 0.02, "margen NETO en € = 3,1818 − 0,99 ≈ 2,19");
});

test("Matcha latte del catálogo (id 25) no se recrea desde CATALOGO", () => {
  // Matcha latte NO está en CATALOGO (se excluye por existir en la carta base),
  // así que el bloque 1 no lo toca; solo el bloque 4 garantiza el que casa con Ágora.
  const data = { productos: [{ id: "prod-005", clave: "Matcha latte", nombre: "Matcha latte", ingredientes: [{}] }], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  assert.ok(!CATALOGO.some(([n]) => n.toLowerCase() === "matcha latte"), "Matcha latte no está en CATALOGO");
  assert.ok(data.productos.some((p) => p.id === "prod-agora-matcha-latte"), "existe el Matcha latte que casa con Ágora");
});

test("no duplica un artículo ya presente con ese nombre", () => {
  const data = { productos: [{ id: "prod-x", clave: "Coldbrew", nombre: "Coldbrew" }], config: [] };
  const st = fakeStore(data);
  const { creados } = aplicar(st);
  const colds = data.productos.filter((p) => (p.clave || "").toLowerCase() === "coldbrew");
  assert.strictEqual(colds.length, 1);                    // no se duplica
  assert.strictEqual(creados, CATALOGO.length - 1 + 2 + 1); // −Coldbrew, +2 extra, +1 Matcha latte
});

test("GARANTIZA un 'Matcha latte' que case con Ágora (agora_ref + escandallo)", () => {
  const d1 = { productos: [], config: [] };
  aplicar(fakeStore(d1));
  const ml = d1.productos.find((p) => p.id === "prod-agora-matcha-latte");
  assert.ok(ml, "crea Matcha latte");
  assert.strictEqual(ml.agora_ref, "Matcha latte");
  assert.strictEqual(ml.precio_venta, 3.50);             // carta nov-2026
  assert.strictEqual(ml.ingredientes.length, 2);          // 2,5 g matcha + 180 ml leche
  // Es idempotente por id: correr otra vez no crea un segundo.
  const st = fakeStore(d1);
  aplicar(st); // ya está el flag → no re-crea
  assert.strictEqual(d1.productos.filter((p) => p.id === "prod-agora-matcha-latte").length, 1);
});

test("es idempotente por flag", () => {
  const data = { productos: [], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const n = data.productos.length;
  const r2 = aplicar(st);
  assert.strictEqual(r2.ranAny, false);
  assert.strictEqual(data.productos.length, n);
  assert.ok(data.config.some((c) => c.id === FLAG));
});

test("todo el catálogo empareja por clave en minúsculas (como el conector)", () => {
  const data = { productos: [], config: [] };
  const st = fakeStore(data);
  aplicar(st);
  const idx = {};
  data.productos.forEach((p) => { [p.clave, p.nombre, p.agora_ref].forEach((k) => { if (k) idx[String(k).toLowerCase()] = p; }); });
  ["limonada origen", "zumo materia", "coldbrew", "manzanilla", "iced matcha colección"].forEach((n) => {
    assert.ok(idx[n], "el conector encontraría: " + n);
  });
});

test("ajuste de precios carta nov-2026: fija el PVP nuevo sobre productos ya existentes (producción)", () => {
  // Simula producción: los productos YA existen con el PVP viejo y los flags de
  // creación ya están puestos (Bloque 1/extra/matcha/costes), SOLO falta el de
  // precios. El ajuste debe actualizar el PVP de los que cambian y nada más.
  const data = {
    productos: [
      { id: "prod-agora-capuccino",          clave: "Capuccino",          nombre: "Capuccino",          agora_ref: "Capuccino",          precio_venta: 2.10, ingredientes: [] },
      { id: "prod-agora-limonada-origen",    clave: "Limonada origen",    nombre: "Limonada origen",    agora_ref: "Limonada origen",    precio_venta: 2.20, ingredientes: [] },
      { id: "prod-agora-crunch-coleccion",   clave: "Crunch colección",   nombre: "Crunch colección",   agora_ref: "Crunch colección",   precio_venta: 7.80, ingredientes: [] },
      { id: "prod-005",                      clave: "Matcha latte",       nombre: "Matcha latte",       agora_ref: "Matcha latte",       precio_venta: 3.30, ingredientes: [{}] }, // variante heredada
      { id: "prod-agora-cortado",            clave: "Cortado",            nombre: "Cortado",            agora_ref: "Cortado",            precio_venta: 2.00, ingredientes: [] }, // NO cambia
    ],
    config: [
      { id: FLAG }, { id: "productos_agora_seed_v2_extra" },
      { id: "productos_agora_matcha_latte_v2" }, { id: "productos_agora_costes_v1" },
    ],
  };
  const st = fakeStore(data);
  const r = aplicar(st);
  assert.ok(r.ranAny, "corre el ajuste de precios");
  assert.strictEqual(r.creados, 0, "no crea nada (ya existían)");
  assert.strictEqual(r.precios, 4, "ajusta 4 PVP (capuccino, limonada, crunch col., matcha heredado)");
  assert.strictEqual(data.productos.find((p) => p.id === "prod-agora-capuccino").precio_venta, 2.20);
  assert.strictEqual(data.productos.find((p) => p.id === "prod-agora-limonada-origen").precio_venta, 3.00);
  assert.strictEqual(data.productos.find((p) => p.id === "prod-agora-crunch-coleccion").precio_venta, 6.50);
  assert.strictEqual(data.productos.find((p) => p.id === "prod-005").precio_venta, 3.50, "también la variante heredada por nombre");
  assert.strictEqual(data.productos.find((p) => p.id === "prod-agora-cortado").precio_venta, 2.00, "NO toca lo que no cambia");
  // Idempotente: una segunda pasada no vuelve a tocar nada.
  const r2 = aplicar(st);
  assert.strictEqual(r2.precios, 0);
  assert.strictEqual(r2.ranAny, false);
  assert.ok(data.config.some((c) => c.id === FLAG_PRECIOS), "marca su flag");
});

test("la lista de precios nov-2026 coincide con el CATALOGO base (fuente única)", () => {
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const cat = {}; CATALOGO.forEach(([n, , pvp]) => { cat[norm(n)] = pvp; });
  PRECIOS_CARTA_NOV2026.forEach(([n, pvp]) => {
    if (norm(n) === "matcha latte") return; // Matcha latte vive en su bloque propio, no en CATALOGO
    assert.strictEqual(cat[norm(n)], pvp, `${n}: CATALOGO (${cat[norm(n)]}) debe igualar la lista de ajuste (${pvp})`);
  });
});

if (fallos) { console.error(`\n${fallos} fallo(s) en seed-productos-agora`); process.exit(1); }
console.log("  seed-productos-agora OK");
