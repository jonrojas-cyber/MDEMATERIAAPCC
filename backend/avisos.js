// Avisos automáticos al dispositivo (notificación push), funcionan aunque la app
// esté cerrada y el servidor estuviera dormido (lo despierta el cron externo).
//
//   1) Recordatorio diario a una hora concreta para hacer los pedidos.
//   2) Aviso de lotes a punto de caducar (dentro de N horas).
//
// Canal: Web Push (push.js). La hora se interpreta en la zona horaria del local
// (Europe/Madrid por defecto).

const store = require("./data-store");
const push = require("./push");
const compras = require("./compras");

const TZ = process.env.AVISOS_TZ || "Europe/Madrid";

// ── Configuración (persistida en la entidad "config", doc id "avisos") ──────
function getConfig() {
  const docs = store.readAll("config");
  const c = docs.find((d) => d.id === "avisos") || {};
  return {
    id: "avisos",
    activo: c.activo !== false,
    hora: Number.isInteger(c.hora) ? c.hora : Number(process.env.AVISOS_HORA || 16),
    caducidad_horas: Number(c.caducidad_horas || process.env.AVISOS_CADUCIDAD_HORAS || 48),
    ultimo_envio: c.ultimo_envio || null,
    ultimo_estado: c.ultimo_estado || null,
    ultimo_envio_fecha: c.ultimo_envio_fecha || null,
  };
}

function setConfig(patch) {
  const docs = store.readAll("config");
  const idx = docs.findIndex((d) => d.id === "avisos");
  const base = idx === -1 ? { id: "avisos" } : docs[idx];
  const next = { ...base, ...patch, id: "avisos" };
  if (idx === -1) docs.push(next);
  else docs[idx] = next;
  store.writeAll("config", docs);
  return getConfig();
}

// ── Datos del aviso ─────────────────────────────────────────────────────────
function horasHasta(iso) {
  return (new Date(iso).getTime() - Date.now()) / 3.6e6;
}

// Construye el resumen de "qué pedir" y "qué caduca pronto".
function construirResumen(config) {
  const cfg = config || getConfig();
  const materias = store.readAll("materias");
  const proveedores = store.readAll("proveedores");
  const lotes = store.readAll("lotes");
  const recetas = store.readAll("recetas");
  const provById = {};
  proveedores.forEach((p) => (provById[p.id] = p));
  const recById = {};
  recetas.forEach((r) => (recById[r.id] = r));

  // Compras AGRUPADAS POR PROVEEDOR (mismo cálculo que la pantalla de Pedidos).
  const por_proveedor = compras.sugerencias();
  // Lista plana (compat) por si algún consumidor la usa.
  const pedir = por_proveedor.flatMap((g) =>
    g.items.map((it) => ({ ...it, proveedor: g.proveedor }))
  );

  const limite = cfg.caducidad_horas;
  const caducando = lotes
    .map((l) => ({ l, hr: horasHasta(l.caduca_en) }))
    .filter(
      ({ l, hr }) =>
        l.estado !== "Fuera de servicio" &&
        (l.cantidad_restante == null || l.cantidad_restante > 0) &&
        hr <= limite
    )
    .map(({ l, hr }) => ({
      codigo: l.codigo,
      nombre: recById[l.receta_id] ? recById[l.receta_id].nombre : l.receta_id,
      ubicacion: l.ubicacion || "",
      cantidad_restante: l.cantidad_restante,
      horas_restantes: Math.round(hr * 10) / 10,
      caducado: hr <= 0,
    }))
    .sort((a, b) => a.horas_restantes - b.horas_restantes);

  return { pedir, por_proveedor, caducando, generado_en: new Date().toISOString() };
}

// Cuerpo de la notificación: qué comprar, POR PROVEEDOR, + caducidades.
function notiPayload(resumen) {
  const provs = resumen.por_proveedor || [];
  const c = resumen.caducando.length;
  const partes = [];
  if (provs.length) {
    // "Frutas SL (3), Café XYZ (1)…" — hasta 3 proveedores para que quepa.
    const lista = provs.slice(0, 3).map((g) => `${g.proveedor} (${g.total_items})`).join(", ");
    partes.push(`Compras: ${lista}${provs.length > 3 ? "…" : ""}`);
  }
  if (c) partes.push(`${c} ${c === 1 ? "lote por caducar" : "lotes por caducar"}`);
  const body = partes.length
    ? partes.join(" · ")
    : "Todo en orden: nada que pedir ni caducidades próximas.";
  return { title: "m de materia · Compras y avisos (16:00)", body, url: "/", tag: "avisos-dia" };
}

// Envía el aviso push a los dispositivos. Lanza error con .code si no hay ninguno.
async function enviarAviso(opts = {}) {
  const cfg = getConfig();
  if (!push.disponible()) {
    const e = new Error("No hay ningún dispositivo activado para recibir avisos.");
    e.code = "PUSH_NO_SUBS";
    throw e;
  }
  const resumen = construirResumen(cfg);
  // En el envío programado no molestamos si no hay nada; la prueba siempre va.
  if (!opts.force && !resumen.pedir.length && !resumen.caducando.length) {
    setConfig({ ultimo_envio: new Date().toISOString(), ultimo_estado: "sin_novedades" });
    return { enviado: false, motivo: "sin_novedades", resumen };
  }
  const r = await push.enviarATodos(notiPayload(resumen));
  const patch = { ultimo_envio: new Date().toISOString(), ultimo_estado: "enviado" };
  if (opts.fecha) patch.ultimo_envio_fecha = opts.fecha;
  setConfig(patch);
  return { enviado: true, push: r, resumen };
}

// ── Cron ────────────────────────────────────────────────────────────────────
// Hora y fecha actuales en la zona del local (para no depender del TZ del server).
function ahoraLocal() {
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  return { hora: Number(get("hour")), fecha: `${get("year")}-${get("month")}-${get("day")}` };
}

// Se llama periódicamente (cron interno y disparador externo de GitHub Actions);
// envía el aviso una sola vez al llegar la hora. Devuelve un estado para reportar.
async function cronTick() {
  const cfg = getConfig();
  if (!cfg.activo) return { ok: true, accion: "omitido", motivo: "desactivado" };
  if (!push.disponible()) return { ok: true, accion: "omitido", motivo: "sin_dispositivos" };
  const { hora, fecha } = ahoraLocal();
  if (hora !== cfg.hora) return { ok: true, accion: "omitido", motivo: `fuera_de_hora (${hora}!=${cfg.hora})` };
  if (cfg.ultimo_envio_fecha === fecha) return { ok: true, accion: "omitido", motivo: "ya_enviado_hoy" };
  // Marcamos la fecha antes de enviar para no reintentar en el mismo minuto si tarda.
  setConfig({ ultimo_envio_fecha: fecha });
  try {
    const r = await enviarAviso({ force: true, fecha });
    console.log(`Avisos: aviso diario ${r.enviado ? "enviado" : "(sin novedades)"} a ${push.listSubs().length} dispositivo(s)`);
    return { ok: true, accion: r.enviado ? "enviado" : "sin_novedades", push: r.push };
  } catch (e) {
    console.error("Avisos cron error:", e.message);
    return { ok: false, accion: "error", error: e.message };
  }
}

module.exports = { getConfig, setConfig, construirResumen, enviarAviso, cronTick };
