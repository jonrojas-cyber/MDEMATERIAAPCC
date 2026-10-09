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

const DOCS_KEYS = ["docs", "documents", "Documents", "ventas", "sales", "tickets", "data"];
// Ágora NO devuelve un array: agrupa los documentos POR TIPO →
//   { "Invoices":[...], "DeliveryNotes":[...], "SalesOrders":[...] }.
// Además el agente envuelve esa respuesta en `documents` → { documents: { Invoices:[...] } }
// (doble envoltura). Hay que aplanar ambas cosas o no se procesa nada.
const TIPO_KEYS = ["Invoices", "DeliveryNotes", "SalesOrders", "PurchaseOrders", "IncomingDeliveryNotes", "PurchaseInvoices"];

// Normaliza el cuerpo entrante a una lista PLANA de documentos. Admite:
//   · array de documentos;
//   · { docs|documents|...: array } y también { documents: { Invoices:[...] } }
//     (doble envoltura del agente → se desenvuelve recursivamente);
//   · { Invoices:[...], DeliveryNotes:[...] } (formato real de Ágora), etiquetando
//     cada doc con su __type para la clave idempotente;
//   · un documento suelto.
function extraerDocs(body) {
  if (!body) return [];
  if (Array.isArray(body)) return body;
  if (typeof body !== "object") return [];
  for (const k of DOCS_KEYS) {
    const v = body[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") { const inner = extraerDocs(v); if (inner.length) return inner; }
  }
  let out = [];
  for (const tipo of TIPO_KEYS) {
    if (Array.isArray(body[tipo])) out = out.concat(body[tipo].map((d) => ({ ...d, __type: tipo.replace(/s$/, "") })));
  }
  if (out.length) return out;
  if (body.Lines || body.lines || body.GlobalId || body.globalId || body.Serie || body.Number) return [body];
  return [];
}

// ¿El cuerpo trae un "sitio" para documentos (aunque venga vacío)? Distingue un
// ciclo del agente SIN novedades (latido legítimo) de un cuerpo malformado.
function tieneCampoDocs(body) {
  if (Array.isArray(body)) return true;
  if (!body || typeof body !== "object") return false;
  if (DOCS_KEYS.some((k) => k in body)) return true;
  if (TIPO_KEYS.some((k) => k in body)) return true;
  return !!(body.Lines || body.lines || body.GlobalId || body.globalId || body.Serie || body.Number);
}

// Registra que el agente ha contactado (latido). Se llama en CADA ingesta
// autenticada, haya o no documentos nuevos, para poder detectar una caída real
// (el agente envía cada ~15 min aunque no haya ventas).
function marcarContacto(store) {
  guardarCfg(store, { ultimo_contacto: new Date().toISOString() });
}

// Ingesta principal. Devuelve el resumen del motor + procesados_ref (lo que el
// agente debe confirmar a Ágora para que deje de reexportarlo).
function ingerir(store, body, opts) {
  opts = opts || {};
  const docs = extraerDocs(body);
  if (!docs.length) {
    // Ciclo sin novedades (el agente envía aunque no haya ventas): es un LATIDO
    // válido, no un error. Así se distingue "agente vivo sin ventas" de "agente
    // caído". El contacto se registra en la ruta (marcarContacto).
    if (tieneCampoDocs(body)) {
      return { procesados: 0, bloqueados: 0, omitidos_ya_procesados: 0, unidades_vendidas: 0, importe_total: 0, productos_no_vinculados: [], procesados_ref: [], heartbeat: true };
    }
    const err = new Error("El cuerpo no contiene documentos de venta (envía un array o { docs:[...] }).");
    err.code = "SIN_DOCS";
    throw err;
  }
  return agora.importarDocs(docs, { usuario: opts.usuario || { nombre: "Conector TPV" } });
}

// Minutos (entero) transcurridos desde una fecha ISO, o null si no hay fecha.
function haceMinDesde(iso, now) {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? Math.round((now - t) / 60000) : null;
}

// Umbral de "caído": el agente envía cada ~15 min, así que 90 min = 6 ciclos
// perdidos ⇒ el PC o el agente está parado (no es "no hay ventas ahora").
const UMBRAL_CAIDO_MIN = 90;

// Última sincronización registrada en ESTE store (equivale a agora.ultimaSync() en
// producción, pero testeable con un store inyectado).
function ultimaSyncDe(store) {
  const a = store.readAll("sincronizaciones") || [];
  return a.length ? a[a.length - 1] : null;
}

// Salud del conector a partir de la última SEÑAL de vida (latido del agente o, si
// aún no hay latidos, la última venta recibida). Expuesto para el panel y la alarma.
function saludConector(store, now = Date.now()) {
  const cfg = leerCfg(store) || {};
  const sync = ultimaSyncDe(store);
  const syncMin = haceMinDesde(sync && sync.cuando, now);
  const contactoMin = haceMinDesde(cfg.ultimo_contacto, now);
  const refMin = contactoMin != null ? contactoMin : syncMin;
  let salud;
  if (!claveActual(store)) salud = "sin_clave";
  else if (refMin == null) salud = "sin_contacto";
  else if (refMin <= UMBRAL_CAIDO_MIN) salud = "ok";
  else salud = "caido";
  return { salud, ultimo_contacto: cfg.ultimo_contacto || null, ultimo_contacto_hace_min: contactoMin, ultima_sync_hace_min: syncMin, umbral_min: UMBRAL_CAIDO_MIN };
}

// Estado del conector para el panel de administración.
function estado(store) {
  const docs = store.readAll("docs_agora") || [];
  const bloqueados = docs.filter((d) => d.status === "blocked");
  const no_vinculados = [...new Set(bloqueados.flatMap((d) => d.no_vinculados || []))];
  const ventas = store.readAll("ventas") || [];
  const s = saludConector(store);
  return {
    configurado: !!claveActual(store),
    origen_clave: origenClave(store),
    clave_mascara: mascara(claveActual(store)),
    ultima_sync: ultimaSyncDe(store),
    ultima_sync_hace_min: s.ultima_sync_hace_min,
    ultimo_contacto: s.ultimo_contacto,
    ultimo_contacto_hace_min: s.ultimo_contacto_hace_min,
    salud: s.salud,
    umbral_caido_min: s.umbral_min,
    procesados: docs.filter((d) => d.status === "processed").length,
    bloqueados: bloqueados.length,
    no_vinculados,
    ventas_totales: ventas.length,
  };
}

module.exports = {
  CFG_ID, CABECERA,
  claveActual, origenClave, generarClave, revocar, mascara,
  verificar, tokenDePeticion, extraerDocs, tieneCampoDocs, marcarContacto,
  ingerir, estado, saludConector,
};
