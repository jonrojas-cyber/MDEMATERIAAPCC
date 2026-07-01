// Almacén de datos de Control M · Producción.
//
// API pública (síncrona) idéntica a la original — las rutas no cambian:
//   readAll, writeAll, findById, update, insert, nextId, DATA_DIR
//
// Por debajo mantiene una caché en memoria que se hidrata al arrancar:
//   · Con DATABASE_URL  → lee/escribe en PostgreSQL (persistente entre despliegues).
//   · Sin DATABASE_URL  → lee/escribe en los ficheros JSON de /data (como siempre).
//
// La primera vez que arranca contra una base vacía, siembra cada tabla con el
// contenido de su JSON inicial (seed).

const fs = require("fs");
const path = require("path");
const db = require("./db");

const DATA_DIR = path.join(__dirname, "data");

// Todas las entidades del sistema (incluye las nuevas: productos, ventas, impresiones).
const ENTITIES = [
  "materias",
  "recetas",
  "lotes",
  "preparaciones",
  "revisiones",
  "ajustes",
  "proveedores",
  "recepciones",
  "etiquetas",
  "productos",
  "ventas",
  "impresiones",
  "consumos",
  "sincronizaciones",
  "justificantes",
  "pedidos",
  "config",
  "push_subs",
  "compras_productos",
  "precios_historico",
  "usuarios", // cuentas con PIN hasheado (seguridad)
  "auditoria", // registro de acciones críticas (trazabilidad)
  "docs_agora", // documentos de Ágora (estado: procesado/bloqueado) — idempotencia
  "stock_movements", // libro de movimientos de stock (el stock no cambia sin movimiento)
  "recetario_cafe", // recetas de calibración por tipo de café (dosis, molienda, tiempo)
  "apertura", // checklist de apertura del local, por día (rutina de arranque)
];

const cache = {};
let usingDb = false;

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readFile(name) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), "utf-8"));
  } catch (e) {
    return [];
  }
}

function writeFile(name, data) {
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

// Se llama una vez al arrancar el servidor, antes de aceptar peticiones.
async function init() {
  usingDb = await db.connect().catch((e) => {
    console.error("No se pudo conectar a PostgreSQL, uso ficheros JSON:", e.message);
    return false;
  });

  for (const name of ENTITIES) {
    if (usingDb) {
      await db.ensureTable(name);
      let rows = await db.loadAll(name);
      if (rows.length === 0) {
        const seed = readFile(name); // siembra inicial desde el JSON
        if (seed.length) {
          await db.replaceAll(name, seed);
          rows = seed;
        }
      }
      cache[name] = rows;
    } else {
      cache[name] = readFile(name);
    }
  }

  console.log(
    usingDb
      ? "data-store: PostgreSQL activo (datos persistentes)"
      : "data-store: modo ficheros JSON (sin DATABASE_URL)"
  );
}

// ── Cola de escritura por entidad ───────────────────────────────────────────
// Serializa las escrituras de cada entidad (orden garantizado) y permite
// esperar la confirmación con flush(). En modo JSON la escritura es síncrona y
// durable (fs.writeFileSync), así que la promesa resuelve ya confirmada.
const colas = {};
function encolar(name, op) {
  const prev = colas[name] || Promise.resolve();
  const next = prev.then(op).catch((e) => console.error(`Error guardando '${name}':`, e.message));
  colas[name] = next;
  return next;
}
// Espera a que TODAS las escrituras pendientes estén confirmadas en disco/BD.
function flush() {
  return Promise.allSettled(Object.values(colas));
}

// Persistencia por fila (no reescribe la tabla entera).
function persistUpsert(name, row) {
  if (usingDb) return encolar(name, () => db.upsert(name, row));
  writeFile(name, cache[name]); // JSON: durable y síncrono
  return Promise.resolve();
}
function persistDelete(name, id) {
  if (usingDb) return encolar(name, () => db.del(name, id));
  writeFile(name, cache[name]);
  return Promise.resolve();
}
// Reemplazo masivo (writeAll): solo cuando de verdad cambia toda la colección.
function persistAll(name) {
  if (usingDb) return encolar(name, () => db.replaceAll(name, cache[name]));
  writeFile(name, cache[name]);
  return Promise.resolve();
}

function readAll(name) {
  if (!cache[name]) cache[name] = readFile(name); // fallback defensivo
  return cache[name];
}

function writeAll(name, data) {
  cache[name] = data;
  persistAll(name);
  return data;
}

function findById(name, id) {
  return readAll(name).find((item) => item.id === id) || null;
}

function update(name, id, patch) {
  const items = readAll(name);
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch };
  persistUpsert(name, items[idx]); // CRUD real: una sola fila
  return items[idx];
}

function insert(name, item) {
  const items = readAll(name);
  items.push(item);
  persistUpsert(name, item); // CRUD real: una sola fila
  return item;
}

// Borra una fila por id (CRUD completo). Devuelve la fila borrada o null.
function remove(name, id) {
  const items = readAll(name);
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  const [borrado] = items.splice(idx, 1);
  persistDelete(name, id);
  return borrado;
}

// Operación atómica multi-entidad (todo o nada). `fn` registra operaciones con
// upsert(name,row) / del(name,id); NADA se aplica hasta que fn termina sin
// lanzar. En BD se confirma en una transacción real; en JSON se reescriben los
// ficheros afectados solo al final. Lectura: readAll ve el estado ya confirmado
// (no las operaciones en curso de la propia transacción).
async function transaction(fn) {
  const ops = [];
  const api = {
    upsert: (name, row) => { if (!row || row.id == null) throw new Error(`upsert sin id en '${name}'`); ops.push({ tipo: "upsert", name, row }); },
    del: (name, id) => ops.push({ tipo: "del", name, id }),
    readAll,
  };
  await fn(api); // si lanza, no se aplica nada

  if (usingDb) {
    await db.tx(async (txdb) => {
      for (const o of ops) {
        if (o.tipo === "upsert") await txdb.upsert(o.name, o.row);
        else await txdb.del(o.name, o.id);
      }
    });
  }
  // Aplica a la caché (y a los ficheros en modo JSON) una vez confirmado.
  const tocadas = new Set();
  for (const o of ops) {
    const arr = readAll(o.name);
    const i = arr.findIndex((x) => x.id === (o.tipo === "upsert" ? o.row.id : o.id));
    if (o.tipo === "upsert") { if (i === -1) arr.push(o.row); else arr[i] = o.row; }
    else if (i !== -1) arr.splice(i, 1);
    tocadas.add(o.name);
  }
  if (!usingDb) tocadas.forEach((name) => writeFile(name, cache[name]));
}

function nextId(prefix, name) {
  const items = readAll(name);
  const n = items.length + 1;
  return `${prefix}-${String(n).padStart(3, "0")}-${Date.now().toString().slice(-5)}`;
}

module.exports = { init, readAll, writeAll, findById, update, insert, remove, flush, transaction, nextId, DATA_DIR, ENTITIES };
