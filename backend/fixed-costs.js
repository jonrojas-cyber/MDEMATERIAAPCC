// COSTES FIJOS · prorrateo a día / semana / mes / año.
// Fuente única del "coste de existir": todo coste con periodicidad se normaliza
// a un coste diario y de ahí se deriva el resto. Los demás módulos (financials,
// business-health, copilot) NO recalculan: consumen estas funciones.

const store = require("./data-store");

// Días de referencia por periodicidad → coste diario = amount / dias.
// Usamos medias de calendario (año 365, mes 30.4375, semana 7) para prorrateo
// estable e independiente del mes concreto.
const DIAS = {
  daily: 1,
  weekly: 7,
  biweekly: 14,       // quincenal (cada dos semanas)
  monthly: 365 / 12,  // 30.4375
  quarterly: 365 / 4, // 91.25
  semiannual: 365 / 2, // 182.5 (semestral)
  yearly: 365,
  custom: null,       // periodicidad libre: usa fc.custom_days como divisor
  one_time: 0,        // gasto puntual: no prorratea a coste recurrente
};

const PERIODICIDADES = Object.keys(DIAS);

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Días de referencia de un coste, resolviendo la periodicidad "custom".
function diasDe(fc) {
  if (fc.periodicity === "custom") { const d = Number(fc.custom_days) || 0; return d > 0 ? d : 0; }
  return DIAS[fc.periodicity];
}

// Coste diario prorrateado de un coste fijo. one_time no aporta coste diario.
function costeDiario(fc) {
  const amount = Number(fc.amount) || 0;
  const d = diasDe(fc);
  if (!d || d <= 0) return 0;
  return amount / d;
}

// ¿Está activo el coste en la fecha `t`? Respeta start_date / end_date / active.
function activoEn(fc, t) {
  if (fc.active === false) return false;
  const x = new Date(t).getTime();
  if (fc.start_date) { const s = new Date(fc.start_date).getTime(); if (Number.isFinite(s) && x < s) return false; }
  if (fc.end_date) { const e = new Date(fc.end_date).getTime(); if (Number.isFinite(e) && x > e) return false; }
  return true;
}

// Prorrateo completo de un coste: diario/semanal/mensual/anual.
function prorrateo(fc) {
  const diario = costeDiario(fc);
  return {
    diario: eur(diario),
    semanal: eur(diario * 7),
    mensual: eur(diario * (365 / 12)),
    anual: eur(diario * 365),
  };
}

// Coste total (todos los fijos activos) prorrateado a día/semana/mes/año, en una
// fecha de referencia. Sirve para el "coste de abrir la persiana".
function totales(now = Date.now(), lista = null) {
  const fijos = (lista || store.readAll("fixed_costs")).filter((f) => activoEn(f, now));
  let diario = 0;
  fijos.forEach((f) => { diario += costeDiario(f); });
  return {
    diario: eur(diario),
    semanal: eur(diario * 7),
    mensual: eur(diario * (365 / 12)),
    anual: eur(diario * 365),
    lineas: fijos.length,
  };
}

// Coste fijo imputable a un rango [desde, hasta): coste diario medio × nº de días.
// (Los one_time que caen dentro del rango se suman como gasto puntual.)
function costeEnRango(rango, now = Date.now(), lista = null) {
  const todos = lista || store.readAll("fixed_costs");
  const dias = (rango.hasta - rango.desde) / 86400000;
  let recurrente = 0;
  let puntual = 0;
  todos.forEach((f) => {
    if (f.active === false) return;
    if (f.periodicity === "one_time") {
      const t = f.start_date ? new Date(f.start_date).getTime() : null;
      if (t != null && t >= rango.desde && t < rango.hasta) puntual += Number(f.amount) || 0;
      return;
    }
    // Recurrente: prorratea por los días del rango en que estuvo activo.
    // Aproximación estable: si está activo al final del rango, imputa todo el rango.
    if (activoEn(f, rango.hasta - 1)) recurrente += costeDiario(f) * dias;
  });
  return { recurrente: eur(recurrente), puntual: eur(puntual), total: eur(recurrente + puntual), dias: Math.round(dias * 100) / 100 };
}

// Desglose por categoría (para el detalle del "coste de abrir la persiana").
function porCategoria(now = Date.now(), lista = null) {
  const fijos = (lista || store.readAll("fixed_costs")).filter((f) => activoEn(f, now) && f.periodicity !== "one_time");
  const g = {};
  fijos.forEach((f) => {
    const cat = f.category || "Otros";
    g[cat] = (g[cat] || 0) + costeDiario(f) * (365 / 12); // a coste mensual
  });
  return Object.entries(g).map(([label, value]) => ({ label, value: eur(value) })).sort((a, b) => b.value - a.value);
}

// ── COSTE POR HORA / MINUTO DE APERTURA ─────────────────────────────────────
// El coste de "tener la persiana levantada": coste fijo diario repartido entre las
// horas de apertura. `perfil` = {dias_semana, horas_dia}. Sin materia ni laboral:
// esos los añade financials cuando calcula el coste operativo por hora.
function costePorHora(now = Date.now(), perfil = {}, lista = null) {
  const diasSemana = Number(perfil.dias_semana) > 0 ? Number(perfil.dias_semana) : 7;
  const horasDia = Number(perfil.horas_dia) > 0 ? Number(perfil.horas_dia) : 24;
  const tot = totales(now, lista);
  // Coste fijo mensual repartido entre las horas realmente abiertas al mes.
  const horasMes = diasSemana * horasDia * (365 / 12 / 7);
  const porHora = horasMes > 0 ? tot.mensual / horasMes : 0;
  return {
    coste_hora: eur(porHora),
    coste_minuto: eur(porHora / 60),
    horas_mes: Math.round(horasMes * 10) / 10,
    horas_dia: horasDia,
    dias_semana: diasSemana,
  };
}

// ── PROYECCIÓN ANUAL CON INFLACIÓN ──────────────────────────────────────────
// Arquitectura de inflación (nunca hardcodeada): usa la subida anual propia de cada
// coste (fc.inflation_pct) o, si no la tiene, la subida por defecto del perfil.
function costeAnualProyectado(now = Date.now(), inflacionDefault = 0, lista = null) {
  const fijos = (lista || store.readAll("fixed_costs")).filter((f) => activoEn(f, now) && f.periodicity !== "one_time");
  let base = 0;
  let proyectado = 0;
  fijos.forEach((f) => {
    const anual = costeDiario(f) * 365;
    const inf = f.inflation_pct != null ? Number(f.inflation_pct) : Number(inflacionDefault) || 0;
    base += anual;
    proyectado += anual * (1 + inf / 100);
  });
  return { base: eur(base), proyectado: eur(proyectado), incremento: eur(proyectado - base) };
}

// ── MAYOR GASTO (para el titular ejecutivo) ─────────────────────────────────
function mayorGasto(now = Date.now(), lista = null) {
  const fijos = (lista || store.readAll("fixed_costs")).filter((f) => activoEn(f, now) && f.periodicity !== "one_time");
  if (!fijos.length) return null;
  const orden = fijos.map((f) => ({ nombre: f.name, categoria: f.category || "Otros", mensual: eur(costeDiario(f) * (365 / 12)) }))
    .sort((a, b) => b.mensual - a.mensual);
  return orden[0];
}

module.exports = {
  DIAS, PERIODICIDADES, diasDe, costeDiario, activoEn, prorrateo, totales, costeEnRango,
  porCategoria, costePorHora, costeAnualProyectado, mayorGasto, eur,
};
