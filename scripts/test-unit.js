#!/usr/bin/env node
// Runner de los tests unitarios de Control M con DATA_DIR AISLADO.
//
// Por qué: antes los unitarios escribían en backend/data (los fixtures
// versionados) y se dependía de `git checkout -- backend/data` para limpiar
// (frágil y destructivo — AUDITORIA tests.3). Ahora todos comparten un
// CONTROL_M_DATA_DIR temporal sembrado desde las semillas versionadas; los
// fixtures del repo NUNCA se tocan y la limpieza es borrar el temporal.
//
// Esta lista ORDENADA es la fuente única del orden de los unitarios (sustituye
// a la cadena `&&` de package.json). Al añadir un test, añádelo aquí.
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const FILES = [
  "persistence", "agora", "unidades", "calendario", "compras", "prevision",
  "insights", "financials", "snapshot", "timeline", "health", "treasury",
  "fixed-costs", "albaran-intake", "mbds", "cierre-caja", "tz", "limpieza-demo",
  "seed-proveedores", "compras-informe", "seed-productos-agora", "seed-usuarios",
  "cierre-mes", "seed-cocina", "costing-elaboracion", "analisis-diario",
  "limpieza-produccion", "dossier", "conector", "cuenta-resultados", "turnos",
  "seed-turnos", "fichaje", "equipo-sistema", "seed-fit", "matcha-precio",
  "analisis-mes", "xlsx-lite", "etiquetas-catalogo", "agora-sync", "appcc-lotes",
  "mermas-motivos", "mermas-analytics", "facturas-email", "resend-inbound",
  "facturas-control", "facturas-paquete", "proveedor-ficha", "factura-procesar",
  "conciliacion", "seed-escandallos-tpv", "seed-escandallos-limonadas",
  "coste-desde-compras", "ventas-export", "migracion-ventas-dup",
  "panel-direccion", "tpv-connector", "pedidos", "seed-productos-facturas",
  "fixed-costs-segmentado", "financiero", "catalogo-revision", "seed-objetivos",
  "dashboard-ceo", "limpieza-catalogo", "comparativa-mtd", "ventas-email",
  "conciliacion-ventas", "economia-guard", "pyl-neto", "consistencia-pantallas",
  "agora-cuadre", "backup-restore", "seguridad", "durabilidad",
  "agora-cron-idempotente", "motor-financiero", "sv-timers", "periodos-stock",
  "rendimiento", "roles-regla2", "cuadre-agora", "aislamiento-db", "backup-consistente",
  "process-guards", "integracion-http", "doble-iva", "incremental-ventas",
  "coste-parcial", "motor-fechas", "persistencia-divergencia",
].map((n) => `tests/${n}.unit.js`);

const ROOT = path.join(__dirname, "..");

// Red de seguridad (tests.5): ningún tests/*.unit.js debe quedarse fuera de la
// lista por descuido. Si aparece uno nuevo sin registrar, fallamos ruidosamente.
const registrados = new Set(FILES.map((f) => path.basename(f)));
const enDisco = fs.readdirSync(path.join(ROOT, "tests")).filter((f) => f.endsWith(".unit.js"));
const sinRegistrar = enDisco.filter((f) => !registrados.has(f));
if (sinRegistrar.length) {
  console.error("✗ Tests sin registrar en scripts/test-unit.js:\n  " + sinRegistrar.join("\n  "));
  process.exit(1);
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cm-unit-"));
// Misma zona horaria que producción (Málaga): los tests de periodos/fechas
// representan el comportamiento real, no la UTC del CI (motor-fechas.3).
// DATABASE_URL vacía: ninguna prueba toca una base PostgreSQL real (defensa en
// profundidad; el data-store además ignora la BD en modo aislado).
// TZ FORZADA a Madrid (como producción vía tz-init), ignorando el TZ heredado del
// CI (que suele ser UTC): así los tests de periodos reflejan el comportamiento real
// del negocio y no la UTC del runner (motor-fechas.3). Override solo con CONTROL_M_TZ.
const env = { ...process.env, CONTROL_M_DATA_DIR: dataDir, TZ: process.env.CONTROL_M_TZ || "Europe/Madrid", DATABASE_URL: "" };

let failed = null;
try {
  for (const file of FILES) {
    if (!fs.existsSync(path.join(ROOT, file))) {
      console.error(`✗ falta el fichero de test: ${file}`);
      failed = file;
      break;
    }
    const r = spawnSync(process.execPath, [file], { cwd: ROOT, env, stdio: "inherit" });
    if (r.status !== 0) { failed = file; break; }
  }
} finally {
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (e) {}
}

if (failed) { console.error(`\n✗ Unitarios fallaron en: ${failed}`); process.exit(1); }
console.log("\n✓ Todos los unitarios en verde (DATA_DIR aislado, fixtures intactos).");
process.exit(0);
