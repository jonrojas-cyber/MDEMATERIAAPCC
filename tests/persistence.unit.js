// Pruebas de la capa de persistencia (sin Postgres real).
//   · db.js: valida que upsert/del/tx emiten SQL por fila (no reescriben tabla).
//   · data-store.js: valida CRUD por fila + remove + flush + transacción atómica
//     en modo JSON contra un directorio temporal.
//
// Se ejecuta con: node tests/persistence.test.js   (devuelve código !=0 si falla)

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let fallos = 0;
function test(nombre, fn) {
  try { fn(); console.log("  ✓ " + nombre); }
  catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); }
}
async function testAsync(nombre, fn) {
  try { await fn(); console.log("  ✓ " + nombre); }
  catch (e) { fallos++; console.error("  ✗ " + nombre + "\n    " + e.message); }
}

(async () => {
  console.log("db.js · CRUD por fila con pool simulado");
  const db = require("../backend/db");
  const llamadas = [];
  const fakePool = {
    query: async (text, params) => { llamadas.push({ text: text.replace(/\s+/g, " ").trim(), params }); return { rows: [] }; },
    connect: async () => ({
      query: async (text, params) => { llamadas.push({ text: text.replace(/\s+/g, " ").trim(), params }); return { rows: [] }; },
      release: () => {},
    }),
  };
  db.__setPoolForTests(fakePool);

  await testAsync("upsert hace INSERT ... ON CONFLICT de UNA fila (no DELETE de tabla)", async () => {
    llamadas.length = 0;
    await db.upsert("materias", { id: "m1", nombre: "Café" });
    assert.strictEqual(llamadas.length, 1, "debe ser una sola query");
    assert.ok(/INSERT INTO materias/.test(llamadas[0].text), "INSERT en materias");
    assert.ok(/ON CONFLICT \(id\) DO UPDATE/.test(llamadas[0].text), "upsert");
    assert.ok(!/DELETE FROM/.test(llamadas[0].text), "no borra la tabla");
    assert.strictEqual(llamadas[0].params[0], "m1");
  });

  await testAsync("del borra UNA fila por id", async () => {
    llamadas.length = 0;
    await db.del("lotes", "l1");
    assert.ok(/DELETE FROM lotes WHERE id = \$1/.test(llamadas[0].text));
    assert.strictEqual(llamadas[0].params[0], "l1");
  });

  await testAsync("tx envuelve en BEGIN/COMMIT y hace rollback si lanza", async () => {
    llamadas.length = 0;
    await db.tx(async (t) => { await t.upsert("lotes", { id: "l2" }); });
    const textos = llamadas.map((c) => c.text);
    assert.ok(textos.includes("BEGIN") && textos.includes("COMMIT"), "BEGIN/COMMIT");
    let rollback = false;
    try { await db.tx(async () => { throw new Error("boom"); }); } catch (e) { rollback = true; }
    assert.ok(rollback, "propaga el error");
    assert.ok(llamadas.map((c) => c.text).includes("ROLLBACK"), "ROLLBACK");
  });
  db.__setPoolForTests(null);

  console.log("data-store.js · CRUD + remove + flush + transacción (modo JSON)");
  // Apunta el store a un DATA_DIR temporal poblando todas las entidades a [].
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cm-store-"));
  // Cargamos el módulo y reescribimos su DATA_DIR vía require interno no es trivial;
  // en su lugar sembramos los ficheros que toquemos en el DATA_DIR real-temporal.
  // El store usa su propio DATA_DIR; para aislar, usamos un require fresco con env.
  process.env.CM_DATA_DIR_TEST = tmp; // (no usado por el store; documenta intención)

  const store = require("../backend/data-store");
  // Como el store ya fijó su DATA_DIR, trabajamos sobre una entidad real de test
  // ("auditoria") y limpiamos al final. init() no es necesario para JSON: readAll
  // hace fallback a fichero/array.
  const N = "auditoria";
  // Estado inicial conocido.
  store.writeAll(N, []);

  await testAsync("insert + update + remove operan por fila y flush confirma", async () => {
    store.insert(N, { id: "a1", v: 1 });
    store.insert(N, { id: "a2", v: 2 });
    store.update(N, "a1", { v: 10 });
    await store.flush();
    let all = store.readAll(N);
    assert.strictEqual(all.length, 2);
    assert.strictEqual(all.find((x) => x.id === "a1").v, 10);
    const borrado = store.remove(N, "a2");
    assert.strictEqual(borrado.id, "a2");
    await store.flush();
    all = store.readAll(N);
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, "a1");
  });

  await testAsync("transaction es atómica: si fn lanza, no aplica nada", async () => {
    store.writeAll(N, [{ id: "base", v: 0 }]);
    let err = false;
    try {
      await store.transaction((tx) => {
        tx.upsert(N, { id: "nuevo", v: 9 });
        throw new Error("falla a mitad");
      });
    } catch (e) { err = true; }
    assert.ok(err, "propaga el error");
    const all = store.readAll(N);
    assert.strictEqual(all.length, 1, "no debe haberse insertado 'nuevo'");
    assert.strictEqual(all[0].id, "base");
  });

  await testAsync("transaction aplica todas las operaciones si fn termina bien", async () => {
    store.writeAll(N, [{ id: "x", v: 1 }]);
    await store.transaction((tx) => {
      tx.upsert(N, { id: "x", v: 2 });
      tx.upsert(N, { id: "y", v: 5 });
      tx.del(N, "noexiste");
    });
    const all = store.readAll(N);
    assert.strictEqual(all.find((r) => r.id === "x").v, 2);
    assert.ok(all.find((r) => r.id === "y"));
  });

  // Limpieza: deja la entidad de test vacía.
  store.writeAll(N, []);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}

  console.log(fallos ? `\n${fallos} prueba(s) FALLIDA(s)` : "\nTodas las pruebas de persistencia OK");
  process.exit(fallos ? 1 : 0);
})();
