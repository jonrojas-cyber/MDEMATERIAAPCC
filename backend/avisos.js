// Avisos automáticos por email (funcionan aunque la app esté cerrada: los envía
// el servidor en un cron, no el navegador).
//
//   1) Recordatorio diario a una hora concreta para hacer los pedidos.
//   2) Aviso de lotes a punto de caducar (dentro de N horas).
//
// Canal: email vía Resend (mailer.js). Requiere RESEND_API_KEY y un email de
// destino (configurable desde la app o con AVISOS_TO). La hora se interpreta en
// la zona horaria del local (Europe/Madrid por defecto).

const store = require("./data-store");
const mailer = require("./mailer");

const TZ = process.env.AVISOS_TZ || "Europe/Madrid";

// ── Configuración (persistida en la entidad "config", doc id "avisos") ──────
function getConfig() {
  const docs = store.readAll("config");
  const c = docs.find((d) => d.id === "avisos") || {};
  return {
    id: "avisos",
    activo: c.activo !== false,
    email: (c.email || process.env.AVISOS_TO || "").trim(),
    hora: Number.isInteger(c.hora) ? c.hora : Number(process.env.AVISOS_HORA || 9),
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

  const pedir = materias
    .filter((m) => m.disponibilidad_actual <= m.stock_minimo)
    .map((m) => {
      const p = provById[m.proveedor_id];
      const ideal = m.stock_ideal != null ? m.stock_ideal : m.stock_minimo;
      return {
        nombre: m.nombre,
        disponibilidad_actual: m.disponibilidad_actual,
        unidad: m.unidad,
        cantidad_sugerida: Math.round((ideal - m.disponibilidad_actual) * 100) / 100,
        proveedor: p ? p.nombre : "Sin proveedor asignado",
      };
    })
    .sort((a, b) => a.proveedor.localeCompare(b.proveedor) || a.nombre.localeCompare(b.nombre));

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

  return { pedir, caducando, generado_en: new Date().toISOString() };
}

// ── Email ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function asuntoDe(resumen) {
  const n = resumen.pedir.length;
  const cad = resumen.caducando.length;
  const partes = [];
  if (n) partes.push(`${n} ${n === 1 ? "materia que pedir" : "materias que pedir"}`);
  if (cad) partes.push(`${cad} ${cad === 1 ? "lote por caducar" : "lotes por caducar"}`);
  const cuerpo = partes.length ? partes.join(" · ") : "todo en orden";
  return `m de materia · Avisos del día — ${cuerpo}`;
}

