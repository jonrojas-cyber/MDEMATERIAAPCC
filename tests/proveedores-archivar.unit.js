// Archivar proveedor (baja lógica reversible): se mantiene pero sale del flujo de
// pedidos. Gestionar proveedores es SOLO de dirección (el equipo solo hace pedidos).
// Las sugerencias de compra (aviso de las 16:00) omiten proveedores archivados.
// Ejecutar: node tests/proveedores-archivar.unit.js

const assert = require("assert");
const store = require("../backend/data-store");
const router = require("../backend/routes/proveedores");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

// Localiza el handler real de una ruta del router (el último de la cadena).
function handler(method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  assert.ok(layer, `ruta ${method} ${path} no encontrada`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}
function fakeRes() {
  return { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(x) { this._json = x; return this; } };
}

console.log("proveedores · archivar/recuperar + roles + sugerencias");

test("archivar y recuperar (admin): baja lógica reversible", () => {
  store.writeAll("proveedores", [{ id: "prov-1", nombre: "Café SL", archivado: false }]);
  const admin = { user: { rol: "admin" } };
  handler("post", "/:id/archivar")({ ...admin, params: { id: "prov-1" } }, fakeRes(), () => {});
  assert.strictEqual(store.findById("proveedores", "prov-1").archivado, true, "queda archivado");
  handler("post", "/:id/recuperar")({ ...admin, params: { id: "prov-1" } }, fakeRes(), () => {});
  assert.strictEqual(store.findById("proveedores", "prov-1").archivado, false, "se recupera");
});

test("el equipo NO puede archivar ni crear/editar proveedores (403)", () => {
  store.writeAll("proveedores", [{ id: "prov-1", nombre: "Café SL", archivado: false }]);
  const equipo = { user: { rol: "equipo" } };
  let res = fakeRes();
  handler("post", "/:id/archivar")({ ...equipo, params: { id: "prov-1" } }, res, () => {});
  assert.strictEqual(res._status, 403, "equipo no archiva");
  assert.strictEqual(store.findById("proveedores", "prov-1").archivado, false, "no cambió");
  res = fakeRes();
  handler("post", "/")({ ...equipo, body: { nombre: "Nuevo" } }, res, () => {});
  assert.strictEqual(res._status, 403, "equipo no crea");
  res = fakeRes();
  handler("put", "/:id")({ ...equipo, params: { id: "prov-1" }, body: { nombre: "X" } }, res, () => {});
  assert.strictEqual(res._status, 403, "equipo no edita");
});

test("las sugerencias de compra omiten los proveedores archivados", () => {
  store.writeAll("proveedores", [
    { id: "pA", nombre: "Activo", archivado: false },
    { id: "pX", nombre: "Archivado", archivado: true },
  ]);
  store.writeAll("materias", [
    { id: "m1", nombre: "Café", proveedor_id: "pA", disponibilidad_actual: 0, stock_minimo: 10, unidad: "g" },
    { id: "m2", nombre: "Matcha", proveedor_id: "pX", disponibilidad_actual: 0, stock_minimo: 10, unidad: "g" },
  ]);
  const sug = require("../backend/compras").sugerencias();
  const ids = sug.map((g) => g.proveedor_id);
  assert.ok(ids.includes("pA"), "el proveedor activo sí se sugiere");
  assert.ok(!ids.includes("pX"), "el proveedor archivado NO se sugiere");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de proveedores fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de proveedores (archivar) OK");
