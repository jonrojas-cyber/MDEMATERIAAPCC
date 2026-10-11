// Regla nº2 (bloque 10 · tests.7): el rol "equipo" NUNCA accede a rutas de
// dinero. Verifica el CONTRATO sobre toda la lista EQUIPO_ALLOWED (no 4 rutas
// fijas): cualquier segmento que NO esté ahí queda bloqueado por defecto → una
// ruta de dinero nueva nace protegida. Usa tokens REALES (auth.login) + el
// middleware real auth.requerido. También comprueba el guard económico.
// Ejecutar: node tests/roles-regla2.unit.js
const assert = require("assert");
const store = require("../backend/data-store");

// data-store en memoria (auth siembra Jon/Lara/Moni la primera vez).
const db = { usuarios: [], auditoria: [] };
store.readAll = (n) => (db[n] || (db[n] = []));
store.insert = (n, o) => { (db[n] = db[n] || []).push(o); return o; };
store.update = (n, id, p) => { const x = (db[n] || []).find((y) => y.id === id); if (x) Object.assign(x, p); return x; };
store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
store.flush = async () => {};

const auth = require("../backend/auth");
const { filtrarRespuestas } = require("../backend/economia-guard");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

const sesEquipo = auth.login("Lara", "2222"); // rol equipo (seed por defecto)
const sesAdmin = auth.login("Moni", "3333");  // rol admin
assert.ok(sesEquipo.token, "token de equipo"); assert.ok(sesAdmin.token, "token de admin");

function accede(token, pathApi) {
  let status = 200, paso = false;
  const req = { headers: { authorization: "Bearer " + token }, path: pathApi };
  const res = { status: (c) => { status = c; return res; }, json: () => res };
  auth.requerido(req, res, () => { paso = true; });
  return { permitido: paso, status };
}

console.log("regla nº2 · el equipo nunca ve dinero");

const RUTAS_DINERO = [
  "financials", "financiero", "cuenta-resultados", "ebitda", "dashboard",
  "executive-dashboard", "fixed-costs", "debts", "assets", "treasury", "targets",
  "cierre-mes", "analisis-diario", "dossier", "catalogo-revision", "limpieza-catalogo",
  "business-health", "business-time-machine", "analisis-mes",
];

test("el equipo es BLOQUEADO (403) en todas las rutas de dinero", () => {
  for (const seg of RUTAS_DINERO) {
    const r = accede(sesEquipo.token, "/" + seg);
    assert.strictEqual(r.permitido, false, `equipo NO debe entrar en /${seg}`);
    assert.strictEqual(r.status, 403, `/${seg} debe devolver 403 al equipo`);
  }
});

test("el admin SÍ accede a las rutas de dinero", () => {
  for (const seg of RUTAS_DINERO) {
    assert.strictEqual(accede(sesAdmin.token, "/" + seg).permitido, true, `admin debe entrar en /${seg}`);
  }
});

test("una ruta de dinero NUEVA nace protegida (no hay que tocar nada)", () => {
  const r = accede(sesEquipo.token, "/ruta-de-dinero-inventada");
  assert.strictEqual(r.permitido, false);
  assert.strictEqual(r.status, 403);
});

test("el equipo SÍ entra en sus rutas operativas (no es bloqueo total)", () => {
  for (const seg of ["inicio", "lotes", "mermas", "fichaje", "turnos", "carta"]) {
    assert.strictEqual(accede(sesEquipo.token, "/" + seg).permitido, true, `equipo debe entrar en /${seg}`);
  }
});

test("el guard económico oculta coste/margen/food_cost/beneficio al equipo", () => {
  let salida = null;
  const res = { json(obj) { salida = obj; return res; } };
  filtrarRespuestas({ user: { rol: "equipo" } }, res, () => {});
  res.json({ nombre: "Café", pvp: 2.5, precio_venta: 2.5, coste: 0.5, margen: 2.0, food_cost: 20, beneficio: 100 });
  assert.ok(salida.pvp === 2.5 && salida.precio_venta === 2.5, "el PVP SÍ se ve");
  assert.ok(!("coste" in salida) && !("margen" in salida) && !("food_cost" in salida) && !("beneficio" in salida), "coste/margen/food_cost/beneficio ocultos");
});

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("  todo en verde");
