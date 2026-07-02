// CASH FLOW ENGINE · el dinero que entra y sale de verdad, por periodo.
// Entradas = ventas + cobros ejecutados. Salidas = compras + pagos ejecutados +
// coste fijo prorrateado + coste laboral. Neto = entradas − salidas.
// Compone financials / staff-finance / fixed-costs: no reimplementa dinero.

const store = require("./data-store");
const periods = require("./periods");
const financials = require("./financials");
const staff = require("./staff-finance");
const fixedCosts = require("./fixed-costs");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function enRango(fecha, r) { const t = new Date(fecha).getTime(); return Number.isFinite(t) && t >= r.desde && t < r.hasta; }

function cobrosEjecutados(r) {
  return store.readAll("treasury_movements")
    .filter((m) => m.tipo === "cobro" && m.estado === "hecho" && m.fecha && enRango(m.fecha, r))
    .reduce((s, m) => s + (Number(m.importe) || 0), 0);
}
function pagosEjecutados(r) {
  return store.readAll("treasury_movements")
    .filter((m) => m.tipo === "pago" && m.estado === "hecho" && m.fecha && enRango(m.fecha, r))
    .reduce((s, m) => s + (Number(m.importe) || 0), 0);
}

// Flujo de caja de un rango [desde, hasta): entradas, salidas, neto y desglose.
function flujo(r, now = Date.now()) {
  const ventas = financials.ventasEnRango(r);
  const cobros = cobrosEjecutados(r);
  const compras = financials.comprasEnRango(r);
  const pagos = pagosEjecutados(r);
  const fijos = fixedCosts.costeEnRango(r, now).total;
  const laboral = staff.costeEnRango(r);
  const entradas = eur(ventas + cobros);
  const salidas = eur(compras + pagos + fijos + laboral);
  return {
    entradas, salidas, neto: eur(entradas - salidas),
    desglose: {
      entradas: { ventas: eur(ventas), cobros: eur(cobros) },
      salidas: { compras: eur(compras), pagos: eur(pagos), fijos: eur(fijos), laboral: eur(laboral) },
    },
    dias: Math.round(((r.hasta - r.desde) / 86400000) * 100) / 100,
  };
}

// Media móvil del flujo neto diario de los últimos N días.
function mediaMovilNeto(dias = 30, now = Date.now()) {
  const r = { desde: now - dias * 86400000, hasta: now };
  const f = flujo(r, now);
  return eur(f.neto / Math.max(1, dias));
}

// Resumen por periodo (hoy/semana/mes/año) + tendencia (mes vs mes anterior).
function resumen(now = Date.now()) {
  const hoy = flujo(periods.rango("hoy", now), now);
  const semana = flujo(periods.rango("semana", now), now);
  const mes = flujo(periods.rango("mes", now), now);
  const anio = flujo(periods.rango("anio", now), now);
  const mesAnterior = flujo(periods.rango("mes_anterior", now), now);
  const tendencia = mesAnterior.neto !== 0
    ? Math.round(((mes.neto - mesAnterior.neto) / Math.abs(mesAnterior.neto)) * 100)
    : null;
  return {
    hoy, semana, mes, anio,
    neto_medio_diario: mediaMovilNeto(30, now),
    tendencia_pct: tendencia,
  };
}

module.exports = { flujo, resumen, mediaMovilNeto };
