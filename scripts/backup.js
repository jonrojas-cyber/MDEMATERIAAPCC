#!/usr/bin/env node
// Copia de seguridad de Control M (operación, no API pública). Uso:
//   node scripts/backup.js [directorio-destino]
// Destino por defecto: $BACKUP_DIR o <tmp>/control-m-backups (fuera del repo y
// del disco de la app). Funciona en modo PostgreSQL y en modo JSON.
const path = require("path");
const store = require(path.join(__dirname, "..", "backend", "data-store"));
const backup = require(path.join(__dirname, "..", "backend", "backup"));

(async () => {
  await store.init();
  const { file, meta } = await backup.exportarAFichero(process.argv[2]);
  console.log(`✓ Copia creada: ${file}`);
  console.log(`  modo=${meta.modo} version=${meta.version} filas=${meta.total_filas} ventas_importe=${meta.ventas_importe}€`);
  process.exit(0);
})().catch((e) => { console.error("Fallo en backup:", e.message); process.exit(1); });