function htmlResumen(resumen) {
  const horaLocal = new Date(resumen.generado_en).toLocaleString("es-ES", { timeZone: TZ });

  const filasPedir = resumen.pedir
    .map(
      (m) => `<tr>
        <td style="padding:7px 6px;border-bottom:1px solid #eee;">${esc(m.nombre)}</td>
        <td style="padding:7px 6px;border-bottom:1px solid #eee;">${esc(m.proveedor)}</td>
        <td style="padding:7px 6px;border-bottom:1px solid #eee;text-align:right;">${m.disponibilidad_actual} ${esc(m.unidad)}</td>
        <td style="padding:7px 6px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${m.cantidad_sugerida} ${esc(m.unidad)}</td>
      </tr>`
    )
    .join("");

  const filasCad = resumen.caducando
    .map((l) => {
      const cuando = l.caducado
        ? `<span style="color:#b3261e;font-weight:bold;">CADUCADO</span>`
        : `en ${l.horas_restantes} h`;
      return `<tr>
        <td style="padding:7px 6px;border-bottom:1px solid #eee;">${esc(l.nombre)}</td>
        <td style="padding:7px 6px;border-bottom:1px solid #eee;">${esc(l.codigo)}</td>
        <td style="padding:7px 6px;border-bottom:1px solid #eee;">${esc(l.ubicacion)}</td>
        <td style="padding:7px 6px;border-bottom:1px solid #eee;text-align:right;">${cuando}</td>
      </tr>`;
    })
    .join("");

  const bloquePedir = resumen.pedir.length
    ? `<h3 style="margin:22px 0 6px;color:#3E4534;">Materias que conviene pedir</h3>
       <table style="width:100%;border-collapse:collapse;font-size:13px;">
         <thead><tr>
           <th style="text-align:left;padding:6px;color:#5C6145;">Materia</th>
           <th style="text-align:left;padding:6px;color:#5C6145;">Proveedor</th>
           <th style="text-align:right;padding:6px;color:#5C6145;">Quedan</th>
           <th style="text-align:right;padding:6px;color:#5C6145;">Pedir</th>
         </tr></thead><tbody>${filasPedir}</tbody></table>`
    : `<p style="font-size:14px;color:#2A332B;">✔ No hay materias por debajo del stock mínimo. Nada urgente que pedir.</p>`;

  const bloqueCad = resumen.caducando.length
    ? `<h3 style="margin:22px 0 6px;color:#3E4534;">Lotes a punto de caducar</h3>
       <table style="width:100%;border-collapse:collapse;font-size:13px;">
         <thead><tr>
           <th style="text-align:left;padding:6px;color:#5C6145;">Producto</th>
           <th style="text-align:left;padding:6px;color:#5C6145;">Lote</th>
           <th style="text-align:left;padding:6px;color:#5C6145;">Ubicación</th>
           <th style="text-align:right;padding:6px;color:#5C6145;">Caduca</th>
         </tr></thead><tbody>${filasCad}</tbody></table>`
    : `<p style="font-size:14px;color:#2A332B;">✔ Ningún lote caduca en el plazo vigilado.</p>`;

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#2A332B;max-width:660px;margin:0 auto;">
    <div style="border-bottom:3px solid #3E4534;padding-bottom:10px;margin-bottom:8px;">
      <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#5C6145;">m de materia · Control M</div>
      <h2 style="margin:6px 0 0;font-weight:normal;">Avisos del día</h2>
    </div>
    <p style="font-size:12px;color:#82857A;margin:0 0 4px;">${esc(horaLocal)}</p>
    ${bloquePedir}
    ${bloqueCad}
    <p style="font-size:11px;color:#82857A;margin-top:22px;border-top:1px solid #eee;padding-top:10px;">
      Aviso automático de Control M. Puedes cambiar la hora, el email y el plazo de caducidad
      desde Gestión → Avisos en la app.
    </p>
  </div>`;
}

// Envía el resumen por email. Lanza error con .code si falta configuración.
async function enviarResumen(opts = {}) {
  const cfg = getConfig();
  if (!cfg.email) {
    const e = new Error("No hay email de destino. Configúralo en Gestión → Avisos.");
    e.code = "AVISOS_NO_EMAIL";
    throw e;
  }
  if (!mailer.disponible()) {
    const e = new Error("Email no configurado en el servidor (RESEND_API_KEY).");
    e.code = "EMAIL_NO_CONFIG";
    throw e;
  }
  const resumen = construirResumen(cfg);
  // En el envío programado no molestamos si no hay nada; el envío de prueba siempre va.
  if (!opts.force && !resumen.pedir.length && !resumen.caducando.length) {
    setConfig({ ultimo_envio: new Date().toISOString(), ultimo_estado: "sin_novedades" });
    return { enviado: false, motivo: "sin_novedades", resumen };
  }
  await mailer.enviarEmail({ to: cfg.email, subject: asuntoDe(resumen), html: htmlResumen(resumen) });
  const patch = { ultimo_envio: new Date().toISOString(), ultimo_estado: "enviado" };
  if (opts.fecha) patch.ultimo_envio_fecha = opts.fecha;
  setConfig(patch);
  return { enviado: true, resumen };
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

// Se llama periódicamente; envía el resumen una sola vez al llegar la hora.
async function cronTick() {
  const cfg = getConfig();
  if (!cfg.activo || !cfg.email || !mailer.disponible()) return;
  const { hora, fecha } = ahoraLocal();
  if (hora !== cfg.hora) return;
  if (cfg.ultimo_envio_fecha === fecha) return; // ya enviado hoy
  // Marcamos la fecha antes de enviar para no reintentar en el mismo minuto si tarda.
  setConfig({ ultimo_envio_fecha: fecha });
  try {
    const r = await enviarResumen({ force: true, fecha });
    console.log(`Avisos: resumen diario ${r.enviado ? "enviado" : "(sin novedades)"} a ${cfg.email}`);
  } catch (e) {
    console.error("Avisos cron error:", e.message);
  }
}

module.exports = { getConfig, setConfig, construirResumen, enviarResumen, htmlResumen, cronTick };
