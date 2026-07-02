// DEBT ANALYTICS + FINANCING CAPACITY + DEBT FORECAST ENGINES
// Convierte la deuda en inteligencia estratégica: ratios de apalancamiento,
// capacidad de financiación segura, previsión de saldo/intereses y alertas de IA
// (apalancamiento peligroso, préstamos caros, oportunidades de refinanciación,
// concentración de pagos). NO recalcula dinero: compone DebtEngine (debts.js),
// financials (ingresos/EBITDA/patrimonio) y treasury (liquidez).

const debtsMod = require("./debts");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function ratio(a, b) { return b > 0 ? Math.round((a / b) * 100) / 100 : null; }
const MES = 365 / 12;

// Contexto financiero (ingresos anuales, EBITDA anual, patrimonio, activos, caja,
// valor de negocio). Lazy-require para romper el ciclo financials→debts.
function contextoFinanciero(now) {
  const financials = require("./financials");
  const treasury = require("./treasury");
  const periods = require("./periods");
  const patr = financials.patrimonioNeto(now);
  const extras = financials.extrasFinancieros(now);
  const benMes = financials.beneficio(periods.rango("mes", now), now);
  const liq = treasury.liquidez();
  const ingresosAnuales = eur((benMes.ventas / MES) * 365); // anualiza el ritmo del mes
  const ebitdaAnual = eur((extras.ebitda_mes || 0) * 12);
  const activosTotales = eur(liq.caja + liq.banco + patr.valor_almacen + patr.valor_produccion + patr.valor_activos + patr.cobros_pendientes);
  return {
    ingresos_anuales: ingresosAnuales,
    ebitda_mensual: eur(extras.ebitda_mes || 0),
    ebitda_anual: ebitdaAnual,
    patrimonio_neto: patr.patrimonio_neto,
    activos_totales: activosTotales,
    liquidez: liq.liquidez_inmediata,
    valor_negocio: patr.patrimonio_neto,
  };
}

// ── DEBT RATIOS ─────────────────────────────────────────────────────────────
function ratios(now = Date.now(), ctx = null, res = null) {
  const r = res || debtsMod.resumen(now);
  const c = ctx || contextoFinanciero(now);
  const D = r.deuda_total;
  return {
    deuda_ingresos: ratio(D, c.ingresos_anuales),   // < 1 sano
    deuda_ebitda: ratio(D, c.ebitda_anual),          // < 3 sano, > 4 tensión
    deuda_patrimonio: ratio(D, c.patrimonio_neto),   // < 1.5 sano
    deuda_activos: ratio(D, c.activos_totales),      // < 0.6 sano
    deuda_caja: ratio(D, c.liquidez),
    deuda_valor: ratio(D, c.valor_negocio),
    servicio_deuda_ebitda: c.ebitda_mensual > 0 ? Math.round((r.cuota_mensual_total / c.ebitda_mensual) * 100) : null, // % de EBITDA que se va en cuota
    contexto: c,
  };
}

// Velocidad de reducción de deuda (€/día) y crecimiento, desde el histórico.
function evolucion(now = Date.now(), localId = "principal") {
  try {
    const timeline = require("./timeline");
    const d = timeline.delta("deuda_total", localId);
    if (!d.disponible) return { disponible: false };
    return {
      disponible: true,
      tendencia: d.tendencia,                         // sube / baja / estable
      velocidad_dia: d.velocidad_dia,                 // €/día (negativo = amortizando)
      reduccion_mensual: eur(-d.velocidad_dia * MES), // €/mes que se reduce (positivo = baja)
      delta_mes: d.mes,
    };
  } catch (e) { return { disponible: false }; }
}

