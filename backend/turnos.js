// TURNOS · cuadrante semanal del equipo (persona · día · horario · función).
// Agregación pura (inyectable para tests): horas por persona, por día y avisos de
// solape. No toca dinero: el equipo puede ver el cuadrante (coste laboral vive en
// el Centro de Control, aparte). Fuente única de horas = estos turnos.

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]; // 1..7

// Minutos desde medianoche de "HH:MM" (tolerante). null si no válido.
function aMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

// Horas de un turno (fin − inicio). Si fin <= inicio, cruza medianoche (+24h).
function horasTurno(t) {
  const a = aMin(t.inicio), b = aMin(t.fin);
  if (a == null || b == null) return 0;
  const dur = b > a ? b - a : b + 24 * 60 - a;
  return Math.round((dur / 60) * 100) / 100;
}

// ¿Se solapan dos turnos el MISMO día? (para avisar de choques).
function solapan(t1, t2) {
  if (Number(t1.dia) !== Number(t2.dia)) return false;
  const a1 = aMin(t1.inicio), b1 = aMin(t1.fin), a2 = aMin(t2.inicio), b2 = aMin(t2.fin);
  if ([a1, b1, a2, b2].some((x) => x == null)) return false;
  const f1 = b1 > a1 ? b1 : b1 + 1440, f2 = b2 > a2 ? b2 : b2 + 1440;
  return a1 < f2 && a2 < f1;
}

// Resumen: horas/semana por persona, nº de turnos y funciones que cubre.
function resumenPorPersona(turnos = []) {
  const g = {};
  turnos.forEach((t) => {
    const k = t.persona || "—";
    if (!g[k]) g[k] = { persona: k, horas: 0, turnos: 0, funciones: new Set() };
    g[k].horas += horasTurno(t);
    g[k].turnos += 1;
    if (t.funcion) g[k].funciones.add(t.funcion);
  });
  return Object.values(g)
    .map((x) => ({ persona: x.persona, horas: Math.round(x.horas * 100) / 100, turnos: x.turnos, funciones: [...x.funciones] }))
    .sort((a, b) => b.horas - a.horas);
}

// Solapes dentro de la misma persona (choques de horario a avisar).
function solapesDe(turnos = []) {
  const out = [];
  const porPersona = {};
  turnos.forEach((t) => { (porPersona[t.persona || "—"] = porPersona[t.persona || "—"] || []).push(t); });
  Object.values(porPersona).forEach((lista) => {
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        if (solapan(lista[i], lista[j])) out.push({ persona: lista[i].persona, dia: Number(lista[i].dia), a: lista[i], b: lista[j] });
      }
    }
  });
  return out;
}

// Cuadrante: matriz persona × día con los turnos de cada celda.
function cuadrante(turnos = []) {
  const personas = [...new Set(turnos.map((t) => t.persona || "—"))];
  const grid = {};
  personas.forEach((p) => { grid[p] = {}; for (let d = 1; d <= 7; d++) grid[p][d] = []; });
  turnos.forEach((t) => {
    const p = t.persona || "—", d = Number(t.dia);
    if (grid[p] && grid[p][d]) grid[p][d].push(t);
  });
  // ordena cada celda por hora de inicio
  personas.forEach((p) => { for (let d = 1; d <= 7; d++) grid[p][d].sort((a, b) => (aMin(a.inicio) || 0) - (aMin(b.inicio) || 0)); });
  return { personas, grid };
}

module.exports = { DIAS, aMin, horasTurno, solapan, resumenPorPersona, solapesDe, cuadrante };
