// Copia de seguridad y restauración (bloque 01).
//  (1) export() toma un snapshot coherente con filas/claves/totales.
//  (2) restaurar() reconstruye el estado EN UN ENTORNO INDEPENDIENTE y cuadra.
//  (3) restaurar() se NIEGA a escribir sobre un almacén no aislado sin force.
// Ejecutar: CONTROL_M_DATA_DIR=<tmp> node tests/backup-restore.unit.js
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

// Carga un par store+backup apuntando a un DATA_DIR concreto (entorno aislado).
function entorno(dir) {
  process.env.CONTROL_M_DATA_DIR = dir;
  for (const k of Object.keys(require.cache)) {
    if (/backend[\/\\](data-store|backup|db)\.js$/.test(k)) delete require.cache[k];
  }
  return { store: require("../backend/data-store"), backup: require("../backend/backup") };
}

(async () => {
  console.log("backup / restore");
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), "cm-bkA-"));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), "cm-bkB-"));

  const A = entorno(dirA);
  A.store.writeAll("ventas", [{ id: "v1", importe: 10.5 }, { id: "v2", importe: 4.5 }]);
  A.store.writeAll("stock_movements", [{ id: "sm1", cantidad: 3 }, { id: "sm2", cantidad: -1 }]);
  A.store.writeAll("materias", [{ id: "m1", nombre: "Grano" }]);
  await A.store.flush();

  let snap;
  await test("export() produce snapshot con totales de dinero/stock y filas", async () => {
    snap = await A.backup.exportar();
    assert.strictEqual(snap.meta.ventas_importe, 15, "ventas_importe = 10,5 + 4,5");
    assert.strictEqual(snap.meta.filas.ventas, 2, "2 ventas");
    assert.strictEqual(snap.meta.movimientos_stock, 2, "2 movimientos");
    assert.strictEqual(snap.meta.stock_delta, 2, "3 − 1 = 2");
    assert.ok(snap.meta.version, "incluye un identificador de versión");
  });

  await test("restaurar() reconstruye el estado en un entorno INDEPENDIENTE (dirB)", async () => {
    const B = entorno(dirB);
    const r = await B.backup.restaurar(snap); // aislado → permitido
    assert.strictEqual(r.filas.ventas, 2, "filas de ventas cuadran");
    assert.strictEqual(r.ventas_importe, 15, "total de dinero cuadra");
    assert.strictEqual(r.movimientos_stock, 2, "movimientos cuadran");
    assert.deepStrictEqual(r.ids_duplicados, {}, "sin ids duplicados");
    assert.deepStrictEqual(B.store.readAll("ventas").map((v) => v.id).sort(), ["v1", "v2"], "claves preservadas");
    assert.strictEqual(B.store.readAll("materias")[0].nombre, "Grano", "contenido preservado");
    assert.ok(fs.existsSync(path.join(dirB, "ventas.json")), "escribió en dirB, no en el original");
    assert.ok(!fs.existsSync(path.join(dirA, "..", "backend", "data", "no-tocar")), "no tocó SEED_DIR");
  });

  await test("restaurar() se niega sobre un almacén NO aislado sin force", async () => {
    const B = entorno(dirB);
    const original = B.store.persistenceInfo;
    B.store.persistenceInfo = () => ({ aislado: false, modo: "json", data_dir: "data" });
    let threw = false;
    try { await B.backup.restaurar(snap); } catch (e) { threw = true; }
    B.store.persistenceInfo = original;
    assert.ok(threw, "debe lanzar para proteger datos reales");
  });

  try { fs.rmSync(dirA, { recursive: true, force: true }); fs.rmSync(dirB, { recursive: true, force: true }); } catch (e) {}

  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
})();
