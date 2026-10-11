// Archiva a disco los movimientos de stock más antiguos que N meses, acotando la
// tabla viva (rendimiento.7). Uso:
//   node scripts/archivar-movimientos.js --meses 18
// Por defecto 18 meses. NO borra nada hasta haber escrito el fichero de archivo en
// backend/data/archivo/. Conserva todo (restaurable). Pensado para un cron mensual.
require("../backend/tz-init");
const store = require("../backend/data-store");
const retencion = require("../backend/retencion");

function arg(nombre, def) {
  const i = process.argv.indexOf("--" + nombre);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

(async () => {
  await store.init();
  const meses = Number(arg("meses", 18));
  const r = retencion.archivarMovimientos({ store, meses });
  await store.flush();
  console.log(`Archivado de movimientos (> ${meses} meses):`);
  console.log(`  archivados: ${r.archivados}`);
  console.log(`  conservados en la tabla viva: ${r.conservados}`);
  if (r.fichero) console.log(`  fichero: ${r.fichero}`);
  process.exit(0);
})().catch((e) => { console.error("Error archivando:", e.message); process.exit(1); });
