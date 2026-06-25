// Capa PostgreSQL para Control M · Producción.
//
// Estrategia: una tabla por entidad, cada fila = un documento JSONB con su id.
// Esto da tablas reales y consultables (materias, recetas, lotes, ...) sin
// obligar a reescribir las rutas, que siguen trabajando con objetos JS.
//
// Si no hay DATABASE_URL, este módulo queda inactivo y data-store.js usa los
// ficheros JSON locales exactamente como antes.

let Pool;
try {
  ({ Pool } = require("pg"));
} catch (e) {
  Pool = null; // pg no instalado todavía; modo solo-JSON
}

let pool = null;

// Solo permitimos nombres de tabla conocidos (evita cualquier inyección por nombre).
function ident(name) {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`Nombre de entidad inválido: ${name}`);
  return name;
}

// Railway/Heroku exponen DATABASE_URL con SSL; en local normalmente sin SSL.
function sslConfig() {
  const url = process.env.DATABASE_URL || "";
  if (process.env.PGSSL === "disable") return false;
  if (/sslmode=disable/.test(url)) return false;
  if (/localhost|127\.0\.0\.1/.test(url)) return false;
  return { rejectUnauthorized: false };
}

async function connect() {
  if (!process.env.DATABASE_URL || !Pool) return false;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig(),
    max: 5,
  });
  await pool.query("SELECT 1");
  return true;
}

async function ensureTable(name) {
  const t = ident(name);
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${t} (
       seq        BIGSERIAL,
       id         TEXT PRIMARY KEY,
       data       JSONB NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
}

async function count(name) {
  const t = ident(name);
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
  return r.rows[0].n;
}

async function loadAll(name) {
  const t = ident(name);
  const r = await pool.query(`SELECT data FROM ${t} ORDER BY seq ASC`);
  return r.rows.map((row) => row.data);
}

// Reemplaza el contenido completo de la entidad respetando el orden del array.
async function replaceAll(name, items) {
  const t = ident(name);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${t}`);
    for (const item of items) {
      if (!item || item.id == null) continue;
      await client.query(
        `INSERT INTO ${t} (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [String(item.id), item]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

function isActive() {
  return pool != null;
}

module.exports = { connect, ensureTable, count, loadAll, replaceAll, isActive };
