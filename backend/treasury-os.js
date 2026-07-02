// TREASURY OPERATING SYSTEM · el centro de control financiero.
// Una sola llamada responde: cuánto dinero hay, cuánto está disponible, cuánto
// está comprometido, cuántos días sobrevive el negocio, cuál es su valor y qué
// pasará en 7/30/90/180/365 días. NO recalcula dinero: ensambla los motores
// (treasury, financials, cashflow, forecast, fixed-costs, debts).
//
// Mapa de motores del PRD:
//   TreasuryEngine        → este ensamblador
//   LiquidityEngine       → treasury.liquidezAvanzada
//   CashFlowEngine        → cashflow.js
//   BusinessValueEngine   → financials.patrimonioNeto + forecast
//   RecurringExpenseEngine→ fixed-costs.js
//   TreasuryForecastEngine→ forecast.js

const treasury = require("./treasury");
const financials = require("./financials");
const cashflow = require("./cashflow");
const forecast = require("./forecast");
const fixedCosts = require("./fixed-costs");
const debtsMod = require("./debts");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
const MES = 365 / 12;

// Obligaciones recurrentes próximas (coste fijo + cuotas de deuda) ordenadas.
function obligaciones(now = Date.now()) {
  const out = [];
  fixedCosts.totales(now); // asegura carga
  const store = require("./data-store");
  store.readAll("fixed_costs").filter((f) => f.active !== false && f.periodicity !== "one_time").forEach((f) => {
    out.push({ tipo: "fijo", nombre: f.name, categoria: f.category || "Otros", importe_mes: eur(fixedCosts.prorrateo(f).mensual), dia_pago: f.payment_day || null });
  });
  debtsMod.resumen(now).deudas.forEach((d) => {
    out.push({ tipo: "deuda", nombre: d.name, categoria: d.tipo_label, importe_mes: eur(d.monthly_payment), dia_pago: d.payment_day || null, proximo: d.proximo_vencimiento });
  });
  return out.sort((a, b) => b.importe_mes - a.importe_mes);
}

// EMERGENCY MONITOR · detecta problemas de liquidez antes de que se vean.
function emergencyMonitor(now = Date.now(), liquidezInmediata = 0) {
  const rw = forecast.runwayCaja();
  const prox = treasury.proximos(now).proximos_pagos || [];

  // Simula el saldo aplicando los próximos pagos: ¿cuándo se vuelve negativo?
  let saldo = liquidezInmediata;
  const eventosNegativos = [];
  prox.forEach((p) => {
    saldo = eur(saldo - p.importe);
    if (saldo < 0) eventosNegativos.push({ fecha: p.fecha, concepto: p.concepto, importe: p.importe, saldo_tras: saldo });
  });

  let nivel = "bajo";
  if (rw.disponible && rw.en_riesgo) nivel = rw.dias_hasta_cero <= 15 ? "alto" : rw.dias_hasta_cero <= 45 ? "medio" : "bajo";
  if (eventosNegativos.length) nivel = "alto";

  const obl = obligaciones(now);
  const criticas = obl.slice(0, 3);
  let accion = "La tesorería está bajo control.";
  if (nivel === "alto") accion = eventosNegativos.length ? "Un pago próximo dejará la caja en negativo: adelanta cobros o renegocia ese pago." : "La liquidez cae rápido: recorta gasto o inyecta caja esta semana.";
  else if (nivel === "medio") accion = "Vigila la liquidez: revisa cobros pendientes y aplaza gastos no críticos.";

  return {
    nivel_riesgo: nivel,
    dias_hasta_problema: rw.disponible && rw.en_riesgo ? rw.dias_hasta_cero : null,
    fecha_estimada: rw.disponible && rw.en_riesgo ? rw.fecha_estimada : null,
    eventos_negativos: eventosNegativos.slice(0, 5),
    obligaciones_criticas: criticas,
    accion,
  };
}

// BUSINESS VALUE ENGINE · patrimonio neto + previsión + hueco de fondo de comercio.
function valorEmpresa(now = Date.now(), patr) {
  const p = patr || financials.patrimonioNeto(now);
  const fc30 = forecast.proyectar("patrimonio_neto", 30);
  const fc90 = forecast.proyectar("patrimonio_neto", 90);
  return {
    ...p,
    goodwill: 0,                 // fondo de comercio (preparado para valoración futura)
    valor_negocio: p.patrimonio_neto, // hoy = patrimonio; futuro: + goodwill/valoración
    forecast_30d: fc30.disponible ? fc30.valor_horizonte : null,
    forecast_90d: fc90.disponible ? fc90.valor_horizonte : null,
  };
}

// Punto de entrada: el sistema operativo de tesorería completo (una llamada).
function sistemaOperativo(now = Date.now(), localId = "principal") {
  const costeDiario = financials.costeMedioDiario(now);
  const base = treasury.resumen(now, costeDiario);      // liquidez, pendientes, runway, próximos
  const patr = financials.patrimonioNeto(now);
  const extras = financials.extrasFinancieros(now);
  const liqAv = treasury.liquidezAvanzada(now, { patrimonio: patr, monthlyBurn: extras.monthly_burn });
  const deuda = debtsMod.resumen(now);
  const cf = cashflow.resumen(now);
  const vEmpresa = valorEmpresa(now, patr);

  // Comprometido a corto plazo (≈ 1 mes) y disponible.
  const comprometido = eur(base.pagos_pendientes + base.iva_pendiente + base.irpf_pendiente + base.ss_pendiente + extras.expected_fixed_costs + deuda.cuota_mensual_total);
  const disponible = eur(base.liquidez_inmediata - comprometido);

  const emergency = emergencyMonitor(now, base.liquidez_inmediata);

  const dashboard = {
    caja: base.caja, banco: base.banco,
    liquidez_inmediata: base.liquidez_inmediata,
    disponible, comprometido,
    cobros_pendientes: base.cobros_pendientes,
    pagos_pendientes: base.pagos_pendientes,
    iva_pendiente: base.iva_pendiente, irpf_pendiente: base.irpf_pendiente, ss_pendiente: base.ss_pendiente,
    valor_almacen: patr.valor_almacen, valor_produccion: patr.valor_produccion, valor_activos: patr.valor_activos,
    deuda_pendiente: patr.deuda_pendiente,
    patrimonio_neto: patr.patrimonio_neto, valor_negocio: vEmpresa.valor_negocio,
    runway: base.dias_supervivencia,
    ratio_liquidez: liqAv.ratio_liquidez,
    fondo_maniobra: liqAv.fondo_maniobra,
    reserva_objetivo: liqAv.reserva_objetivo, reserva_cubierta_pct: liqAv.reserva_cubierta_pct,
    burn_mensual: extras.monthly_burn,
  };

  // Forecast de tesorería (7–365) para caja/liquidez/valor de empresa.
  const fcTesoreria = {
    liquidez: forecast.horizontes("liquidez", localId).horizontes,
    patrimonio_neto: forecast.horizontes("patrimonio_neto", localId).horizontes,
  };

  return {
    generado_en: new Date(now).toISOString(),
    dashboard,
    liquidez: liqAv,
    cashflow: cf,
    valor_empresa: vEmpresa,
    obligaciones: obligaciones(now),
    emergency,
    forecast: fcTesoreria,
    proximos_pagos: base.proximos_pagos, proximos_cobros: base.proximos_cobros,
  };
}

module.exports = { sistemaOperativo, emergencyMonitor, obligaciones, valorEmpresa };
