// Nóminas / sueldos: desglose correcto (bruto → SS trabajador + IRPF → neto; coste
// empresa) y acceso SOLO dirección (el equipo nunca ve sueldos). Ejecutar: node tests/nominas.unit.js

const assert = require("assert");
const store = require("../backend/data-store");
const sf = require("../backend/staff-finance");
const router = require("../backend/routes/nominas");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }
function handler(method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  assert.ok(layer, `ruta ${method} ${path} no encontrada`);
  const st = layer.route.stack; return st[st.length - 1].handle;
}
function fakeRes() { return { _status: 200, _json: null, status(c) { this._status = c; return this; }, json(x) { this._json = x; return this; } }; }
const ADMIN = { user: { rol: "admin", nombre: "Moni" } }, EQUIPO = { user: { rol: "equipo", nombre: "Dani" } };

console.log("nóminas · desglose neto/bruto/SS/IRPF + solo dirección");

test("desgloseNomina: del bruto resta SS trabajador e IRPF y da el neto", () => {
  const d = sf.desgloseNomina({ nombre: "X", salario_bruto_mensual: 1500, irpf_pct: 15, ss_trabajador_pct: 6.47, num_pagas: 12 });
  assert.strictEqual(d.salario_bruto_mensual, 1500);
  assert.strictEqual(d.ss_trabajador, 97.05, "SS trabajador 6,47% de 1500");
  assert.strictEqual(d.irpf, 225, "IRPF 15% de 1500");
  assert.strictEqual(d.neto_mensual, 1177.95, "neto = bruto − SS − IRPF");
  assert.strictEqual(d.coste_empresa_mensual, 1980, "coste empresa = bruto + 32% SS empresa");
  assert.strictEqual(d.bruto_anual, 18000, "bruto anual = 1500 × 12");
});

test("GET /nominas lista la plantilla con totales (admin)", () => {
  store.writeAll("usuarios", [{ id: "Moni", key: "Moni", nombre: "Mónica", rol: "admin" }, { id: "Dani", key: "Dani", nombre: "Daniel", rol: "equipo" }]);
  store.writeAll("staff_finance", [{ id: "Dani", usuario_key: "Dani", nombre: "Daniel", rol: "equipo", salario_bruto_mensual: 1400, irpf_pct: 0.1, ss_trabajador_pct: 0.0647 }]);
  const res = fakeRes();
  handler("get", "/")(ADMIN, res, () => {});
  assert.strictEqual(res._status, 200);
  assert.ok(Array.isArray(res._json.empleados) && res._json.empleados.length >= 2, "lista empleados");
  const dani = res._json.empleados.find((e) => e.nombre === "Daniel");
  assert.ok(dani && dani.neto_mensual > 0, "Daniel tiene neto calculado");
  assert.ok(res._json.total_coste_empresa_mes > 0, "totales de plantilla");
});

test("el equipo NO accede a nóminas (403 en GET y PUT)", () => {
  let res = fakeRes();
  handler("get", "/")(EQUIPO, res, () => {});
  assert.strictEqual(res._status, 403, "equipo no ve la lista");
  res = fakeRes();
  handler("put", "/:id")({ ...EQUIPO, params: { id: "Dani" }, body: { salario_bruto_mensual: 9999 } }, res, () => {});
  assert.strictEqual(res._status, 403, "equipo no edita sueldos");
});

test("PUT /nominas/:id guarda y normaliza porcentajes (admin): '15'→0,15 ; '6,47'→0,0647", () => {
  store.writeAll("usuarios", [{ id: "Dani", key: "Dani", nombre: "Daniel", rol: "equipo" }]);
  store.writeAll("staff_finance", []);
  const res = fakeRes();
  handler("put", "/:id")({ ...ADMIN, params: { id: "Dani" }, body: { salario_bruto_mensual: "1.500,00", irpf_pct: "15", ss_trabajador_pct: "6,47" } }, res, () => {});
  assert.strictEqual(res._status, 200);
  const rec = store.findById("staff_finance", "Dani");
  assert.strictEqual(rec.salario_bruto_mensual, 1500, "bruto europeo '1.500,00' → 1500");
  assert.strictEqual(res._json.irpf_pct, 0.15, "15% → 0,15");
  assert.strictEqual(res._json.ss_trabajador_pct, 0.0647, "6,47% → 0,0647");
  assert.strictEqual(res._json.neto_mensual, 1177.95, "neto recalculado");
});

if (fallos) { console.error(`\n${fallos} prueba(s) de nóminas fallaron`); process.exit(1); }
console.log("\nTodas las pruebas de nóminas OK");