// ── DEBT FORECAST ENGINE ────────────────────────────────────────────────────
// Previsión de la deuda: histórico (regresión sobre snapshots) + proyección
// programada (suma de cuadros de amortización de todas las deudas activas).
function forecast(now = Date.now(), res = null, localId = "principal") {
  const r = res || debtsMod.resumen(now);
  // Proyección programada: saldo total tras 6 / 12 / 24 meses según amortización.
  const cuadros = r.deudas.map((d) => debtsMod.amortizacion(d, now).cuadro);
  const saldoTras = (meses) => eur(cuadros.reduce((s, cuadro) => {
    if (!cuadro.length) return s;
    const idx = Math.min(meses, cuadro.length) - 1;
    return s + (idx >= 0 ? cuadro[idx].saldo : 0);
  }, 0));
  const interesesTras = (meses) => eur(cuadros.reduce((s, cuadro) => s + cuadro.slice(0, meses).reduce((a, c) => a + c.interes, 0), 0));
  const programado = {
    saldo_6m: saldoTras(6), saldo_12m: saldoTras(12), saldo_24m: saldoTras(24),
    intereses_12m: interesesTras(12),
    intereses_totales: eur(cuadros.reduce((s, cuadro) => s + cuadro.reduce((a, c) => a + c.interes, 0), 0)),
    libre_de_deuda: r.fecha_final_estimada,
  };
  let historico = { disponible: false };
  try {
    const fc = require("./forecast");
    const h = fc.horizontes("deuda_total", localId);
    if (h.disponible) historico = { disponible: true, horizontes: h.horizontes };
  } catch (e) { /* sin histórico: solo proyección programada */ }
  return { programado, historico };
}

// ── FINANCING CAPACITY ENGINE ───────────────────────────────────────────────
// ¿Cuánta deuda más puede asumir el negocio con seguridad? Regla prudente: el
// servicio de deuda no debería superar ~35% del EBITDA mensual, y la deuda total
// no debería pasar de 3× EBITDA anual.
function capacidad(now = Date.now(), ctx = null, res = null) {
  const r = res || debtsMod.resumen(now);
  const c = ctx || contextoFinanciero(now);
  const LIMITE_SERVICIO = 0.35;   // % del EBITDA mensual en cuotas
  const LIMITE_DEUDA_EBITDA = 3;  // deuda / EBITDA anual

  const pagoMaximo = eur(c.ebitda_mensual * LIMITE_SERVICIO);
  const margenPago = eur(Math.max(0, pagoMaximo - r.cuota_mensual_total));
  // Deuda adicional que ese margen de pago soporta (francés, 60 meses, tasa media).
  const iMes = (r.tasa_media || 5) / 100 / 12;
  const n = 60;
  const deudaPorMargen = iMes > 0 ? margenPago * (1 - Math.pow(1 + iMes, -n)) / iMes : margenPago * n;
  // Límite por apalancamiento (deuda/EBITDA ≤ 3).
  const deudaPorEbitda = eur(Math.max(0, c.ebitda_anual * LIMITE_DEUDA_EBITDA - r.deuda_total));
  const deudaMaxSegura = eur(Math.max(0, Math.min(deudaPorMargen, deudaPorEbitda)));

  // Riesgo si se aceptara ese préstamo: ¿en qué deja el ratio deuda/EBITDA?
  const ratioTrasMax = c.ebitda_anual > 0 ? Math.round(((r.deuda_total + deudaMaxSegura) / c.ebitda_anual) * 100) / 100 : null;

  let nivel = "saludable";
  const dEbitda = c.ebitda_anual > 0 ? r.deuda_total / c.ebitda_anual : null;
  if (dEbitda != null) { if (dEbitda >= 4) nivel = "alto"; else if (dEbitda >= 3) nivel = "tenso"; else if (dEbitda >= 2) nivel = "moderado"; }
  if (c.ebitda_anual <= 0 && r.deuda_total > 0) nivel = "sin_ebitda";

  return {
    pago_maximo_mensual: pagoMaximo,
    margen_pago_mensual: margenPago,
    deuda_adicional_segura: deudaMaxSegura,
    limite_recomendado_total: eur(c.ebitda_anual * LIMITE_DEUDA_EBITDA),
    ratio_deuda_ebitda_actual: dEbitda != null ? Math.round(dEbitda * 100) / 100 : null,
    ratio_tras_maximo: ratioTrasMax,
    nivel_apalancamiento: nivel,
    puede_financiar: deudaMaxSegura > 0,
  };
}

