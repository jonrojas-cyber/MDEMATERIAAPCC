// LIMPIEZA DEL CATÁLOGO · archiva (reversible) productos creados solo para el
// conector de Ágora que nunca se han vendido, conservando la carta real y todo lo
// vendido. Las elaboraciones solo se archivan si quedan huérfanas POR esa limpieza.
// Ejecutar: node tests/limpieza-catalogo.unit.js (revertir backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const lc = require("../backend/limpieza-catalogo");

let fallos = 0;
const _cola = [];
function test(n, fn) { _cola.push([n, fn]); }
async function _run() { for (const [n, fn] of _cola) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } } }

console.log("limpieza de catálogo · productos/producciones no vinculados");

function fixtures() {
  store.writeAll("productos", [
    { id: "prod-cafe-sol", nombre: "Café con leche", categoria: "Cafés", activo: true, ingredientes: [] },         // carta real → KEEP
    { id: "prod-cocina-tosta", nombre: "Tosta tomate", categoria: "comida", activo: true, ingredientes: [{ materia_id: "mat-dukkah", cantidad: 5 }] }, // usa dukkah
    { id: "prod-agora-matcha-latte", nombre: "Matcha latte", categoria: "bebida", origen: "agora", activo: true },  // conector, VENDIDO → KEEP
    { id: "prod-agora-dulce-coleccion", nombre: "Dulce colección", categoria: "comida", origen: "agora", activo: true }, // conector NO vendido → ARCHIVAR
    { id: "prod-agora-etiopia", nombre: "Etiopía", categoria: "bebida", activo: true },                             // conector por id NO vendido → ARCHIVAR
  ]);
  store.writeAll("recetas", [{ id: "rec-dukkah", nombre: "Dukkah", activo: true, produce_materia_id: "mat-dukkah" }]);
  store.writeAll("materias", [{ id: "mat-dukkah", nombre: "Dukkah", activo: true }]);
  store.writeAll("ventas", [
    { producto_id: "prod-agora-matcha-latte", producto: "Matcha latte", cantidad: 3, importe: 9.9 },
    { producto: "Café con leche", cantidad: 5, importe: 11 },
  ]);
}

test("candidatos: solo conector-only SIN ventas; carta real y vendido se conservan", () => {
  fixtures();
  const e = lc.estado(store);
  const ids = e.candidatos_productos.map((p) => p.id).sort();
  assert.deepStrictEqual(ids, ["prod-agora-dulce-coleccion", "prod-agora-etiopia"], "solo los conector-only sin venta (fue " + JSON.stringify(ids) + ")");
});

test("una elaboración real (usada por un producto de carta) NUNCA se archiva", () => {
  fixtures();
  const e = lc.estado(store);
  assert.strictEqual(e.candidatos_recetas.length, 0, "dukkah la usa la tosta real → no se archiva");
});

test("aplicar archiva (activo:false, reversible) solo los candidatos", async () => {
  fixtures();
  const r = await lc.aplicar(store);
  assert.strictEqual(r.productos, 2, "archiva los 2 conector-only sin venta");
  assert.strictEqual(store.findById("productos", "prod-agora-dulce-coleccion").activo, false);
  assert.ok(store.findById("productos", "prod-agora-dulce-coleccion").archivado_en, "guarda fecha (recuperable)");
  // La carta real y lo vendido siguen activos.
  assert.notStrictEqual(store.findById("productos", "prod-cafe-sol").activo, false);
  assert.notStrictEqual(store.findById("productos", "prod-agora-matcha-latte").activo, false);
});

test("aplicar respeta la selección (solo archiva ids marcados que son candidatos)", async () => {
  fixtures();
  const r = await lc.aplicar(store, { productos: ["prod-agora-etiopia", "prod-cafe-sol"] });
  assert.strictEqual(r.productos, 1, "solo etiopía (café no es candidato → se ignora, seguridad)");
  assert.notStrictEqual(store.findById("productos", "prod-cafe-sol").activo, false, "nunca archiva algo fuera del plan");
});

test("recuperar reactiva lo archivado por esta limpieza", async () => {
  fixtures();
  await lc.aplicar(store);
  const n = await lc.recuperar(store, ["prod-agora-etiopia"], "productos");
  assert.strictEqual(n, 1);
  assert.notStrictEqual(store.findById("productos", "prod-agora-etiopia").activo, false, "vuelve a estar activo");
});

test("idempotente: segunda pasada no vuelve a archivar nada", async () => {
  fixtures();
  await lc.aplicar(store);
  const r2 = await lc.aplicar(store);
  assert.strictEqual(r2.productos, 0);
  assert.strictEqual(r2.recetas, 0);
});

_run().then(() => {
  ["productos", "recetas", "materias", "ventas"].forEach((e) => store.writeAll(e, []));
  if (fallos) { console.error(`\n${fallos} fallo(s) en limpieza de catálogo`); process.exit(1); }
  console.log("  limpieza de catálogo OK");
});
