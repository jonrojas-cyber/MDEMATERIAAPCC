// TESORERÍA · liquidez, cobros/pagos pendientes, impuestos pendientes y "días de
// supervivencia" (runway). El coste medio diario para el runway lo aporta quien
// llama (financials.js), para no duplicar la fórmula del coste operativo.

const store = require("./data-store");
const debtsMod = require("./debts");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Liquidez a partir de las cuentas de dinero (caja + banco).
function liquidez(cuentas = null) {
  const acc = (cuentas || store.readAll("financial_accounts")).filter((c) => c.active !== false);
  const caja = eur(acc.filter((c) => c.type === "caja").reduce((s, c) => s + (Number(c.balance) || 0), 0));
  const banco = eur(acc.filter((c) => c.type !== "caja").reduce((s, c) => s + (Number(c.balance) || 0), 0));
  return { caja, banco, liquidez_inmediata: eur(caja + banco), num_cuentas: acc.length };
}

// Movimientos previstos (no ejecutados) separados en cobros y pagos, con impuestos.
function pendientes(now = Date.now(), movs = null) {
  const previstos = (movs || store.readAll("treasury_movements")).filter((m) => m.estado !== "hecho");
  const suma = (f) => eur(previstos.filter(f).reduce((s, m) => s + (Number(m.importe) || 0), 0));
  const esImpuesto = (cat) => (m) => (m.categoria || "").toLowerCase() === cat;
  return {
    cobros_pendientes: suma((m) => m.tipo === "cobro"),
    pagos_pendientes: suma((m) => m.tipo === "pago" && !["iva", "irpf", "seguridad_social"].includes((m.categoria || "").toLowerCase())),
    iva_pendiente: suma(esImpuesto("iva")),
    irpf_pendiente: suma(esImpuesto("irpf")),
    ss_pendiente: suma(esImpuesto("seguridad_social")),
  };
}

// Próximos pagos y cobros ordenados por fecha (incluye vencimientos de deuda).
function proximos(now = Date.now(), opts = {}) {
  const movs = (opts.movs || store.readAll("treasury_movements")).filter((m) => m.estado !== "hecho" && m.fecha);
  const items = movs.map((m) => ({
    tipo: m.tipo, concepto: m.concepto || m.categoria || "Movimiento",
    importe: eur(m.importe), fecha: new Date(m.fecha).getTime(), origen: "tesoreria",
  }));
  // Vencimientos de deuda como pagos futuros.
  const deudas = debtsMod.resumen(now, opts.debts).deudas;
  deudas.forEach((d) => {
    if (d.proximo_vencimiento) items.push({ tipo: "pago", concepto: `Cuota · ${d.name}`, importe: eur(d.monthly_payment), fecha: d.proximo_vencimiento, origen: "deuda" });
  });
  const futuros = items.filter((x) => x.fecha >= now - 86400000).sort((a, b) => a.fecha - b.fecha);
  return {
    proximos_pagos: futuros.filter((x) => x.tipo === "pago").slice(0, 8),
    proximos_cobros: futuros.filter((x) => x.tipo === "cobro").slice(0, 8),
  };
}

// Runway: días que la empresa puede operar sin ingresos con la liquidez actual.
// costeMedioDiario lo calcula financials.js (fijos + laboral + variable medio).
function runway(liquidezInmediata, costeMedioDiario) {
  const c = Number(costeMedioDiario) || 0;
  if (c <= 0) return null; // sin coste conocido no se puede estimar
  return Math.round((Number(liquidezInmediata) || 0) / c);
}

// Resumen completo de tesorería.
function resumen(now = Date.now(), costeMedioDiario = 0, opts = {}) {
  const liq = liquidez(opts.cuentas);
  const pend = pendientes(now, opts.movs);
  const prox = proximos(now, opts);
  return {
    ...liq,
    ...pend,
    dias_supervivencia: runway(liq.liquidez_inmediata, costeMedioDiario),
    coste_medio_diario: eur(costeMedioDiario),
    ...prox,
  };
}

// ── LIQUIDITY ENGINE ────────────────────────────────────────────────────────
// Fondo de maniobra, reserva de emergencia, ratio de liquidez, margen de
// seguridad y burn. Cálculo centralizado (nadie más lo recalcula).
// Se le inyectan cifras ya calculadas (patrimonio, burn) para no reescanear.
function liquidezAvanzada(now = Date.now(), opts = {}) {
  const store = require("./data-store");
  const financials = require("./financials");
  const debtsMod = require("./debts");
  const liq = liquidez(opts.cuentas);
  const pend = pendientes(now, opts.movs);
  const patr = opts.patrimonio || financials.patrimonioNeto(now);
  const burn = opts.monthlyBurn != null ? opts.monthlyBurn : financials.extrasFinancieros(now).monthly_burn;
  const cuota = debtsMod.resumen(now).cuota_mensual_total;

  // Activo corriente vs pasivo corriente (corto plazo).
  const activoCorriente = eur(liq.liquidez_inmediata + pend.cobros_pendientes + patr.valor_almacen + patr.valor_produccion);
  const pasivoCorriente = eur(pend.pagos_pendientes + pend.iva_pendiente + pend.irpf_pendiente + pend.ss_pendiente + cuota);
  const fondoManiobra = eur(activoCorriente - pasivoCorriente);
  const ratio = pasivoCorriente > 0 ? Math.round((activoCorriente / pasivoCorriente) * 100) / 100 : null;

  // Reserva de emergencia: objetivo configurable (reserva_caja) vs liquidez real.
  const targets = require("./targets");
  const objReserva = (targets.lista().find((t) => t.tipo === "reserva_caja") || {}).valor;
  const reservaObjetivo = objReserva != null ? Number(objReserva) : eur(burn * 2); // 2 meses de burn por defecto
  const mesesBuffer = burn > 0 ? Math.round((liq.liquidez_inmediata / burn) * 10) / 10 : null;

  return {
    liquidez_inmediata: liq.liquidez_inmediata,
    activo_corriente: activoCorriente,
    pasivo_corriente: pasivoCorriente,
    fondo_maniobra: fondoManiobra,
    ratio_liquidez: ratio,
    burn_mensual: eur(burn),
    meses_de_buffer: mesesBuffer,
    reserva_objetivo: eur(reservaObjetivo),
    reserva_actual: liq.liquidez_inmediata,
    reserva_cubierta_pct: reservaObjetivo > 0 ? Math.round((liq.liquidez_inmediata / reservaObjetivo) * 100) : null,
    margen_seguridad: eur(liq.liquidez_inmediata - reservaObjetivo),
  };
}

module.exports = { liquidez, pendientes, proximos, runway, resumen, liquidezAvanzada, eur };
