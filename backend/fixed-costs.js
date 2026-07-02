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
  monthly: 365 / 12, // 30.4375
  quarterly: 365 / 4, // 91.25
  yearly: 365,
  one_time: 0, // gasto puntual: no prorratea a coste recurrente
};

const PERIODICIDADES = Object.keys(DIAS);

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Coste diario prorrateado de un coste fijo. one_time no aporta coste diario.
function costeDiario(fc) {
  const amount = Number(fc.amount) || 0;
  const d = DIAS[fc.periodicity];
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

module.exports = { DIAS, PERIODICIDADES, costeDiario, activoEn, prorrateo, totales, costeEnRango, porCategoria, eur };
