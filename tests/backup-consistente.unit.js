// Backup consistente (item 6). El snapshot en modo PostgreSQL se toma en UNA
// transacción REPEATABLE READ (todas las entidades en el mismo instante lógico),
// no leyendo tabla por tabla en momentos distintos. Se prueba con un pool falso
// (sin Postgres real). Ejecutar: node tests/backup-consistente.unit.js
const assert = require("assert");
const db = require("../backend/db");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

console.log("backup · snapshot consistente (Postgres)");

// Pool falso que registra las consultas y devuelve filas por tabla.
const calls = [];
const fakeClient = {
  query: (text) => {
    calls.push(String(text));
    const m = /SELECT data FROM (\w+)/.exec(String(text));
    if (m) {
      const t = m[1];
      return Promise.resolve({ rows: t === "ventas" ? [{ data: { id: "v1", importe: 5 } }] : [] });
    }
    return Promise.resolve({ rows: [] });
  },
  release: () => {},
};
const fakePool = { connect: () => Promise.resolve(fakeClient), query: (t) => fakeClient.query(t) };
db.__setPoolForTests(fakePool);

(async () => {
  await test("snapshotAll usa una transacción REPEATABLE READ y hace COMMIT", async () => {
    calls.length = 0;
    const snap = await db.snapshotAll(["ventas", "materias"]);
    assert.ok(calls.some((c) => /BEGIN ISOLATION LEVEL REPEATABLE READ/.test(c)), "abre REPEATABLE READ");
    assert.ok(calls.includes("COMMIT"), "cierra con COMMIT");
    assert.deepStrictEqual(snap.ventas, [{ id: "v1", importe: 5 }], "lee las filas");
    assert.deepStrictEqual(snap.materias, [], "tabla vacía → []");
  });

  await test("backup.exportar usa el snapshot consistente cuando hay BD", async () => {
    const store = require("../backend/data-store");
    store.__setUsingDbForTests(true);
    const backup = require("../backend/backup");
    const snap = await backup.exportar();
    store.__setUsingDbForTests(false);
    assert.strictEqual(snap.meta.ventas_importe, 5, "el total sale del snapshot de la BD");
    assert.strictEqual(snap.meta.filas.ventas, 1);
  });

  db.__setPoolForTests(null);
  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
})();
