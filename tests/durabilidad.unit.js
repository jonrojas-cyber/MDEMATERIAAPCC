// Guardado durable e integridad (bloque 03).
//  (1) nextId es único en lote y no reutiliza ids tras borrar (datos.1/2/10).
//  (2) La escritura es atómica (no deja .tmp ni fichero a medias) (datos.4).
//  (3) Un JSON corrupto NO se silencia como [] (datos.4): lanza para restaurar.
//  (4) flush() PROPAGA el fallo de escritura (no falso 200 en Postgres) (datos.3/tests.1).
// Ejecutar: node tests/durabilidad.unit.js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

function entorno(dir) {
  process.env.CONTROL_M_DATA_DIR = dir;
  for (const k of Object.keys(require.cache)) {
    if (/backend[\/\\](data-store|backup|db)\.js$/.test(k)) delete require.cache[k];
  }
  return require("../backend/data-store");
}

(async () => {
  console.log("durabilidad · ids, escritura atómica, corrupción y flush");

  await test("nextId es único en lote grande y no depende de length", () => {
    const store = entorno(fs.mkdtempSync(path.join(os.tmpdir(), "cm-dur1-")));
    const ids = new Set();
    for (let i = 0; i < 5000; i++) ids.add(store.nextId("mov", "stock_movements"));
    assert.strictEqual(ids.size, 5000, "5000 ids distintos sin colisión");
    // Tras 'borrar' (length baja), el siguiente id NO repite uno anterior.
    const a = store.nextId("mov", "stock_movements");
    assert.ok(!ids.has(a), "no reutiliza id tras borrado");
  });

  await test("writeAll escribe JSON válido y no deja ficheros .tmp", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-dur2-"));
    const store = entorno(dir);
    store.writeAll("auditoria", [{ id: "a1", v: 1 }, { id: "a2", v: 2 }]);
    const leido = JSON.parse(fs.readFileSync(path.join(dir, "auditoria.json"), "utf8"));
    assert.strictEqual(leido.length, 2, "contenido correcto");
    const tmp = fs.readdirSync(dir).filter((f) => f.includes(".tmp-"));
    assert.strictEqual(tmp.length, 0, "sin temporales tras renombrar");
  });

  await test("un JSON corrupto NO se convierte en [] silencioso: lanza DATOS_CORRUPTOS", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-dur3-"));
    const store = entorno(dir);
    fs.writeFileSync(path.join(dir, "auditoria.json"), "{ esto no es json válido", "utf8");
    let err = null;
    try { store.readAll("auditoria"); } catch (e) { err = e; }
    assert.ok(err, "debe lanzar, no devolver []");
    assert.strictEqual(err.code, "DATOS_CORRUPTOS");
    // El fichero corrupto sigue intacto (no se ha sobrescrito).
    assert.ok(fs.readFileSync(path.join(dir, "auditoria.json"), "utf8").startsWith("{ esto"), "no se sobrescribe");
  });

  await test("flush() propaga el fallo de escritura (no falso éxito en modo BD)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-dur4-"));
    const store = entorno(dir);
    const db = require("../backend/db");
    db.upsert = async () => { throw new Error("escritura rechazada por la BD"); };
    store.__setUsingDbForTests(true);
    try {
      store.insert("auditoria", { id: "z1", v: 1 }); // encola db.upsert (que rechaza)
      let lanzo = false;
      try { await store.flush(); } catch (e) { lanzo = true; }
      assert.ok(lanzo, "flush debe rechazar si una escritura falló");
    } finally {
      store.__setUsingDbForTests(false);
    }
  });

  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
})();
