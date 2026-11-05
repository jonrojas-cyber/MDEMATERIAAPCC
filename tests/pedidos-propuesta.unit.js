// Flujo de propuestas de pedido: el EQUIPO propone (el pedido nace "propuesto",
// sin euros) y SOLO dirección (admin: Moni/Jon) puede ENVIAR (enviar = aprobar la
// propuesta). Además, el proveedor guarda su canal de pedido ("whatsapp"|"web") y la
// URL de su web, y el catálogo del proveedor los expone para el envío por web.
// Ejecutar: node tests/pedidos-propuesta.unit.js

const assert = require("assert");
const store = require("../backend/data-store");
const pedidos = require("../backend/routes/pedidos");
const proveedores = require("../backend/routes/proveedores");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

// Localiza el handler real (el último de la cadena) de una ruta de un router.
function handlerOf(router, method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  assert.ok(layer, `ruta ${method} ${path} no encontrada`);
  const st = layer.route.stack;
  return st[st.length - 1].handle;
}
function fakeRes() {
  return { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(x) { this._json = x; return this; } };
}

console.log("pedidos · propuesta (equipo) vs envío (admin) + canal web");

function seed() {
  store.writeAll("proveedores", [{ id: "prov-1", nombre: "Café SL", archivado: false, whatsapp: "34600112233", canal_pedido: "whatsapp" }]);
  store.writeAll("materias", [{ id: "m1", nombre: "Café en grano", proveedor_id: "prov-1", unidad: "g", coste_medio: 0.02, disponibilidad_actual: 0, stock_minimo: 100 }]);
  store.writeAll("pedidos", []);
  store.writeAll("compras_productos", []);
}

test("el equipo crea una PROPUESTA (estado 'propuesto') sin euros", () => {
  seed();
  const res = fakeRes();
  handlerOf(pedidos, "post", "/")({ user: { rol: "equipo", nombre: "Daniel" }, body: { proveedor_id: "prov-1", lineas: [{ materia_id: "m1", cantidad: 200 }] } }, res, () => {});
  assert.strictEqual(res._status, 201, "se crea");
  assert.strictEqual(res._json.estado, "propuesto", "nace como propuesta");
  assert.strictEqual(res._json.propuesto_por, "Daniel", "guarda quién la propuso");
  assert.strictEqual(res._json.total_estimado, undefined, "el equipo no ve euros");
});

test("un admin crea un BORRADOR listo para enviar (con euros)", () => {
  seed();
  const res = fakeRes();
  handlerOf(pedidos, "post", "/")({ user: { rol: "admin", nombre: "Moni" }, body: { proveedor_id: "prov-1", lineas: [{ materia_id: "m1", cantidad: 200 }] } }, res, () => {});
  assert.strictEqual(res._json.estado, "borrador", "el admin crea borrador, no propuesta");
  assert.ok(res._json.total_estimado > 0, "el admin sí ve el total");
});

test("solo dirección (admin) ENVÍA; el equipo recibe 403 y el estado no cambia", () => {
  seed();
  store.writeAll("pedidos", [{ id: "ped-1", proveedor_id: "prov-1", estado: "propuesto", lineas: [] }]);
  let res = fakeRes();
  handlerOf(pedidos, "post", "/:id/enviado")({ user: { rol: "equipo" }, params: { id: "ped-1" } }, res, () => {});
  assert.strictEqual(res._status, 403, "el equipo no envía");
  assert.strictEqual(store.findById("pedidos", "ped-1").estado, "propuesto", "sigue propuesta");
  res = fakeRes();
  handlerOf(pedidos, "post", "/:id/enviado")({ user: { rol: "admin" }, params: { id: "ped-1" } }, res, () => {});
  assert.strictEqual(res._status, 200, "dirección sí envía");
  assert.strictEqual(store.findById("pedidos", "ped-1").estado, "enviado", "enviar aprueba la propuesta");
});

test("el catálogo del proveedor expone el canal de pedido y su web", () => {
  store.writeAll("proveedores", [{ id: "prov-w", nombre: "Black BasCo", archivado: false, canal_pedido: "web", url_pedido: "https://blackbasco.example/pedido" }]);
  store.writeAll("materias", [{ id: "mw", nombre: "Matcha ceremonial", proveedor_id: "prov-w", unidad: "g", coste_medio: 0.1 }]);
  store.writeAll("compras_productos", []);
  const cat = pedidos.catalogoProveedor(store, "prov-w");
  assert.strictEqual(cat.proveedor.canal_pedido, "web", "canal web");
  assert.strictEqual(cat.proveedor.url_pedido, "https://blackbasco.example/pedido", "URL de la web");
});

test("el proveedor guarda canal_pedido y url_pedido (solo dirección)", () => {
  store.writeAll("proveedores", []);
  const res = fakeRes();
  handlerOf(proveedores, "post", "/")({ user: { rol: "admin" }, body: { nombre: "Web SL", canal_pedido: "web", url_pedido: "https://x.example" } }, res, () => {});
  assert.strictEqual(res._status, 201, "se crea");
  const guardado = store.findById("proveedores", res._json.id);
  assert.strictEqual(guardado.canal_pedido, "web");
  assert.strictEqual(guardado.url_pedido, "https://x.example");
});

test("canal_pedido inválido cae a 'whatsapp' (no se cuela basura)", () => {
  store.writeAll("proveedores", []);
  const res = fakeRes();
  handlerOf(proveedores, "post", "/")({ user: { rol: "admin" }, body: { nombre: "Raro SL", canal_pedido: "telepatia" } }, res, () => {});
  assert.strictEqual(store.findById("proveedores", res._json.id).canal_pedido, "whatsapp");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de propuestas fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de propuestas de pedido OK");
