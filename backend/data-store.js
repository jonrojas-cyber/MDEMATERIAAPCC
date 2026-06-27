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

function persist(name) {
  if (usingDb) {
    db.replaceAll(name, cache[name]).catch((e) =>
      console.error(`Error guardando '${name}' en PostgreSQL:`, e.message)
    );
  } else {
    writeFile(name, cache[name]);
  }
}

function readAll(name) {
  if (!cache[name]) cache[name] = readFile(name); // fallback defensivo
  return cache[name];
}

function writeAll(name, data) {
  cache[name] = data;
  persist(name);
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
  writeAll(name, items);
  return items[idx];
}

function insert(name, item) {
  const items = readAll(name);
  items.push(item);
  writeAll(name, items);
  return item;
}

function nextId(prefix, name) {
  const items = readAll(name);
  const n = items.length + 1;
  return `${prefix}-${String(n).padStart(3, "0")}-${Date.now().toString().slice(-5)}`;
}

module.exports = { init, readAll, writeAll, findById, update, insert, nextId, DATA_DIR, ENTITIES };
