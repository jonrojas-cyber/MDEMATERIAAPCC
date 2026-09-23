// TURNOS · calendario del equipo POR FECHA (rotación real, no semana fija).
// Cada turno = persona · fecha (YYYY-MM-DD) · horario · función. Agregación pura
// (inyectable para tests): horas, cuadrante semanal, resumen y solapes. No toca
// dinero: el equipo ve su turno; el coste laboral vive en el Centro de Control.

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]; // idx 0..6 = Lun..Dom
const DIAS_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Tipos de turno de m de materia (código → horario + función). Fuente única.
const TURNO_DEF = {
  A: { inicio: "07:00", fin: "15:00", funcion: "Apertura" },
  C: { inicio: "09:00", fin: "17:00", funcion: "Cierre" },
  P: { inicio: "10:00", fin: "14:00", funcion: "Apoyo" },
  R: { inicio: "11:00", fin: "17:00", funcion: "Vuelta" },
};

function ymd(d) { return String(d || "").slice(0, 10); }
function aMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}
// Horas de un turno (fin − inicio; si fin <= inicio, cruza medianoche).
function horasTurno(t) {
  const a = aMin(t.inicio), b = aMin(t.fin);
  if (a == null || b == null) return 0;
  const dur = b > a ? b - a : b + 24 * 60 - a;
  return Math.round((dur / 60) * 100) / 100;
}

// Índice de día de la semana 0..6 (Lun..Dom) sin líos de zona horaria.
function diaIdx(fecha) {
  const d = new Date(ymd(fecha) + "T12:00:00Z");
  const g = d.getUTCDay(); // 0=Dom..6=Sáb
  return g === 0 ? 6 : g - 1;
}
// Lunes (YYYY-MM-DD) de la semana que contiene `fecha`.
function lunesDe(fecha) {
  const d = new Date(ymd(fecha) + "T12:00:00Z");
  const off = diaIdx(fecha);
  return new Date(d.getTime() - off * 86400000).toISOString().slice(0, 10);
}
// Las 7 fechas (YYYY-MM-DD) de la semana que empieza en `lunesYmd`.
function fechasSemana(lunesYmd) {
  const base = new Date(ymd(lunesYmd) + "T12:00:00Z").getTime();
  return Array.from({ length: 7 }, (_, i) => new Date(base + i * 86400000).toISOString().slice(0, 10));
}

// ¿Se solapan dos turnos la MISMA fecha?
function solapan(t1, t2) {
  if (ymd(t1.fecha) !== ymd(t2.fecha)) return false;
  const a1 = aMin(t1.inicio), b1 = aMin(t1.fin), a2 = aMin(t2.inicio), b2 = aMin(t2.fin);
  if ([a1, b1, a2, b2].some((x) => x == null)) return false;
  const f1 = b1 > a1 ? b1 : b1 + 1440, f2 = b2 > a2 ? b2 : b2 + 1440;
  return a1 < f2 && a2 < f1;
}
function solapesDe(turnos = []) {
  const out = [];
  const porClave = {};
  turnos.forEach((t) => { const k = (t.persona || "—") + "|" + ymd(t.fecha); (porClave[k] = porClave[k] || []).push(t); });
  Object.values(porClave).forEach((lista) => {
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      if (solapan(lista[i], lista[j])) out.push({ persona: lista[i].persona, fecha: ymd(lista[i].fecha), a: lista[i], b: lista[j] });
    }
  });
  return out;
}

// Resumen de horas por persona sobre un conjunto de turnos (una semana, un ciclo…).
function resumenPorPersona(turnos = []) {
  const g = {};
  turnos.forEach((t) => {
    const k = t.persona || "—";
    if (!g[k]) g[k] = { persona: k, horas: 0, turnos: 0, funciones: new Set() };
    g[k].horas += horasTurno(t); g[k].turnos += 1;
    if (t.funcion) g[k].funciones.add(t.funcion);
  });
  return Object.values(g)
    .map((x) => ({ persona: x.persona, horas: Math.round(x.horas * 100) / 100, turnos: x.turnos, funciones: [...x.funciones] }))
    .sort((a, b) => b.horas - a.horas);
}

// Cuadrante de UNA semana: persona × 7 fechas, con horas de la semana por persona.
function cuadranteSemana(turnos = [], lunesYmd) {
  const lunes = lunesDe(lunesYmd);
  const fechas = fechasSemana(lunes);
  const set = new Set(fechas);
  const dela = turnos.filter((t) => set.has(ymd(t.fecha)));
  const personas = [...new Set(dela.map((t) => t.persona || "—"))].sort();
  const grid = {};
  personas.forEach((p) => { grid[p] = {}; fechas.forEach((f) => (grid[p][f] = [])); });
  dela.forEach((t) => { const p = t.persona || "—", f = ymd(t.fecha); if (grid[p] && grid[p][f]) grid[p][f].push(t); });
  personas.forEach((p) => fechas.forEach((f) => grid[p][f].sort((a, b) => (aMin(a.inicio) || 0) - (aMin(b.inicio) || 0))));
  return {
    lunes,
    fechas: fechas.map((f, i) => ({ fecha: f, dia: DIAS[i], corto: DIAS_CORTO[i], num: Number(f.slice(8, 10)) })),
    personas, grid,
    resumen: resumenPorPersona(dela),
    solapes: solapesDe(dela),
  };
}

module.exports = { DIAS, DIAS_CORTO, TURNO_DEF, aMin, horasTurno, diaIdx, lunesDe, fechasSemana, solapan, solapesDe, resumenPorPersona, cuadranteSemana };
