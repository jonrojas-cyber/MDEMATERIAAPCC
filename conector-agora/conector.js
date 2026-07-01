// ────────────────────────────────────────────────────────────────────────────
// Conector Ágora → Control M   ·   m de materia
// ────────────────────────────────────────────────────────────────────────────
// Este pequeño programa vive en el PC del local (el mismo donde corre Ágora,
// o cualquiera de la misma red). Cada X minutos:
//
//   1. LEE las ventas nuevas de Ágora  (GET http://SERVIDOR:8984/api/export/)
//   2. Las EMPUJA a Control M en la nube (POST https://TU-APP/agora/ingest)
//   3. CONFIRMA a Ágora los documentos ya procesados, para que no se
//      reexporten (POST http://SERVIDOR:8984/api/doc/processed)
//
// Todo el tráfico hacia la nube es SALIENTE por HTTPS: no hace falta abrir
// puertos en el router ni tener IP fija. El token del conector y el Api-Token
// de Ágora viven SOLO aquí (en config.json), nunca en el navegador.
//
// No necesita instalar nada: usa solo lo que trae Node.js.
// Arrancar:   node conector.js
// (Ver README.txt para dejarlo corriendo solo al encender el PC.)
// ────────────────────────────────────────────────────────────────────────────

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

// ── Configuración ───────────────────────────────────────────────────────────
// Se lee de config.json (al lado de este archivo). Las variables de entorno,
// si existen, mandan sobre el fichero (útil para pruebas).
function cargarConfig() {
  let cfg = {};
  const ruta = path.join(__dirname, "config.json");
  if (fs.existsSync(ruta)) {
    try { cfg = JSON.parse(fs.readFileSync(ruta, "utf-8")); }
    catch (e) { salir("config.json no es un JSON válido: " + e.message); }
  }
  const c = {
    // Ágora (en el local):
    agora_base:    process.env.AGORA_BASE_URL    || cfg.agora_base    || "http://localhost:8984",
    agora_token:   process.env.AGORA_API_TOKEN   || cfg.agora_token   || "",
    workplaces:    process.env.AGORA_WORKPLACES  || cfg.workplaces     || "", // "1,2" opcional
    filtro:        cfg.filtro || "Invoices,DeliveryNotes,SalesOrders",
    // Control M (en la nube):
    controlm_base:  process.env.CONTROLM_BASE_URL   || cfg.controlm_base   || "",
    conector_token: process.env.AGORA_CONNECTOR_TOKEN || cfg.conector_token || "",
    // Cada cuántos minutos sincroniza:
    cada_min:      Number(process.env.CONECTOR_MIN || cfg.cada_min || 15),
    // Confirmar a Ágora los procesados (recomendado true en producción):
    confirmar_agora: cfg.confirmar_agora !== false,
  };
  if (!c.controlm_base)  salir("Falta 'controlm_base' (la URL de Control M en la nube) en config.json");
  if (!c.conector_token) salir("Falta 'conector_token' (el mismo que AGORA_CONNECTOR_TOKEN en Control M) en config.json");
  if (!c.agora_token)    log("⚠  Sin 'agora_token': no podré leer de Ágora. Rellénalo en config.json.");
  return c;
}

