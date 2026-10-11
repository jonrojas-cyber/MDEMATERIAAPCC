// Copia de seguridad y restauración de Control M.
//
// Funciona en los dos modos de persistencia (PostgreSQL o ficheros JSON) porque
// opera sobre la caché ya hidratada del data-store (store.init() la rellena
// desde la BD o desde el disco). Un snapshot es un único objeto autodescrito:
//   { meta: {fecha, modo, version, filas, total_filas}, datos: { <entidad>: [...] } }
//
// Principios de seguridad (ver AUDITORIA · datos.8 y el plan, bloque 01):
//   · NO hay endpoint HTTP público que exporte todo: esto es una herramienta de
//     operación (CLI/arranque), no una ruta de la API.
//   · El snapshot se toma tras flush() para que sea coherente (no una copia a
//     medias durante una escritura).
//   · restaurar() se niega a escribir sobre un almacén NO aislado salvo force
//     explícito: las pruebas de restauración se hacen en un entorno independiente.
//
// Para producción con PostgreSQL, el respaldo robusto definitivo es pg_dump del
// proveedor; este módulo da además una copia lógica verificable e independiente
// del proveedor, que es justo lo que pide la prueba de restauración.

const fs = require("fs");
const path = require("path");
const store = require("./data-store");

// Identificador de versión NO sensible (sha corto del despliegue si lo expone
// el entorno; "dev" en local). Nunca incluye credenciales.
function versionId() {
  const v =
    process.env.RENDER_GIT_COMMIT ||
    process.env.SOURCE_VERSION ||
    process.env.GIT_SHA ||
    process.env.GIT_COMMIT ||
    "dev";
  return String(v).slice(0, 12);
}

// Resumen verificable de un conjunto de datos: filas por entidad, ids
// duplicados (deben ser 0), y totales de dinero/stock para cuadrar una
// restauración contra el original.
function resumen(datos) {
  const filas = {};
  const idsDuplicados = {};
  for (const name of store.ENTITIES) {
    const arr = Array.isArray(datos[name]) ? datos[name] : [];
    filas[name] = arr.length;
    const vistos = new Set();
    let dup = 0;
    for (const r of arr) {
      const id = r && r.id;
      if (id == null) continue;
      if (vistos.has(id)) dup++;
      else vistos.add(id);
    }
    if (dup) idsDuplicados[name] = dup;
  }
  const ventas = Array.isArray(datos.ventas) ? datos.ventas : [];
  const ventas_importe = Math.round(
    ventas.reduce((s, v) => s + (Number(v && v.importe) || 0), 0) * 100
  ) / 100;
  const movimientos = Array.isArray(datos.stock_movements) ? datos.stock_movements : [];
  const stock_delta = Math.round(
    movimientos.reduce((s, m) => s + (Number(m && (m.cantidad != null ? m.cantidad : m.delta)) || 0), 0) * 1000
  ) / 1000;
  return {
    total_filas: Object.values(filas).reduce((a, b) => a + b, 0),
    filas,
    ids_duplicados: idsDuplicados,
    ventas_importe,
    movimientos_stock: movimientos.length,
    stock_delta,
  };
}

// Toma un snapshot coherente del estado actual. Requiere store.init() previo.
async function exportar() {
  await store.flush(); // confirma escrituras pendientes antes de copiar
  const datos = {};
  for (const name of store.ENTITIES) {
    datos[name] = (store.readAll(name) || []).slice();
  }
  const info = store.persistenceInfo();
  return {
    meta: {
      app: "control-m",
      fecha: new Date().toISOString(),
      modo: info.modo,
      version: versionId(),
      ...resumen(datos),
    },
    datos,
  };
}

// Escribe el snapshot en disco (fuera del almacén de datos). Devuelve la ruta.
async function exportarAFichero(dir) {
  const destino = dir || process.env.BACKUP_DIR || path.join(require("os").tmpdir(), "control-m-backups");
  fs.mkdirSync(destino, { recursive: true });
  const snap = await exportar();
  const ts = snap.meta.fecha.replace(/[:.]/g, "-");
  const file = path.join(destino, `control-m-${ts}.json`);
  fs.writeFileSync(file, JSON.stringify(snap, null, 2), "utf-8");
  // Acceso restringido al fichero (solo propietario); en Windows es no-op.
  try { fs.chmodSync(file, 0o600); } catch (e) {}
  return { file, meta: snap.meta };
}

// Restaura un snapshot EN EL ALMACÉN ACTUAL. Por seguridad se niega a escribir
// sobre un almacén no aislado (producción) salvo que force sea true, para que
// las pruebas de restauración corran en un entorno independiente.
async function restaurar(snapshot, { force = false } = {}) {
  if (!snapshot || !snapshot.datos) throw new Error("snapshot inválido: falta 'datos'");
  const info = store.persistenceInfo();
  if (!info.aislado && !force) {
    throw new Error(
      "restaurar() abortado: el almacén de destino NO está aislado. Restaura en un " +
      "entorno independiente (CONTROL_M_DATA_DIR) o pasa force:true conscientemente."
    );
  }
  for (const name of store.ENTITIES) {
    if (Array.isArray(snapshot.datos[name])) {
      store.writeAll(name, snapshot.datos[name].slice());
    }
  }
  await store.flush();
  // Relee lo escrito y resúmelo para verificar la restauración.
  const releido = {};
  for (const name of store.ENTITIES) releido[name] = store.readAll(name) || [];
  return resumen(releido);
}

// Carga un snapshot desde fichero.
function cargar(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

module.exports = { exportar, exportarAFichero, restaurar, resumen, cargar, versionId };
