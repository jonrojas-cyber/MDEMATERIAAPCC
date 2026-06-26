// Notificaciones de Control M · Producción.
//
// Dos avisos, pensados para "no pensar, ejecutar":
//   1) Productos (lotes) a punto de caducar  → para usarlos o darlos de baja.
//   2) Materias por debajo del mínimo        → recordatorio de hacer pedidos.
//
// Salidas:
//   · En la app: un resumen vivo (campana) que se consulta cuando se quiera.
//   · Por email: un aviso diario A UNA HORA CONCRETA (configurable) que junta
//     lo que caduca y lo que hay que pedir. Se envía vía Resend (mailer.js).
//
// La configuración (email, hora, ventana de caducidad…) vive en la entidad
// "configuracion" del almacén, así se edita desde la propia app y se conserva.

const store = require("./data-store");
const mailer = require("./mailer");

const CONFIG_ID = "notificaciones";

// Valores por defecto. Se pueden sobreescribir por entorno (útil al desplegar)
// y, ya en marcha, desde la pantalla de Avisos de la app.
const DEFAULTS = {
  id: CONFIG_ID,
  alerta_email: process.env.ALERTA_EMAIL || "",
  alerta_hora: process.env.ALERTA_HORA || "09:00", // HH:MM hora de Málaga
  horas_aviso_caducidad: 24, // avisa de lo que caduca en las próximas 24 h
  avisar_caducidad: true,
  avisar_pedidos: true,
  activo: true,
  ultimo_envio_dia: null, // "YYYY-MM-DD" (Europe/Madrid) del último envío
  ultimo_envio: null, // ISO del último envío
};

const ZONA = "Europe/Madrid";

function obtenerConfig() {
  const fila = store.findById("configuracion", CONFIG_ID);
  return { ...DEFAULTS, ...(fila || {}) };
}

// Guarda los campos editables (saneados). Lo que toca el usuario desde la app.
function guardarConfig(patch = {}) {
  const limpio = {};
  if (patch.alerta_email !== undefined) limpio.alerta_email = String(patch.alerta_email || "").trim();
  if (patch.alerta_hora !== undefined && /^\d{2}:\d{2}$/.test(String(patch.alerta_hora))) {
    limpio.alerta_hora = String(patch.alerta_hora);
  }
  if (patch.horas_aviso_caducidad !== undefined) {
    const h = Number(patch.horas_aviso_caducidad);
    if (Number.isFinite(h) && h > 0) limpio.horas_aviso_caducidad = Math.round(h);
  }
  if (patch.avisar_caducidad !== undefined) limpio.avisar_caducidad = !!patch.avisar_caducidad;
  if (patch.avisar_pedidos !== undefined) limpio.avisar_pedidos = !!patch.avisar_pedidos;
  if (patch.activo !== undefined) limpio.activo = !!patch.activo;
  return setInterno(limpio);
}

// Setter interno: crea la fila si no existe (p.ej. al marcar el último envío).
function setInterno(patch) {
  const existe = store.findById("configuracion", CONFIG_ID);
  if (existe) store.update("configuracion", CONFIG_ID, patch);
  else store.insert("configuracion", { ...DEFAULTS, ...patch, id: CONFIG_ID });
  return obtenerConfig();
}

function horasRestantes(lote) {
  return (new Date(lote.caduca_en).getTime() - Date.now()) / (1000 * 60 * 60);
}

// Lotes (productos) que caducan dentro de `horas` o ya caducados, ordenados por
// urgencia. Ignora los que ya están fuera de servicio o sin existencias.
function lotesPorCaducar(horas) {
  const recetas = store.readAll("recetas");
  return store
    .readAll("lotes")
    .filter((l) => l.estado !== "Fuera de servicio" && l.cantidad_restante > 0)
    .map((l) => {
      const receta = recetas.find((r) => r.id === l.receta_id);
      const hr = horasRestantes(l);
      return {
        id: l.id,
        codigo: l.codigo,
        nombre: receta ? receta.nombre : l.receta_id,
        ubicacion: l.ubicacion,
        cantidad_restante: l.cantidad_restante,
        horas_restantes: Math.round(hr * 10) / 10,
        caducado: hr <= 0,
      };
    })
    .filter((l) => l.caducado || l.horas_restantes <= horas)
    .sort((a, b) => a.horas_restantes - b.horas_restantes);
}

