// CONECTOR TPV (Ágora) — recepción de ventas por API, gestionado desde la app.
// ─────────────────────────────────────────────────────────────────────────────
// El TPV (o un pequeño agente en el local) EMPUJA las ventas aquí por HTTPS
// saliente: cero puertos entrantes, cero IP fija. La CLAVE del conector se
// gestiona DENTRO de la app (se genera, se ve enmascarada y se rota desde
// Ajustes → Conector TPV), sin tocar variables de entorno del servidor — que era
// justo lo que impedía configurarlo en Render. Si existe AGORA_CONNECTOR_TOKEN en
// el entorno, también se acepta (compatibilidad con instalaciones previas).
//
// La ingesta reutiliza el MISMO motor de Ágora (agora.importarDocs): idempotente
// por documento (GlobalId o type:Serie:Number), bloquea tickets con productos sin
// vincular (no inventa ventas), descuenta stock y guarda la venta con su neto.
const crypto = require("crypto");
const agora = require("./agora");

const CFG_ID = "tpv_connector";
const CABECERA = "X-Connector-Token"; // cabecera HTTP donde viaja la clave

function leerCfg(store) {
  const c = store.findById("config", CFG_ID);
  return c && typeof c === "object" ? c : null;
}
function guardarCfg(store, patch) {
  if (leerCfg(store)) store.update("config", CFG_ID, patch);
  else store.insert("config", { id: CFG_ID, ...patch });
}

// Clave vigente: la gestionada en la app manda; si no hay, cae a la variable de
// entorno (compatibilidad). Devuelve null si no hay ninguna configurada.
function claveActual(store) {
  const c = leerCfg(store);
  if (c && c.clave) return String(c.clave);
  if (process.env.AGORA_CONNECTOR_TOKEN) return String(process.env.AGORA_CONNECTOR_TOKEN);
  return null;
}
function origenClave(store) {
  const c = leerCfg(store);
  if (c && c.clave) return "app";
  if (process.env.AGORA_CONNECTOR_TOKEN) return "entorno";
  return "ninguno";
}

// Genera una clave fuerte y la guarda. Prefijo legible + 48 hex aleatorios.
function generarClave(store, usuario) {
  const clave = "mdm_" + crypto.randomBytes(24).toString("hex");
  const creada_en = new Date().toISOString();
  guardarCfg(store, { clave, creada_en, creada_por: (usuario && usuario.nombre) || null, revocada_en: null });
  return { clave, creada_en, origen: "app" };
}
function revocar(store) {
  if (leerCfg(store)) store.update("config", CFG_ID, { clave: null, revocada_en: new Date().toISOString() });
}

function mascara(clave) {
  if (!clave) return null;
  const s = String(clave);
  return s.length <= 12 ? s.slice(0, 3) + "…" : s.slice(0, 7) + "…" + s.slice(-4);
}

// Comparación en tiempo constante (evita fugas por timing).
function igualesSeguro(a, b) {
  const x = Buffer.from(String(a == null ? "" : a), "utf8");
  const y = Buffer.from(String(b == null ? "" : b), "utf8");
  if (x.length !== y.length) return false;
  try { return crypto.timingSafeEqual(x, y); } catch (e) { return false; }
}
function verificar(store, got) {
  const clave = claveActual(store);
  if (!clave) return false;
  return igualesSeguro(got, clave);
}
// Lee la clave de la petición (cabecera estándar, alias o query ?token=).
function tokenDePeticion(req) {
  return (
    req.headers["x-connector-token"] ||
    req.headers["x-tpv-token"] ||
    (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "") ||
    (req.query && req.query.token) ||
    ""
  );
}

// Normaliza el cuerpo entrante a una lista de documentos de Ágora. Acepta array,
// { docs|documents|ventas|sales|tickets|data: [...] } o un documento suelto.
function extraerDocs(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  for (const k of ["docs", "documents", "Documents", "ventas", "sales", "tickets", "data"]) {
    if (Array.isArray(body[k])) return body[k];
  }
  if (body.Lines || body.lines || body.GlobalId || body.globalId || body.Serie || body.Number) return [body];
  return [];
}

// Ingesta principal. Devuelve el resumen del motor + procesados_ref (lo que el
// agente debe confirmar a Ágora para que deje de reexportarlo).
function ingerir(store, body, opts) {
  opts = opts || {};
  const docs = extraerDocs(body);
  if (!docs.length) {
    const err = new Error("El cuerpo no contiene documentos de venta (envía un array o { docs:[...] }).");
    err.code = "SIN_DOCS";
    throw err;
  }
  return agora.importarDocs(docs, { usuario: opts.usuario || { nombre: "Conector TPV" } });
}

// Estado del conector para el panel de administración.
function estado(store) {
  const docs = store.readAll("docs_agora") || [];
  const bloqueados = docs.filter((d) => d.status === "blocked");
  const no_vinculados = [...new Set(bloqueados.flatMap((d) => d.no_vinculados || []))];
  const ventas = store.readAll("ventas") || [];
  return {
    configurado: !!claveActual(store),
    origen_clave: origenClave(store),
    clave_mascara: mascara(claveActual(store)),
    ultima_sync: agora.ultimaSync() || null,
    procesados: docs.filter((d) => d.status === "processed").length,
    bloqueados: bloqueados.length,
    no_vinculados,
    ventas_totales: ventas.length,
  };
}

module.exports = {
  CFG_ID, CABECERA,
  claveActual, origenClave, generarClave, revocar, mascara,
  verificar, tokenDePeticion, extraerDocs, ingerir, estado,
};
