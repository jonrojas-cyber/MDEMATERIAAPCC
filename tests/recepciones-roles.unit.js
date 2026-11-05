// Regla innegociable: el rol "equipo" NUNCA ve dinero de compra. Estas pruebas
// blindan tres rutas de recepciones que antes filtraban el importe solo en el
// listado pero NO en el detalle, el archivo trimestral ni el cotejo del albarán
// (las alcanzaba el asistente actuando como el usuario). Ejecutar: node tests/recepciones-roles.unit.js

const assert = require("assert");
const store = require("../backend/data-store");
const router = require("../backend/routes/recepciones");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
function handler(method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  assert.ok(layer, `ruta ${method} ${path} no encontrada`);
  const st = layer.route.stack; return st[st.length - 1].handle;
}
function fakeRes() { return { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(x) { this._json = x; return this; } }; }
const ADMIN = { user: { rol: "admin" } }, EQUIPO = { user: { rol: "equipo" } };

console.log("recepciones · el equipo no ve importes de compra (detalle, trimestres, cotejo)");

test("GET /:id oculta importe_total y precios de línea al equipo", () => {
  store.writeAll("recepciones", [{ id: "rcp-1", proveedor_id: "p1", importe_total: 120.5, pendiente_pago: 120.5, lineas: [{ materia_id: "m1", precio_unitario: 2.5, importe: 25 }] }]);
  store.writeAll("proveedores", [{ id: "p1", nombre: "Prov" }]);
  let res = fakeRes();
  handler("get", "/:id")({ ...ADMIN, params: { id: "rcp-1" } }, res, () => {});
  assert.strictEqual(res._json.importe_total, 120.5, "el admin sí ve el importe");
  res = fakeRes();
  handler("get", "/:id")({ ...EQUIPO, params: { id: "rcp-1" } }, res, () => {});
  assert.strictEqual(res._json.importe_total, undefined, "el equipo NO ve importe");
  assert.strictEqual(res._json.lineas[0].precio_unitario, undefined, "ni precio de línea");
});

test("GET /trimestres oculta el gasto total al equipo (ve recuento, no €)", () => {
  store.writeAll("recepciones", [
    { id: "a", proveedor_id: "p1", fecha: "2026-02-10T00:00:00.000Z", importe_total: 100, foto_albaran_url: "x" },
    { id: "b", proveedor_id: "p1", fecha: "2026-02-20T00:00:00.000Z", importe_total: 50 },
  ]);
  let res = fakeRes();
  handler("get", "/trimestres")({ ...ADMIN }, res, () => {});
  assert.ok(res._json[0].total > 0, "el admin ve el total");
  res = fakeRes();
  handler("get", "/trimestres")({ ...EQUIPO }, res, () => {});
  assert.strictEqual(res._json[0].total, undefined, "el equipo NO ve el total");
  assert.strictEqual(res._json[0].count, 2, "pero sí el recuento");
});

test("POST /cotejar no manda avisos de PRECIO al equipo (sí de cantidad)", () => {
  store.writeAll("materias", [{ id: "m1", nombre: "Café", unidad: "g", coste_medio: 0.02 }]);
  store.writeAll("pedidos", [{ id: "pd1", proveedor_id: "p1", estado: "enviado", lineas: [{ materia_id: "m1", nombre: "Café", cantidad: 100, unidad: "g", precio_esperado: 0.02 }] }]);
  const body = { proveedor_id: "p1", lineas: [{ materia_id: "m1", cantidad: 120, precio_unitario: 0.03 }] }; // +20 cant, +50% precio
  let res = fakeRes();
  handler("post", "/cotejar")({ ...ADMIN, body }, res, () => {});
  assert.ok(res._json.avisos.some((a) => a.tipo === "precio"), "el admin recibe el aviso de precio");
  res = fakeRes();
  handler("post", "/cotejar")({ ...EQUIPO, body }, res, () => {});
  assert.ok(!res._json.avisos.some((a) => a.tipo === "precio"), "el equipo NO recibe aviso de precio");
  assert.ok(res._json.avisos.some((a) => a.tipo === "cantidad"), "pero sí el de cantidad");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de recepciones/roles fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de recepciones/roles OK");
