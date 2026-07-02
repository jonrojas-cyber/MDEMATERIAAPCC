// FIXED COSTS OPERATING SYSTEM · el sistema operativo de los costes fijos.
// Una sola llamada responde: cuánto cuesta existir (día/semana/mes/año), cuánto
// cuesta cada hora abierta, cuál es el mayor gasto, cuánto hay que vender para no
// perder (break-even), qué margen de seguridad hay, qué pasará con la inflación y
// dónde ahorrar. NO recalcula dinero: ensambla los motores.
//
// Mapa de motores del PRD:
//   FixedCostEngine        → fixed-costs.js (prorrateo, hora, proyección)
//   RecurringExpenseEngine → fixed-costs.js (recurrentes activos) + obligaciones
//   BreakEvenEngine        → break-even.puntoEquilibrio
//   ContributionMarginEngine → break-even.contribucion
//   CostForecastEngine     → cost-analytics.forecast
//   CostAnalyticsEngine    → cost-analytics.alertas / evolucion

const fixedCosts = require("./fixed-costs");
const breakEven = require("./break-even");
const costAnalytics = require("./cost-analytics");
const operatingProfile = require("./operating-profile");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function sistemaOperativo(now = Date.now(), localId = "principal") {
  const perfil = operatingProfile.leer();
  const totales = fixedCosts.totales(now);
  const porCategoria = fixedCosts.porCategoria(now);
  const porHora = fixedCosts.costePorHora(now, perfil);
  const mayor = fixedCosts.mayorGasto(now);

  const contrib = breakEven.contribucion();
  const equilibrio = breakEven.puntoEquilibrio(now, { perfil, contribucion: contrib });

  const forecast = costAnalytics.forecast(now, perfil.inflacion_anual_pct, localId);
  const analitica = costAnalytics.alertas(now);
  const evolucion = costAnalytics.evolucion(now, localId);

  // Titular ejecutivo: las cifras que el dueño quiere ver en 5 segundos.
  const dashboard = {
    coste_dia: totales.diario,
    coste_semana: totales.semanal,
    coste_mes: totales.mensual,
    coste_anio: totales.anual,
    coste_hora: porHora.coste_hora,
    coste_minuto: porHora.coste_minuto,
    lineas: totales.lineas,
    mayor_gasto: mayor,
    equilibrio_dia: equilibrio.ingreso_equilibrio_dia,
    equilibrio_clientes_dia: equilibrio.hoy && equilibrio.hoy.clientes,
    equilibrio_cafes_dia: equilibrio.hoy && equilibrio.hoy.cafes,
    margen_seguridad_pct: equilibrio.margen_seguridad_pct,
    en_perdidas: equilibrio.en_perdidas,
    ahorro_anual_potencial: analitica.ahorro_anual_potencial,
    incremento_inflacion_anual: forecast.incremento_anual,
  };

  return {
    generado_en: new Date(now).toISOString(),
    perfil,
    dashboard,
    totales,
    por_categoria: porCategoria,
    por_hora: porHora,
    break_even: equilibrio,
    contribucion: contrib,
    forecast,
    analitica,
    evolucion,
  };
}

module.exports = { sistemaOperativo, eur };
