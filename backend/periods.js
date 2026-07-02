// PERIODOS · fuente única de rangos de tiempo para todo el Centro de Control.
// REGLA INNEGOCIABLE: la semana SIEMPRE empieza en lunes.
// Todas las vistas por periodo (dashboard, financiero, objetivos) resuelven aquí
// su rango [desde, hasta) y sus comparativos (periodo anterior y año anterior).
//
// `now` es inyectable para poder testear con fechas fijas (en producción usa
// Date.now()). Los rangos son medio-abiertos [desde, hasta): incluye desde,
// excluye hasta. Para periodos en curso, hasta = now.

const DAY = 86400000;

const PRESETS = [
  "hoy", "ayer", "semana", "semana_anterior",
  "mes", "mes_anterior", "anio", "anio_anterior", "personalizado",
];

const ETIQUETAS = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana: "Esta semana",
  semana_anterior: "Semana anterior",
  mes: "Este mes",
  mes_anterior: "Mes anterior",
  anio: "Año actual",
  anio_anterior: "Año anterior",
  personalizado: "Personalizado",
};

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
// Lunes de la semana que contiene `t`, a las 00:00 (getDay: 0=domingo).
function startOfWeek(t) {
  const d = new Date(startOfDay(t));
  const dow = (d.getDay() + 6) % 7; // lunes = 0, domingo = 6
  return d.getTime() - dow * DAY;
}
function startOfMonth(t) {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function startOfYear(t) {
  const d = new Date(t);
  return new Date(d.getFullYear(), 0, 1).getTime();
}
function addMonths(t, n) {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}
function addYears(t, n) {
  const d = new Date(t);
  return new Date(d.getFullYear() + n, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()).getTime();
}

function normalizarPreset(p) {
  return PRESETS.includes(p) ? p : "hoy";
}

// Rango principal para un preset. Devuelve { desde, hasta, label, preset }.
function rango(preset, now = Date.now(), custom = {}) {
  preset = normalizarPreset(preset);
  now = Number(now) || Date.now();
  let desde, hasta;
  switch (preset) {
    case "hoy": desde = startOfDay(now); hasta = now; break;
    case "ayer": desde = startOfDay(now) - DAY; hasta = startOfDay(now); break;
    case "semana": desde = startOfWeek(now); hasta = now; break;
    case "semana_anterior": desde = startOfWeek(now) - 7 * DAY; hasta = startOfWeek(now); break;
    case "mes": desde = startOfMonth(now); hasta = now; break;
    case "mes_anterior": desde = addMonths(startOfMonth(now), -1); hasta = startOfMonth(now); break;
    case "anio": desde = startOfYear(now); hasta = now; break;
    case "anio_anterior": desde = new Date(new Date(now).getFullYear() - 1, 0, 1).getTime(); hasta = startOfYear(now); break;
    case "personalizado": {
      desde = custom.desde != null ? startOfDay(Number(custom.desde)) : startOfDay(now);
      // hasta personalizado es inclusivo del día elegido → sumamos un día para el medio-abierto.
      hasta = custom.hasta != null ? startOfDay(Number(custom.hasta)) + DAY : now;
      break;
    }
    default: desde = startOfDay(now); hasta = now;
  }
  return { preset, desde, hasta, label: ETIQUETAS[preset] };
}

// Inicio del periodo inmediatamente anterior, mismo tipo. Para periodos en curso
// (hoy/semana/mes/anio) el comparativo usa la MISMA duración transcurrida, para
// que la comparación sea justa (p. ej. lunes-a-ahora contra lunes-a-esa-misma-hora).
function comparativoAnterior(preset, now = Date.now(), custom = {}) {
  const r = rango(preset, now, custom);
  const len = r.hasta - r.desde;
  let desde;
  switch (preset) {
    case "hoy": case "ayer": desde = r.desde - DAY; break;
    case "semana": case "semana_anterior": desde = r.desde - 7 * DAY; break;
    case "mes": case "mes_anterior": desde = addMonths(r.desde, -1); break;
    case "anio": case "anio_anterior": desde = new Date(new Date(r.desde).getFullYear() - 1, 0, 1).getTime(); break;
    default: desde = r.desde - len; // personalizado: desplaza la misma longitud
  }
  return { desde, hasta: desde + len, label: "Periodo anterior" };
}

// Mismo periodo del año anterior (donde haya datos).
function comparativoAnioAnterior(preset, now = Date.now(), custom = {}) {
  const r = rango(preset, now, custom);
  return {
    desde: new Date(new Date(r.desde).getFullYear() - 1, new Date(r.desde).getMonth(), new Date(r.desde).getDate(), new Date(r.desde).getHours()).getTime(),
    hasta: new Date(new Date(r.hasta).getFullYear() - 1, new Date(r.hasta).getMonth(), new Date(r.hasta).getDate(), new Date(r.hasta).getHours()).getTime(),
    label: "Año anterior",
  };
}

// Resuelve todo de una vez: rango actual + comparativos. Punto de entrada del dashboard.
function resolver(preset, opts = {}) {
  const now = opts.now != null ? Number(opts.now) : Date.now();
  const custom = { desde: opts.desde, hasta: opts.hasta };
  return {
    actual: rango(preset, now, custom),
    anterior: comparativoAnterior(preset, now, custom),
    anio_anterior: comparativoAnioAnterior(preset, now, custom),
  };
}

// Nº de días (fracción) que abarca un rango — para prorratear costes a un periodo.
function diasDe(r) {
  return (r.hasta - r.desde) / DAY;
}

// ¿Cae `t` dentro de [desde, hasta)?
function dentro(t, r) {
  const x = new Date(t).getTime();
  return x >= r.desde && x < r.hasta;
}

module.exports = {
  DAY, PRESETS, ETIQUETAS,
  startOfDay, startOfWeek, startOfMonth, startOfYear, addMonths, addYears,
  rango, comparativoAnterior, comparativoAnioAnterior, resolver, diasDe, dentro,
};