// ── DEBT ANALYTICS ENGINE (IA) ──────────────────────────────────────────────
function alertas(now = Date.now(), ctx = null, res = null) {
  const r = res || debtsMod.resumen(now);
  const c = ctx || contextoFinanciero(now);
  const out = [];
  const cap = capacidad(now, c, r);

  // 1) Apalancamiento peligroso (deuda/EBITDA alto).
  if (cap.ratio_deuda_ebitda_actual != null && cap.ratio_deuda_ebitda_actual >= 4) {
    out.push({ tipo: "apalancamiento", severidad: "importante",
      titulo: "Apalancamiento elevado",
      detalle: `La deuda es ${cap.ratio_deuda_ebitda_actual}× tu EBITDA anual (sano < 3×). Prioriza amortizar antes de asumir más financiación.`,
      accion: "reducir" });
  } else if (c.ebitda_anual <= 0 && r.deuda_total > 0) {
    out.push({ tipo: "apalancamiento", severidad: "importante",
      titulo: "Deuda sin EBITDA que la respalde",
      detalle: "Hay deuda pero el negocio no genera beneficio operativo suficiente para sostenerla con holgura.",
      accion: "reducir" });
  }

  // 2) Préstamo caro / oportunidad de refinanciación (tasa por encima de la media
  //    del mercado prudente ~8%, o muy por encima de la tasa media de la cartera).
  r.deudas.forEach((d) => {
    const tasa = Number(d.interest_rate) || 0;
    if (tasa >= 8 && (Number(d.outstanding_amount) || 0) >= 500) {
      const ahorro = eur((Number(d.outstanding_amount) || 0) * (tasa - 5) / 100); // ahorro anual aprox. si baja a ~5%
      out.push({ tipo: "refinanciar", severidad: tasa >= 12 ? "importante" : "info",
        titulo: `Préstamo caro: ${d.name} (${tasa}%)`,
        detalle: `Renegociar o refinanciar a una tasa de mercado podría ahorrar ~${ahorro} €/año.`,
        ahorro_anual: ahorro, debt_id: d.id, accion: "refinanciar" });
    }
  });

  // 3) Concentración de pagos: una sola deuda concentra gran parte de la cuota.
  if (r.cuota_mensual_total > 0 && r.deudas.length > 1) {
    const mayorCuota = r.deudas.slice().sort((a, b) => (b.monthly_payment || 0) - (a.monthly_payment || 0))[0];
    const pct = Math.round(((Number(mayorCuota.monthly_payment) || 0) / r.cuota_mensual_total) * 100);
    if (pct >= 70) out.push({ tipo: "concentracion", severidad: "info",
      titulo: "Concentración de pagos",
      detalle: `${pct}% de tu cuota mensual depende de "${mayorCuota.name}". Diversificar o consolidar reduce el riesgo.`,
      accion: "consolidar" });
  }

  // 4) Estrés de caja por deuda: cuota mensual alta frente a la liquidez.
  if (r.cuota_mensual_total > 0 && c.liquidez > 0) {
    const meses = c.liquidez / r.cuota_mensual_total;
    if (meses < 2) out.push({ tipo: "estres_caja", severidad: "importante",
      titulo: "Estrés de caja por deuda",
      detalle: `Tu liquidez cubre solo ${Math.round(meses * 10) / 10} meses de cuota. Un imprevisto podría tensar los pagos.`,
      accion: "reforzar_caja" });
  }

  const orden = { importante: 0, info: 1 };
  out.sort((a, b) => (orden[a.severidad] - orden[b.severidad]) || ((b.ahorro_anual || 0) - (a.ahorro_anual || 0)));
  const ahorroTotal = eur(out.reduce((s, x) => s + (x.ahorro_anual || 0), 0));
  return { alertas: out, ahorro_anual_potencial: ahorroTotal, n: out.length };
}

module.exports = { contextoFinanciero, ratios, evolucion, forecast, capacidad, alertas, eur };
