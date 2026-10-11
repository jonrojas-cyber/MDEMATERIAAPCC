// Escrituras incrementales de ventas (datos.5/rendimiento.1). La ingesta añade
// solo lo nuevo: db.insertMany hace upserts en una transacción SIN borrar la
// tabla, a diferencia de replaceAll (DELETE + re-INSERT de TODO el histórico).
// Se prueba a nivel SQL con un pool falso. Ejecutar: node tests/incremental-ventas.unit.js
const assert = require("assert");
const db = require("../backend/db");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

const calls = [];
const client = { query: (t) => { calls.push(String(t)); return Promise.resolve({ rows: [] }); }, release: () => {} };
db.__setPoolForTests({ connect: () => Promise.resolve(client), query: (t) => client.query(t) });

console.log("escrituras incrementales de ventas");

(async () => {
  await test("insertMany hace upserts en transacción y NO borra la tabla", async () => {
    calls.length = 0;
    await db.insertMany("ventas", [{ id: "v1", importe: 5 }, { id: "v2", importe: 6 }]);
    assert.ok(calls.some((c) => /BEGIN/.test(c)), "abre transacción");
    assert.ok(calls.some((c) => /COMMIT/.test(c)), "commit");
    assert.strictEqual(calls.filter((c) => /ON CONFLICT \(id\) DO UPDATE/.test(c)).length, 2, "2 upserts (una fila nueva cada uno)");
    assert.ok(!calls.some((c) => /DELETE FROM ventas/.test(c)), "NO borra el histórico de ventas");
  });

  await test("replaceAll SÍ borra toda la tabla (lo que hacía la ingesta antes)", async () => {
    calls.length = 0;
    await db.replaceAll("ventas", [{ id: "v1", importe: 5 }]);
    assert.ok(calls.some((c) => /DELETE FROM ventas/.test(c)), "replaceAll borra todo");
  });

  db.__setPoolForTests(null);
  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
})();
