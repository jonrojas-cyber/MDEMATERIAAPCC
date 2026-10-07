// Pedidos: catálogo del proveedor (precio en unidad de pedido + cantidad sugerida),
// conversión de unidades y config de la copia por WhatsApp.
// Ejecutar: node tests/pedidos.unit.js
const assert = require("assert");
const ped = require("../backend/routes/pedidos");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

function fakeStore(seed) {
  const db = Object.assign({ config: [], proveedores: [], materias: [] }, seed || {});
  return {
    findById: (e, id) => (db[e] || []).find((x) => x.id === id),
    insert: (e, o) => { (db[e] = db[e] || []).push(o); return o; },
    update: (e, id, p) => { const x = (db[e] || []).find((y) => y.id === id); if (x) Object.assign(x, p); return x; },
    readAll: (e) => db[e] || [],
    _db: db,
  };
}

console.log("pedidos");

test("unidadPedido: g→kg (×1000), ml→L (×1000), ud→ud (×1)", () => {
  assert.deepStrictEqual(ped.unidadPedido("g"), { unidad: "kg", factor: 1000, dec: 2 });
  assert.deepStrictEqual(ped.unidadPedido("ml"), { unidad: "L", factor: 1000, dec: 2 });
  assert.deepStrictEqual(ped.unidadPedido("ud"), { unidad: "ud", factor: 1, dec: 0 });
  assert.strictEqual(ped.unidadPedido("kg").factor, 1);
});

test("catálogo: precio en €/kg y cantidad sugerida para reponer", () => {
  const s = fakeStore({
    proveedores: [{ id: "prov-1", nombre: "Frutas", contacto: "Ana", whatsapp: "+34 600 000 000", dias_reparto: ["Lunes"], productos_asociados: [] }],
    materias: [
      // Aguacate: 0,0042 €/g → 4,20 €/kg. disp 600 ≤ punto pedido (650) → por_pedir;
      // sugerido (5000-600)/1000 = 4,4 kg.
      { id: "m1", nombre: "Aguacate", unidad: "g", proveedor_id: "prov-1", coste_medio: 0.0042, disponibilidad_actual: 600, stock_minimo: 500, stock_ideal: 5000 },
      // Otro proveedor: NO debe salir.
      { id: "m2", nombre: "Pan", unidad: "ud", proveedor_id: "prov-2", coste_medio: 0.5, disponibilidad_actual: 2, stock_minimo: 5, stock_ideal: 20 },
    ],
  });
  const cat = ped.catalogoProveedor(s, "prov-1");
  assert.ok(cat, "devuelve catálogo");
  assert.strictEqual(cat.proveedor.nombre, "Frutas");
  assert.strictEqual(cat.articulos.length, 1, "solo los artículos de ESTE proveedor");
  const a = cat.articulos[0];
  assert.strictEqual(a.unidad_pedido, "kg");
  assert.strictEqual(a.precio_pedido, 4.2, "4,20 €/kg");
  assert.strictEqual(a.cantidad_sugerida, 4.4, "reponer 4,4 kg (5000-600)/1000");
  assert.strictEqual(a.estado, "por_pedir");
});

test("catálogo: incluye artículos por productos_asociados aunque el proveedor_id difiera", () => {
  const s = fakeStore({
    proveedores: [{ id: "prov-1", nombre: "X", productos_asociados: ["m9"] }],
    materias: [{ id: "m9", nombre: "Café", unidad: "g", proveedor_id: "prov-otro", coste_medio: 0.02, disponibilidad_actual: 0, stock_minimo: 1000, stock_ideal: 3000 }],
  });
  const cat = ped.catalogoProveedor(s, "prov-1");
  assert.strictEqual(cat.articulos.length, 1);
  assert.strictEqual(cat.articulos[0].estado, "critico");
});

test("catálogo: proveedor inexistente → null", () => {
  assert.strictEqual(ped.catalogoProveedor(fakeStore(), "nope"), null);
});

test("config: copia por defecto a Jon; se puede cambiar", () => {
  const s = fakeStore();
  assert.strictEqual(ped.leerConfig(s).copia_whatsapp, "34682250373");
  s.insert("config", { id: "pedidos_config", copia_whatsapp: "34611111111" });
  assert.strictEqual(ped.leerConfig(s).copia_whatsapp, "34611111111");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en pedidos`); process.exit(1); }
console.log("  pedidos OK");