// ── Utilidades HTTP (sin librerías externas) ────────────────────────────────
function pedir(urlStr, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === "https:" ? https : http;
    const datos = body != null ? Buffer.from(typeof body === "string" ? body : JSON.stringify(body)) : null;
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      headers: { Accept: "application/json", ...headers },
      timeout: 30000,
    };
    if (datos) {
      opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
      opts.headers["Content-Length"] = datos.length;
    }
    const req = lib.request(opts, (res) => {
      let buf = "";
      res.on("data", (c) => (buf += c));
      res.on("end", () => {
        let json = null;
        try { json = buf ? JSON.parse(buf) : null; } catch (_) {}
        resolve({ status: res.statusCode, body: json, texto: buf });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (datos) req.write(datos);
    req.end();
  });
}

function log(...a) {
  console.log(new Date().toISOString().replace("T", " ").slice(0, 19), "·", ...a);
}
function salir(msg) { console.error("ERROR: " + msg); process.exit(1); }

// Extrae un mensaje ÚTIL de cualquier error (incluye AggregateError, que suele
// venir con mensaje vacío y el detalle real dentro de .errors — típico al no
// poder conectar con localhost o con un dominio con IPv4+IPv6).
function descErr(e) {
  if (!e) return "error desconocido";
  const partes = [];
  if (e.code) partes.push(e.code);
  if (e.message) partes.push(e.message);
  if (Array.isArray(e.errors)) {
    for (const sub of e.errors) {
      const m = [sub && sub.code, sub && sub.message].filter(Boolean).join(" ");
      if (m) partes.push(m);
    }
  }
  let txt = partes.filter(Boolean).join(" · ") || String(e);
  if (/ECONNREFUSED/.test(txt)) txt += "  → Ágora o Control M no aceptó la conexión (¿Ágora abierto? ¿puerto 8984 correcto?)";
  if (/ENOTFOUND|EAI_AGAIN/.test(txt)) txt += "  → no se pudo resolver la dirección (revisa 'controlm_base' o la conexión a internet)";
  return txt;
}

// Cuenta cuántos documentos hay en la respuesta de Ágora (para diagnóstico).
function contarDocs(body) {
  if (!body || typeof body !== "object") return 0;
  if (Array.isArray(body)) return body.length;
  if (Array.isArray(body.documents)) return body.documents.length;
  let n = 0;
  for (const k of Object.keys(body)) if (Array.isArray(body[k])) n += body[k].length;
  return n;
}

// Modo diagnóstico: `node conector.js --todo` pide TAMBIÉN los ya procesados y
// guarda la respuesta cruda de Ágora en respuesta-agora.json (para soporte).
const DIAG = process.argv.includes("--todo") || process.argv.includes("--diag");

// ── 1) Leer el export de Ágora ──────────────────────────────────────────────
async function leerDeAgora(c) {
  const p = new URLSearchParams();
  p.set("filter", c.filtro);
  p.set("include-processed", DIAG ? "true" : "false"); // --todo trae también los ya confirmados
  // Día de negocio: por defecto HOY. Se puede fijar otro en config (business_day)
  // o desactivar poniendo business_day: false.
  if (c.business_day !== false) {
    const hoy = new Date().toISOString().slice(0, 10); // aaaa-mm-dd
    p.set("business-day", c.business_day || hoy);
  }
  if (c.workplaces) p.set("workplaces", c.workplaces);
  const url = `${c.agora_base.replace(/\/$/, "")}/api/export/?${p.toString()}`;
  log("→ Pido a Ágora: " + url);
  const r = await pedir(url, { headers: { "Api-Token": c.agora_token } });
  if (r.status === 401 || r.status === 403) salir("Ágora rechazó el Api-Token (401/403). Revisa 'agora_token'.");
  if (r.status >= 400) throw new Error(`Ágora respondió ${r.status}: ${r.texto.slice(0, 200)}`);

  // Guarda la respuesta cruda para poder inspeccionar la estructura real.
  try {
    fs.writeFileSync(path.join(__dirname, "respuesta-agora.json"), r.texto || "");
    log("  (guardada la respuesta en respuesta-agora.json)");
  } catch (_) { /* si no se puede escribir, seguimos */ }

  // Diagnóstico: qué contestó Ágora exactamente.
  const claves = r.body && typeof r.body === "object" && !Array.isArray(r.body) ? Object.keys(r.body) : [];
  log(`← Ágora HTTP ${r.status} · ${r.texto.length} caracteres · ${contarDocs(r.body)} documento(s)` +
      (claves.length ? ` · claves: ${claves.join(", ")}` : ""));
  if (r.texto && r.texto.length <= 800) log("  cuerpo Ágora: " + (r.texto || "(vacío)"));

  // Si no vino ningún documento, miramos los tickets ABIERTOS solo para
  // diagnosticar (no descuentan stock): así sabemos si la venta está en Ágora
  // pero aún sin cerrar en documento.
  if (contarDocs(r.body) === 0) {
    try {
      const rt = await pedir(`${c.agora_base.replace(/\/$/, "")}/api/export/tickets/`, { headers: { "Api-Token": c.agora_token } });
      log(`  (diagnóstico) tickets abiertos: HTTP ${rt.status} · ${contarDocs(rt.body)} ticket(s)` +
          (rt.texto && rt.texto.length <= 500 ? " · " + rt.texto : ""));
    } catch (_) { /* diagnóstico, ignorar */ }
  }
  return r.body || {};
}

// ── 2) Empujar a Control M ──────────────────────────────────────────────────
async function empujarAControlM(c, payload) {
  const url = `${c.controlm_base.replace(/\/$/, "")}/agora/ingest`;
  const r = await pedir(url, {
    method: "POST",
    headers: { "X-Connector-Token": c.conector_token },
    body: payload,
  });
  if (r.status === 401) salir("Control M rechazó el token del conector (401). 'conector_token' debe ser igual a AGORA_CONNECTOR_TOKEN en Control M.");
  if (r.status === 503) throw new Error("Control M aún no tiene AGORA_CONNECTOR_TOKEN configurado (503).");
  if (r.status >= 400) throw new Error(`Control M respondió ${r.status}: ${r.texto.slice(0, 200)}`);
  return r.body || {};
}

// ── 3) Confirmar a Ágora los procesados ─────────────────────────────────────
// Control M devuelve procesados_ref: [{Serie, Number}]. Se lo devolvemos a
// Ágora para que marque esos documentos como procesados y no los reexporte.
async function confirmarAAgora(c, refs) {
  const validos = (refs || []).filter((r) => r && r.Serie != null && r.Number != null);
  if (!validos.length) return 0;
  const url = `${c.agora_base.replace(/\/$/, "")}/api/doc/processed`;
  const r = await pedir(url, {
    method: "POST",
    headers: { "Api-Token": c.agora_token },
    body: validos.map((x) => ({ Serie: String(x.Serie), Number: Number(x.Number) })),
  });
  if (r.status >= 400) {
    log(`⚠  No se pudo confirmar a Ágora (${r.status}). Se reintentará en la próxima vuelta.`);
    return 0;
  }
  return validos.length;
}

// ── Una vuelta completa ─────────────────────────────────────────────────────
async function sincronizar(c) {
  let datos;
  try {
    datos = await leerDeAgora(c);
  } catch (e) {
    throw new Error("[1/3 leyendo de Ágora en " + c.agora_base + "] " + descErr(e));
  }
  let r;
  try {
    r = await empujarAControlM(c, { documents: datos });
  } catch (e) {
    throw new Error("[2/3 enviando a Control M en " + c.controlm_base + "] " + descErr(e));
  }
  const conf = c.confirmar_agora ? await confirmarAAgora(c, r.procesados_ref) : 0;
  const partes = [
    `${r.procesados ?? 0} procesado(s)`,
    `${r.bloqueados ?? 0} bloqueado(s)`,
    `${r.omitidos_ya_procesados ?? 0} ya estaban`,
    `${conf} confirmado(s) a Ágora`,
  ];
  log("Sync:", partes.join(" · "));
  if (r.productos_no_vinculados && r.productos_no_vinculados.length) {
    log("   ↳ Productos SIN vincular (bloquean su ticket):", r.productos_no_vinculados.join(", "));
  }
  return r;
}

// ── Bucle principal ─────────────────────────────────────────────────────────
async function main() {
  const c = cargarConfig();
  log(`Conector Ágora → Control M iniciado. Cada ${c.cada_min} min.`);
  log(`  Ágora:    ${c.agora_base}`);
  log(`  Control M: ${c.controlm_base}`);
  const vuelta = async () => {
    try { await sincronizar(c); }
    catch (e) { log("Fallo en la sincronización (se reintenta): " + (e.message || descErr(e))); }
  };
  await vuelta(); // primera pasada al arrancar
  setInterval(vuelta, Math.max(1, c.cada_min) * 60 * 1000);
}

main();
