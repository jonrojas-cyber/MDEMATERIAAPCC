// FICHAJE · reloj del equipo (entrada / pausa / salida) por eventos.
// Puro e inyectable para tests. Calcula la jornada real (horas trabajadas menos
// pausas), el estado actual (fuera/trabajando/pausa) y compara con el turno
// planificado (retraso a la entrada, salida anticipada). No toca dinero.

const tz = require("./tz");

const TIPOS = ["entrada", "pausa_inicio", "pausa_fin", "salida"];

function ymd(d) { return String(d || "").slice(0, 10); }
function tms(x) { const t = new Date(x).getTime(); return Number.isFinite(t) ? t : null; }
// Hora local de Málaga (nunca UTC a pelo) para mostrar y comparar con el turno.
function hm(iso) { if (!iso) return null; const p = tz.partes(iso); return p ? `${p.hour}:${p.minute}` : null; }
function minLocal(iso) { const p = iso ? tz.partes(iso) : null; return p ? Number(p.hour) * 60 + Number(p.minute) : null; }
function aMin(hhmm) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }

// Transición válida desde un estado. Devuelve el conjunto de tipos permitidos.
function permitidos(estado) {
  if (estado === "fuera") return ["entrada"];
  if (estado === "trabajando") return ["pausa_inicio", "salida"];
  if (estado === "pausa") return ["pausa_fin", "salida"];
  return [];
}

// Reconstruye la jornada de una persona en un día a partir de sus eventos.
// `now` permite contar el tiempo en curso si aún está trabajando.
function jornada(eventos = [], now = Date.now()) {
  const evs = [...eventos].filter((e) => tms(e.ts) != null).sort((a, b) => tms(a.ts) - tms(b.ts));
  let estado = "fuera", workStart = null, pausaStart = null;
  let worked = 0, pausaTotal = 0, entrada = null, salida = null;
  for (const e of evs) {
    const t = tms(e.ts);
    if (e.tipo === "entrada") {
      if (estado === "fuera") { estado = "trabajando"; workStart = t; if (!entrada) entrada = e.ts; }
    } else if (e.tipo === "pausa_inicio") {
      if (estado === "trabajando") { worked += t - workStart; estado = "pausa"; pausaStart = t; }
    } else if (e.tipo === "pausa_fin") {
      if (estado === "pausa") { pausaTotal += t - pausaStart; estado = "trabajando"; workStart = t; }
    } else if (e.tipo === "salida") {
      if (estado === "trabajando") worked += t - workStart;
      else if (estado === "pausa") pausaTotal += t - pausaStart;
      estado = "fuera"; salida = e.ts; workStart = null; pausaStart = null;
    }
  }
  let workedNow = worked;
  if (estado === "trabajando" && workStart) workedNow += now - workStart;
  let pausaNow = pausaTotal;
  if (estado === "pausa" && pausaStart) pausaNow += now - pausaStart;
  return {
    estado,
    entrada, salida,
    entrada_hm: hm(entrada), salida_hm: hm(salida),
    horas_trabajadas: Math.round((workedNow / 3600000) * 100) / 100,
    pausa_min: Math.round(pausaNow / 60000),
    eventos: evs.length,
    permitidos: permitidos(estado),
  };
}

// Compara la jornada con el turno planificado (si lo hay) → retraso / salida antes.
function contraTurno(j, turno) {
  if (!turno) return { con_turno: false };
  const ini = aMin(turno.inicio), fin = aMin(turno.fin);
  const entMin = minLocal(j.entrada);
  const salMin = minLocal(j.salida);
  return {
    con_turno: true,
    turno_inicio: turno.inicio, turno_fin: turno.fin, funcion: turno.funcion || null,
    retraso_min: (entMin != null && ini != null) ? Math.max(0, entMin - ini) : null,
    salida_antes_min: (salMin != null && fin != null) ? Math.max(0, fin - salMin) : null,
    horas_plan: (ini != null && fin != null) ? Math.round(((fin > ini ? fin - ini : fin + 1440 - ini) / 60) * 100) / 100 : null,
  };
}

// Eventos de una persona en una fecha (business day).
function eventosDe(fichajes, persona, fecha) {
  const p = String(persona || "").toLowerCase();
  return fichajes.filter((f) => ymd(f.fecha) === ymd(fecha) && String(f.persona || "").toLowerCase() === p);
}

// Resumen de horas REALES vs PLANIFICADAS por persona en un rango [desde,hasta].
function resumen(fichajes = [], turnos = [], desde, hasta, now = Date.now()) {
  const d0 = ymd(desde), d1 = ymd(hasta);
  const enRango = (f) => { const x = ymd(f); return x >= d0 && x <= d1; };
  // real: agrupa por persona+fecha y suma jornadas.
  const porPF = {};
  fichajes.filter((f) => enRango(f.fecha)).forEach((f) => {
    const k = (f.persona || "—") + "|" + ymd(f.fecha);
    (porPF[k] = porPF[k] || []).push(f);
  });
  const real = {};
  Object.entries(porPF).forEach(([k, evs]) => {
    const persona = k.split("|")[0];
    real[persona] = (real[persona] || 0) + jornada(evs, now).horas_trabajadas;
  });
  // plan: suma horas de turnos en rango.
  const plan = {};
  turnos.filter((t) => enRango(t.fecha)).forEach((t) => {
    const ini = aMin(t.inicio), fin = aMin(t.fin);
    if (ini == null || fin == null) return;
    const h = (fin > ini ? fin - ini : fin + 1440 - ini) / 60;
    plan[t.persona] = (plan[t.persona] || 0) + h;
  });
  const personas = [...new Set([...Object.keys(real), ...Object.keys(plan)])];
  return personas.map((p) => {
    const r = Math.round((real[p] || 0) * 100) / 100, pl = Math.round((plan[p] || 0) * 100) / 100;
    return { persona: p, horas_reales: r, horas_plan: pl, diferencia: Math.round((r - pl) * 100) / 100 };
  }).sort((a, b) => b.horas_reales - a.horas_reales);
}

module.exports = { TIPOS, permitidos, jornada, contraTurno, eventosDe, resumen };
