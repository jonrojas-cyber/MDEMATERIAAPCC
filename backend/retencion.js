// Retención/archivado de movimientos de stock (rendimiento.7). stock_movements es
// la tabla que más crece (1+ movimiento por ingrediente por línea de venta) y se
// hidrata ENTERA en memoria. No hay que perder el histórico, pero sí ACOTAR la tabla
// viva: este módulo separa los movimientos antiguos y los guarda en FICHEROS de
// archivo (no en memoria), dejando en la tabla solo la ventana reciente.
//
// Es CONSERVADOR y bajo demanda (scripts/archivar-movimientos.js): por defecto no
// purga nada; conserva todo lo archivado en disco (se puede restaurar). Así se
// respeta "no perder datos reales" y a la vez se limita el crecimiento sin límite.
const fs = require("fs");
const path = require("path");

// Separa una lista por fecha de corte: {recientes, antiguos}. `fechaDe` extrae el
// timestamp de cada movimiento (created_at por defecto). Los sin fecha se CONSERVAN
// como recientes (nunca se archiva algo cuya antigüedad no se puede determinar).
function particionar(movimientos, cutoffTs, fechaDe) {
  const getTs = fechaDe || ((m) => new Date(m && m.created_at).getTime());
  const recientes = [];
  const antiguos = [];
  (movimientos || []).forEach((m) => {
    const t = getTs(m);
    if (Number.isFinite(t) && t < cutoffTs) antiguos.push(m);
    else recientes.push(m);
  });
  return { recientes, antiguos };
}

// Timestamp de corte: ahora − `meses` (aprox. 30,4 días/mes). meses<=0 → no archiva.
function cutoffMeses(meses, now) {
  const n = Number(meses) || 0;
  if (n <= 0) return null;
  return (now || Date.now()) - n * 30.4375 * 86400000;
}

// Archiva a disco los movimientos más antiguos que `meses`. Devuelve un resumen.
// store se inyecta (data-store) para poder testear sin tocar el real. No borra nada
// hasta haber ESCRITO el fichero de archivo (primero se preserva, luego se recorta).
function archivarMovimientos({ store, meses = 18, now = Date.now(), dir } = {}) {
  const cutoff = cutoffMeses(meses, now);
  if (cutoff == null) return { archivados: 0, conservados: (store.readAll("stock_movements") || []).length, motivo: "meses<=0: no se archiva" };
  const todos = store.readAll("stock_movements") || [];
  const { recientes, antiguos } = particionar(todos, cutoff);
  if (!antiguos.length) return { archivados: 0, conservados: recientes.length, fichero: null };
  const destino = dir || path.join(__dirname, "data", "archivo");
  try { fs.mkdirSync(destino, { recursive: true }); } catch (e) {}
  const sello = new Date(now).toISOString().slice(0, 10);
  const fichero = path.join(destino, `stock_movements-hasta-${sello}.json`);
  // Si ya existe un archivo de hoy, se ACUMULA (no se pisa), para no perder datos.
  let previos = [];
  try { previos = JSON.parse(fs.readFileSync(fichero, "utf8")); } catch (e) {}
  fs.writeFileSync(fichero, JSON.stringify(previos.concat(antiguos), null, 2), "utf8");
  store.writeAll("stock_movements", recientes); // recorta la tabla viva SOLO tras preservar
  return { archivados: antiguos.length, conservados: recientes.length, fichero };
}

module.exports = { particionar, cutoffMeses, archivarMovimientos };
