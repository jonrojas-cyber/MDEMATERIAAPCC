// Persistencia · divergencia caché/almacén ante un guardado FALLIDO, reintento y
// reinicio (C7). Una función síncrona no acredita por sí sola atomicidad durable
// ni idempotencia entre peticiones: aquí se demuestra qué ocurre de verdad.
//
//  (JSON) escritura síncrona + rename atómico: si falla, el fichero queda INTACTO
//         y la caché queda por delante → divergencia detectada; reconciliar()
//         vuelve a la verdad durable; un "reinicio" (instancia nueva) NO ve el
//         cambio fallido. En éxito, el cambio sobrevive al reinicio (durable).
//  (BD)   la escritura es asíncrona: el fallo se propaga en flush() (no falso
//         éxito) y marca divergencia; reconciliar() re-hidrata desde la BD.
//  Idempotencia: tras reconciliar, un reintento aplica el cambio EXACTAMENTE una vez.
//
// Ejecutar: node tests/persistencia-divergencia.unit.js
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
  console.log("persistencia · divergencia, reintento y reinicio (C7)");

  // ── JSON ────────────────────────────────────────────────────────────────
  await test("JSON · guardado OK es DURABLE: sobrevive a un reinicio (instancia nueva)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-c7a-"));
    let store = entorno(dir);
    store.writeAll("auditoria", [{ id: "a1", v: 1 }]);
    assert.deepStrictEqual(store.divergencias(), [], "sin divergencia tras guardar bien");
    // "Reinicio": nueva instancia apuntando al MISMO dir (caché vacía → lee fichero).
    store = entorno(dir);
    assert.strictEqual(store.readAll("auditoria").length, 1, "el dato persistió al reinicio");
  });

  await test("JSON · si el guardado FALLA, la caché diverge, se detecta y NADIE lo toma por éxito", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-c7b-"));
    const store = entorno(dir);
    store.writeAll("auditoria", [{ id: "a1", v: 1 }]); // estado durable base
    // Inyecta un fallo de disco en la PRÓXIMA escritura (p. ej. ENOSPC).
    const orig = fs.writeFileSync;
    fs.writeFileSync = () => { throw Object.assign(new Error("no space left on device"), { code: "ENOSPC" }); };
    let lanzo = false;
    try { store.insert("auditoria", { id: "a2", v: 2 }); } catch (e) { lanzo = true; }
    fs.writeFileSync = orig;
    assert.ok(lanzo, "la escritura síncrona LANZA (no se reporta éxito)");
    assert.deepStrictEqual(store.divergencias(), ["auditoria"], "divergencia detectada");
    // La caché quedó por delante (tiene a2); el FICHERO sigue intacto (solo a1).
    assert.strictEqual(store.readAll("auditoria").length, 2, "caché por delante (a2 fantasma)");
    const enDisco = JSON.parse(fs.readFileSync(path.join(dir, "auditoria.json"), "utf8"));
    assert.strictEqual(enDisco.length, 1, "el fichero NO cambió (rename atómico)");
  });

  await test("JSON · reconciliar() vuelve a la verdad durable (descarta el cambio fallido)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-c7c-"));
    const store = entorno(dir);
    store.writeAll("auditoria", [{ id: "a1", v: 1 }]);
    const orig = fs.writeFileSync;
    fs.writeFileSync = () => { throw new Error("disco lleno"); };
    try { store.insert("auditoria", { id: "a2", v: 2 }); } catch (e) {}
    fs.writeFileSync = orig;
    await store.reconciliar("auditoria");
    assert.deepStrictEqual(store.divergencias(), [], "ya no hay divergencia");
    assert.strictEqual(store.readAll("auditoria").length, 1, "la caché vuelve a 1 (a2 descartado)");
    // Idempotencia: tras reconciliar, REINTENTAR aplica el cambio UNA sola vez.
    store.insert("auditoria", { id: "a2", v: 2 });
    assert.strictEqual(store.readAll("auditoria").length, 2, "reintento añade a2 exactamente una vez");
    const enDisco = JSON.parse(fs.readFileSync(path.join(dir, "auditoria.json"), "utf8"));
    assert.strictEqual(enDisco.length, 2, "y ahora SÍ está en disco");
  });

  // ── PostgreSQL (asíncrono) ────────────────────────────────────────────────
  await test("BD · el fallo se propaga en flush() y marca divergencia; reconciliar() re-hidrata", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-c7d-"));
    const store = entorno(dir);
    const db = require("../backend/db");
    // BD "durable" simulada en memoria.
    const durable = { auditoria: [{ id: "a1", v: 1 }] };
    let fallar = false;
    db.loadAll = async (n) => (durable[n] || []).map((r) => ({ ...r }));
    db.upsert = async (n, row) => { if (fallar) throw new Error("conexión BD perdida"); const a = durable[n] || (durable[n] = []); const i = a.findIndex((x) => x.id === row.id); if (i === -1) a.push(row); else a[i] = row; };
    db.replaceAll = async (n, rows) => { if (fallar) throw new Error("conexión BD perdida"); durable[n] = rows.map((r) => ({ ...r })); };
    store.__setUsingDbForTests(true);
    try {
      // Hidrata la caché desde la "BD".
      await store.reconciliar("auditoria");
      assert.strictEqual(store.readAll("auditoria").length, 1);

      // Guardado que FALLA: la caché se modifica (a2) pero la BD rechaza.
      fallar = true;
      store.insert("auditoria", { id: "a2", v: 2 });
      let lanzo = false;
      try { await store.flush(); } catch (e) { lanzo = true; }
      assert.ok(lanzo, "flush propaga el fallo (no falso éxito)");
      assert.deepStrictEqual(store.divergencias(), ["auditoria"], "divergencia marcada");
      assert.strictEqual(durable.auditoria.length, 1, "la BD NO tiene a2");

      // reconciliar: la caché vuelve a lo que hay en la BD (a2 fantasma descartado).
      await store.reconciliar("auditoria");
      assert.strictEqual(store.readAll("auditoria").length, 1, "caché re-hidratada desde BD");
      assert.deepStrictEqual(store.divergencias(), [], "divergencia resuelta");

      // Reintento con la BD ya sana: ahora sí persiste, exactamente una vez.
      fallar = false;
      store.insert("auditoria", { id: "a2", v: 2 });
      await store.flush();
      assert.strictEqual(durable.auditoria.length, 2, "a2 persistido una sola vez");
      assert.deepStrictEqual(store.divergencias(), [], "sin divergencia tras confirmar");
    } finally {
      store.__setUsingDbForTests(false);
    }
  });

  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
})();
