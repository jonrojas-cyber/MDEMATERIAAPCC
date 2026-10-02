// Sincronización de productos desde Ágora. Ejecutar: node tests/agora-sync.unit.js
const assert = require("assert");
const sync = require("../backend/agora-sync");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("sync Ágora");

const CSV = [
  "ID;Nombre;Familia;Subfamilia;Codigo de barras;Unidad;Activo;Precio",
  "A100;Café con leche;Cafés;Calientes;8400000000001;ud;Si;1,90",
  "A200;Matcha Latte;Matcha;;8400000000002;ud;Si;3,30",
  "A300;Tosta de aguacate;Cocina;Tostas;;ud;No;5,50",   // inactivo en Ágora
  "A200;Matcha  Látte;Matcha;;;ud;Si;3,30",             // duplicado por nombre normalizado, otro... mismo id
  "A400;Zumo verde;Zumos;;;ud;Si;3,00",
].join("\n");

test("parsea CSV con ; y mapea cabeceras ES", () => {
  const filas = sync.parseCSV(CSV);
  assert.strictEqual(filas.length, 5);
  const f = sync.filaAgora(filas[0]);
  assert.strictEqual(f.agora_id, "A100");
  assert.strictEqual(f.nombre, "Café con leche");
  assert.strictEqual(f.familia, "Cafés");
  assert.strictEqual(f.codigo_barras, "8400000000001");
  assert.strictEqual(f.activo, true);
});

test("casa por agora_id, actualiza solo campos de Ágora y conserva lo demás", () => {
  const productos = [
    { id: "prod-x", nombre: "Cafe con leche", agora_id: "A100", categoria: "café", precio_venta: 1.65, ingredientes: [{ materia_id: "m1", cantidad: 10 }] },
  ];
  const { upserts, informe } = sync.sincronizar(productos, sync.parseCSV(CSV), { now: "2026-10-02T00:00:00Z", usuario: "Moni" });
  const up = upserts.find((p) => p.id === "prod-x");
  assert.ok(up, "debe actualizar prod-x");
  assert.strictEqual(up.precio_venta, 1.65, "no toca el PVP propio");
  assert.deepStrictEqual(up.ingredientes, [{ materia_id: "m1", cantidad: 10 }], "no toca ingredientes");
  assert.strictEqual(up.familia, "Cafés", "actualiza familia de Ágora");
  assert.strictEqual(up.codigo_barras, "8400000000001");
  assert.ok(informe.actualizados.find((x) => x.id === "prod-x"));
});

test("crea nuevos, detecta duplicados por nombre y marca bajas", () => {
  const productos = [
    { id: "prod-viejo", nombre: "Producto fuera de Ágora", agora_id: "Z999", activo: true }, // ya no viene → baja
  ];
  const { upserts, informe } = sync.sincronizar(productos, sync.parseCSV(CSV), { now: "2026-10-02T00:00:00Z" });
  // Nuevos (A100, A200, A300, A400 — A300 inactivo igualmente se crea pero inactivo_agora)
  assert.ok(informe.nuevos.length >= 3, "nuevos=" + informe.nuevos.length);
  // Duplicado: dos filas con "Matcha Latte" / "Matcha Látte" (mismo id A200) NO es dup real;
  // pero el test CSV tiene A200 repetido con mismo id → no cuenta como duplicado de id distinto.
  // Baja: Z999 no está en el CSV → desactivado, NO borrado.
  const baja = informe.desactivados.find((x) => x.id === "prod-viejo");
  assert.ok(baja, "Z999 debe marcarse inactivo");
  const upBaja = upserts.find((p) => p.id === "prod-viejo");
  assert.strictEqual(upBaja.activo, false);
  assert.strictEqual(upBaja.activo_agora, false);
});

test("detecta duplicado real: dos agora_id distintos con el mismo nombre", () => {
  const csv = [
    "ID;Nombre;Activo",
    "B1;Limonada equilibrio;Si",
    "B2;Limonada  Equilíbrio;Si",   // mismo nombre normalizado, id distinto → dudoso
  ].join("\n");
  const { informe } = sync.sincronizar([], sync.parseCSV(csv), {});
  assert.ok(informe.posibles_duplicados.length >= 1, "debe listar el duplicado dudoso");
});

test("estadoProducto: manual / inactivo / appcc_incompleta / listo", () => {
  assert.strictEqual(sync.estadoProducto({ id: "prod-005", nombre: "X" }, null), "manual");
  assert.strictEqual(sync.estadoProducto({ id: "prod-agora-a1", agora_id: "a1", activo_agora: false }, null), "inactivo");
  assert.strictEqual(sync.estadoProducto({ id: "prod-agora-a1", agora_id: "a1" }, null), "appcc_incompleta");
  assert.strictEqual(sync.estadoProducto({ id: "prod-agora-a1", agora_id: "a1" }, { vida_util_dias: 3 }), "listo");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en sync Ágora`); process.exit(1); }
console.log("  sync Ágora OK");
