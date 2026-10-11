#!/usr/bin/env node
// Restauración de Control M (CLI) — SIEMPRE en un entorno aislado salvo --force.
// Uso:
//   CONTROL_M_DATA_DIR=/ruta/aislada node scripts/restore.js <snapshot.json> [--force]
// Verifica la restauración (filas, ids únicos, totales) y cuadra con el snapshot.
const path = require("path");
const store = require(path.join(__dirname, "..", "backend", "data-store"));
const backup = require(path.join(__dirname, "..", "backend", "backup"));

(async () => {
  const file = process.argv[2];
  if (!file) { console.error("Uso: CONTROL_M_DATA_DIR=/ruta node scripts/restore.js <snapshot.json> [--force]"); process.exit(2); }
  const force = process.argv.includes("--force");
  await store.init();
  const info = store.persistenceInfo();
  if (!info.aislado && !force) {
    console.error("Destino NO aislado (producción). Define CONTROL_M_DATA_DIR a un entorno de prueba, o usa --force a conciencia.");
    process.exit(3);
  }
  const snap = backup.cargar(file);
  const r = await backup.restaurar(snap, { force });
  console.log(`✓ Restaurado en modo ${info.modo} (data_dir=${info.data_dir}).`);
  console.log(`  filas=${r.total_filas} ventas_importe=${r.ventas_importe}€ movimientos_stock=${r.movimientos_stock}`);
  const dup = Object.keys(r.ids_duplicados || {});
  if (dup.length) console.warn("  ⚠ ids duplicados:", JSON.stringify(r.ids_duplicados));
  const o = snap.meta || {};
  const cuadra = o.total_filas === r.total_filas && (o.ventas_importe == null || o.ventas_importe === r.ventas_importe);
  console.log(cuadra ? "  ✓ cuadra con el snapshot original" : "  ✗ NO cuadra con el snapshot original");
  process.exit(cuadra ? 0 : 4);
})().catch((e) => { console.error("Fallo en restore:", e.message); process.exit(1); });
