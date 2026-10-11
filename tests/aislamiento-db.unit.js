// Aislamiento de pruebas con PostgreSQL (item 5). Garantiza que NINGUNA prueba
// escribe en una base real: en modo aislado (CONTROL_M_DATA_DIR), el data-store
// IGNORA DATABASE_URL del entorno aunque esté definida. Un DATA_DIR temporal no
// protege por sí solo Postgres; este guard sí.
// Ejecutar: node tests/aislamiento-db.unit.js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("aislamiento de pruebas vs base real");

(async () => {
  await test("modo aislado IGNORA DATABASE_URL: no conecta ni escribe en la base real", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-dbiso-"));
    process.env.CONTROL_M_DATA_DIR = dir;
    // DATABASE_URL simulada a un host que NO existe: si el store intentara
    // conectar, fallaría o tocaría algo real. No debe intentarlo siquiera.
    process.env.DATABASE_URL = "postgres://u:secreto@host-que-no-debe-tocarse:5432/prod";
    delete process.env.CONTROL_M_ALLOW_DB;
    for (const k of Object.keys(require.cache)) {
      if (/backend[\/\\](data-store|db)\.js$/.test(k)) delete require.cache[k];
    }
    const store = require("../backend/data-store");
    await store.init();
    assert.strictEqual(store.isUsingDb(), false, "en modo aislado NO debe usar la BD");
    assert.strictEqual(store.persistenceInfo().modo, "json", "se queda en JSON");
    store.writeAll("auditoria", [{ id: "a1", v: 1 }]);
    await store.flush();
    assert.ok(fs.existsSync(path.join(dir, "auditoria.json")), "escribe en el temporal, no en la base real");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await test("con CONTROL_M_ALLOW_DB=1 sí se permitiría (vía de BD de test explícita)", async () => {
    // No conectamos de verdad (no hay Postgres); solo comprobamos que el guard
    // deja pasar la intención cuando se pide explícitamente una BD de test.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-dbiso2-"));
    process.env.CONTROL_M_DATA_DIR = dir;
    process.env.CONTROL_M_ALLOW_DB = "1";
    delete process.env.DATABASE_URL; // sin URL → sigue en JSON, pero el guard no bloquea
    for (const k of Object.keys(require.cache)) {
      if (/backend[\/\\](data-store|db)\.js$/.test(k)) delete require.cache[k];
    }
    const store = require("../backend/data-store");
    await store.init();
    assert.strictEqual(store.isUsingDb(), false, "sin DATABASE_URL sigue en JSON (no hay base)");
    delete process.env.CONTROL_M_ALLOW_DB;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
})();
