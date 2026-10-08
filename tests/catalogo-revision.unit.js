// REVISIÓN BIMESTRAL DEL CATÁLOGO · lo no pedido en ~60 días se propone para
// ARCHIVAR (no se borra: recuperable). Comprueba la detección de candidatos
// (nunca pedido / pedido hace mucho / reciente / pedido hace poco), el archivado
// y recuperación, y el due cada 2 meses.
// Ejecutar: node tests/catalogo-revision.unit.js (revertir backend/data).

const assert = require("assert");
const store = require("../backend/data-store");
const rev = require("../backend/catalogo-revision");

let fallos = 0;
const _cola = [];
function test(n, fn) { _cola.push([n, fn]); }
async function _run() { for (const [n, fn] of _cola) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } } }

const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime(); // 8 oct 2026
const DAY = 86400000;
const hace = (d) => new Date(NOW - d * DAY).toISOString();

function limpiar() {
  ["compras_productos", "pedidos", "proveedores", "config"].forEach((e) => store.writeAll(e, []));
}
function fixtures() {
  limpiar();
  store.writeAll("proveedores", [{ id: "prov-1", nombre: "Frutería" }]);
  store.writeAll("compras_productos", [
    { id: "c-viejo", nombre: "Viejo nunca pedido", proveedor_id: "prov-1", creado_en: hace(200) }, // nunca pedido, antiguo → candidato
    { id: "c-pedido-lejano", nombre: "Pedido hace mucho", proveedor_id: "prov-1", creado_en: hace(200) }, // pedido hace 90 días → candidato
    { id: "c-pedido-reciente", nombre: "Pedido hace poco", proveedor_id: "prov-1", creado_en: hace(200) }, // pedido hace 10 días → NO
    { id: "c-nuevo", nombre: "Recién añadido", proveedor_id: "prov-1", creado_en: hace(5) }, // demasiado nuevo → NO
  ]);
  store.writeAll("pedidos", [
    { id: "p1", fecha: hace(90), lineas: [{ compra_id: "c-pedido-lejano", cantidad: 2 }] },
    { id: "p2", fecha: hace(10), lineas: [{ compra_id: "c-pedido-reciente", cantidad: 1 }] },
  ]);
}

console.log("catálogo · revisión bimestral (archivar + revisar)");

test("candidatos: nunca pedido y pedido-hace-mucho; NO reciente ni recién añadido", () => {
  fixtures();
  const c = rev.candidatos(NOW);
  const ids = c.map((x) => x.id).sort();
  assert.deepStrictEqual(ids, ["c-pedido-lejano", "c-viejo"], "solo los dos stale (fue " + JSON.stringify(ids) + ")");
  const viejo = c.find((x) => x.id === "c-viejo");
  assert.strictEqual(viejo.nunca_pedido, true, "marca nunca pedido");
  const lejano = c.find((x) => x.id === "c-pedido-lejano");
  assert.ok(lejano.dias_sin_pedir >= 89, "días sin pedir ≈ 90");
  limpiar();
});

test("archivar marca archivado (recuperable) y lo saca de candidatos", async () => {
  fixtures();
  const n = await rev.archivar(["c-viejo"], NOW);
  assert.strictEqual(n, 1, "archiva uno");
  const prod = store.findById("compras_productos", "c-viejo");
  assert.strictEqual(prod.archivado, true, "queda archivado");
  assert.ok(prod.archivado_en && prod.archivado_motivo, "guarda fecha y motivo (recuperable)");
  const cand = rev.candidatos(NOW).map((x) => x.id);
  assert.ok(!cand.includes("c-viejo"), "ya no es candidato");
  assert.strictEqual(rev.archivados().length, 1, "aparece en archivados");
  limpiar();
});

test("recuperar devuelve el producto al catálogo", async () => {
  fixtures();
  await rev.archivar(["c-viejo"], NOW);
  const n = await rev.recuperar(["c-viejo"], NOW);
  assert.strictEqual(n, 1, "recupera uno");
  const prod = store.findById("compras_productos", "c-viejo");
  assert.strictEqual(prod.archivado, false, "ya no está archivado");
  assert.strictEqual(rev.archivados().length, 0, "sin archivados");
  limpiar();
});

test("estado.due: true sin revisión previa; false justo tras marcar revisada", async () => {
  fixtures();
  assert.strictEqual(rev.estado(NOW).due, true, "nunca revisado → toca");
  await rev.marcarRevisada(NOW);
  const e = rev.estado(NOW);
  assert.strictEqual(e.due, false, "recién revisado → no toca");
  assert.ok(e.proxima_revision, "calcula la próxima revisión (≈2 meses)");
  // 61 días después vuelve a tocar.
  assert.strictEqual(rev.estado(NOW + 61 * DAY).due, true, "pasados ~2 meses vuelve a tocar");
  limpiar();
});

_run().then(() => {
  if (fallos) { console.error(`\n${fallos} fallo(s) en revisión de catálogo`); process.exit(1); }
  console.log("  revisión de catálogo OK");
});
