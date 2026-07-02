// DEBT & FINANCING OPERATING SYSTEM · el asesor financiero de la deuda.
// Una sola llamada responde: cuánto se debe, por qué, si es sana, cuánto más se
// puede financiar con seguridad, qué pasará con el saldo/intereses y dónde
// refinanciar. NO recalcula dinero: ensambla los motores de deuda.
//
// Mapa de motores del PRD:
//   DebtEngine             → debts.js (resumen, amortización, ratios base)
//   DebtForecastEngine     → debt-analytics.forecast
//   DebtSimulationEngine   → debt-simulation.js (vía endpoint /simular)
//   DebtAnalyticsEngine    → debt-analytics.alertas / evolucion
//   FinancingCapacityEngine→ debt-analytics.capacidad
//   DebtRiskEngine         → risk.js (riesgo de deuda) + capacidad.nivel

const debtsMod = require("./debts");
const debtAnalytics = require("./debt-analytics");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
const DAY = 86400000;

function sistemaOperativo(now = Date.now(), localId = "principal") {
  const res = debtsMod.resumen(now);
  const ctx = debtAnalytics.contextoFinanciero(now);
  const ratios = debtAnalytics.ratios(now, ctx, res);
  const capacidad = debtAnalytics.capacidad(now, ctx, res);
  const analitica = debtAnalytics.alertas(now, ctx, res);
  const evolucion = debtAnalytics.evolucion(now, localId);
  const forecast = debtAnalytics.forecast(now, res, localId);

  // Días hasta el próximo pago.
  const diasProximo = res.proximo_vencimiento != null ? Math.max(0, Math.round((res.proximo_vencimiento - now) / DAY)) : null;

  // Cuadro de amortización agregado (próximos 12 meses) de toda la cartera.
  const cuadros = res.deudas.map((d) => ({ id: d.id, name: d.name, cuadro: debtsMod.amortizacion(d, now).cuadro }));
  const calendario = [];
  for (let m = 0; m < 12; m++) {
    let cuota = 0, interes = 0, principal = 0;
    cuadros.forEach((c) => { const p = c.cuadro[m]; if (p) { cuota += p.cuota; interes += p.interes; principal += p.principal; } });
    if (cuota > 0) calendario.push({ mes: m + 1, cuota: eur(cuota), interes: eur(interes), principal: eur(principal) });
  }

  const dashboard = {
    deuda_total: res.deuda_total,
    cuota_mensual: res.cuota_mensual_total,
    intereses_restantes: forecast.programado.intereses_totales,
    num_deudas: res.num_deudas,
    tasa_media: res.tasa_media,
    duracion_media_meses: res.duracion_media_meses,
    proximo_vencimiento: res.proximo_vencimiento,
    dias_proximo_pago: diasProximo,
    fecha_libre_deuda: res.fecha_final_estimada,
    mayor_interes: res.mayor_interes,
    ratio_deuda_ebitda: ratios.deuda_ebitda,
    servicio_deuda_ebitda_pct: ratios.servicio_deuda_ebitda,
    nivel_apalancamiento: capacidad.nivel_apalancamiento,
    tendencia: evolucion.disponible ? evolucion.tendencia : null,
    reduccion_mensual: evolucion.disponible ? evolucion.reduccion_mensual : null,
    capacidad_adicional: capacidad.deuda_adicional_segura,
    ahorro_refinanciacion: analitica.ahorro_anual_potencial,
    recomendacion: analitica.alertas.length ? analitica.alertas[0] : null,
  };

  return {
    generado_en: new Date(now).toISOString(),
    dashboard,
    resumen: res,
    ratios,
    capacidad,
    forecast,
    evolucion,
    analitica,
    distribucion: res.distribucion,
    calendario,          // próximos 12 meses agregados (cuota/interés/capital)
    deudas: res.deudas,
    sistemas: debtsMod.SISTEMAS.map((s) => ({ value: s, label: debtsMod.SISTEMA_LABEL[s] })),
  };
}

module.exports = { sistemaOperativo, eur };