// Materias en o por debajo del mínimo: hay que pedirlas. Misma lógica que el
// bloque "PEDIR" del dashboard de inicio.
function materiasParaPedir() {
  const materias = store.readAll("materias");
  const proveedores = store.readAll("proveedores");
  return materias
    .filter((m) => m.disponibilidad_actual <= m.stock_minimo)
    .map((m) => {
      const prov = proveedores.find((p) => p.id === m.proveedor_id);
      return {
        materia_id: m.id,
        nombre: m.nombre,
        disponibilidad_actual: m.disponibilidad_actual,
        unidad: m.unidad,
        cantidad_sugerida: Math.round((m.stock_ideal - m.disponibilidad_actual) * 100) / 100,
        proveedor: prov ? prov.nombre : "Sin proveedor asignado",
        whatsapp: prov && prov.whatsapp ? prov.whatsapp.replace(/[^0-9+]/g, "") : null,
      };
    })
    .sort((a, b) => a.disponibilidad_actual - b.disponibilidad_actual);
}

// Resumen vivo para la campana de la app.
function resumen() {
  const cfg = obtenerConfig();
  const porCaducar = cfg.avisar_caducidad ? lotesPorCaducar(cfg.horas_aviso_caducidad) : [];
  const paraPedir = cfg.avisar_pedidos ? materiasParaPedir() : [];
  return {
    generado_en: new Date().toISOString(),
    por_caducar: porCaducar,
    para_pedir: paraPedir,
    total: porCaducar.length + paraPedir.length,
    config: cfg,
    email_listo: mailer.disponible() && !!cfg.alerta_email,
  };
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function venceTexto(l) {
  if (l.caducado) return "CADUCADO";
  if (l.horas_restantes < 1) return "caduca en <1 h";
  return `caduca en ${l.horas_restantes} h`;
}

// HTML del email de aviso diario (estilos en línea, como el justificante).
function htmlAlerta(r, cfg) {
  const filasCaducar = r.por_caducar
    .map(
      (l) => `<tr>
        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(l.nombre)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(l.codigo)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(l.ubicacion || "—")}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;color:${l.caducado ? "#b3261e" : "#9a6700"};font-weight:bold;">${venceTexto(l)}</td>
      </tr>`
    )
    .join("");
  const filasPedir = r.para_pedir
    .map(
      (m) => `<tr>
        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(m.nombre)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;">${esc(m.proveedor)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">${m.disponibilidad_actual} ${esc(m.unidad)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;">${m.cantidad_sugerida} ${esc(m.unidad)}</td>
      </tr>`
    )
    .join("");

  const seccionCaducar = cfg.avisar_caducidad
    ? `<h3 style="margin:22px 0 6px;color:#5C6145;">⏰ Productos a punto de caducar (${r.por_caducar.length})</h3>` +
      (r.por_caducar.length
        ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr>
              <th style="text-align:left;padding:6px;color:#5C6145;">Producto</th>
              <th style="text-align:left;padding:6px;color:#5C6145;">Lote</th>
              <th style="text-align:left;padding:6px;color:#5C6145;">Ubicación</th>
              <th style="text-align:right;padding:6px;color:#5C6145;">Vence</th>
            </tr></thead><tbody>${filasCaducar}</tbody></table>`
        : `<p style="font-size:13px;color:#5C6145;">✓ Nada caduca en las próximas ${cfg.horas_aviso_caducidad} h.</p>`)
    : "";

  const seccionPedir = cfg.avisar_pedidos
    ? `<h3 style="margin:22px 0 6px;color:#5C6145;">🛒 Materias por pedir (${r.para_pedir.length})</h3>` +
      (r.para_pedir.length
        ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr>
              <th style="text-align:left;padding:6px;color:#5C6145;">Materia</th>
              <th style="text-align:left;padding:6px;color:#5C6145;">Proveedor</th>
              <th style="text-align:right;padding:6px;color:#5C6145;">Stock</th>
              <th style="text-align:right;padding:6px;color:#5C6145;">Pedir</th>
            </tr></thead><tbody>${filasPedir}</tbody></table>`
        : `<p style="font-size:13px;color:#5C6145;">✓ Todas las materias por encima del mínimo. Nada que pedir.</p>`)
    : "";

  const fecha = new Date().toLocaleString("es-ES", { timeZone: ZONA });
  return `<div style="font-family:Arial,sans-serif;color:#111;max-width:680px;margin:0 auto;">
    <div style="border-bottom:3px solid #5C6145;padding-bottom:10px;margin-bottom:8px;">
      <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#5C6145;">M de Materia · Control M</div>
      <h2 style="margin:4px 0 0;">Aviso del día</h2>
    </div>
    <p style="font-size:12px;color:#777;">${esc(fecha)}</p>
    ${seccionCaducar}
    ${seccionPedir}
    <p style="font-size:11px;color:#777;margin-top:22px;border-top:1px solid #eee;padding-top:10px;">Aviso automático de Control M (M de Materia). Cambia la hora o desactívalo en Gestión › Avisos.</p>
  </div>`;
}

// Construye y envía el email de aviso. `motivo`: "programado" o "manual".
async function enviarAlertaDiaria(opts = {}) {
  const cfg = obtenerConfig();
  if (!cfg.alerta_email) {
    const e = new Error("No hay email configurado para los avisos. Defínelo en Gestión › Avisos.");
    e.code = "SIN_EMAIL";
    throw e;
  }
  if (!mailer.disponible()) {
    const e = new Error("Email no configurado en el servidor (define RESEND_API_KEY).");
    e.code = "EMAIL_NO_CONFIG";
    throw e;
  }
  const r = resumen();
  const subject = `M de Materia · ${r.por_caducar.length} por caducar · ${r.para_pedir.length} por pedir`;
  await mailer.enviarEmail({ to: cfg.alerta_email, subject, html: htmlAlerta(r, cfg) });

  const dia = diaMadrid();
  setInterno({ ultimo_envio_dia: dia, ultimo_envio: new Date().toISOString() });
  console.log(`Aviso (${opts.motivo || "manual"}) enviado a ${cfg.alerta_email}: ${r.por_caducar.length} caducan, ${r.para_pedir.length} por pedir`);
  return { enviado_a: cfg.alerta_email, por_caducar: r.por_caducar.length, para_pedir: r.para_pedir.length };
}

// "HH:MM" actual en la zona de Málaga (para comparar con la hora configurada).
function horaMadrid() {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: ZONA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

// "YYYY-MM-DD" actual en la zona de Málaga (para no repetir envío el mismo día).
function diaMadrid() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return p; // en-CA da directamente YYYY-MM-DD
}

// Tarea de cada minuto: si llega la hora configurada y aún no se ha enviado hoy,
// manda el aviso diario. Llamada desde el setInterval de server.js.
async function tick() {
  let cfg;
  try {
    cfg = obtenerConfig();
  } catch (e) {
    return; // almacén aún no listo
  }
  if (!cfg.activo || !cfg.alerta_email) return;
  if (horaMadrid() !== cfg.alerta_hora) return;
  if (cfg.ultimo_envio_dia === diaMadrid()) return; // ya enviado hoy
  try {
    await enviarAlertaDiaria({ motivo: "programado" });
  } catch (e) {
    console.error("Aviso diario no enviado:", e.message);
    // Marca el día para no reintentar en bucle cada minuto si falla la config.
    if (e.code === "EMAIL_NO_CONFIG" || e.code === "SIN_EMAIL") {
      setInterno({ ultimo_envio_dia: diaMadrid() });
    }
  }
}

module.exports = {
  obtenerConfig,
  guardarConfig,
  lotesPorCaducar,
  materiasParaPedir,
  resumen,
  enviarAlertaDiaria,
  tick,
};
