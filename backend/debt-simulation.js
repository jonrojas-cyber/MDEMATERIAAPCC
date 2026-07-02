// DEBT SIMULATION ENGINE · simulador de decisiones de financiación.
// Responde "¿y si...?": amortizar hoy, amortizar dentro de N meses, subir la
// cuota, refinanciar a otra tasa/plazo o consolidar varias deudas. Devuelve el
// interés ahorrado, el impacto en caja y en el servicio de deuda mensual.
// Compone DebtEngine (amortización): no duplica cálculo de intereses.

const debtsMod = require("./debts");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function deudaPorId(id) {
  const d = require("./data-store").findById("debts", id);
  return d && debtsMod.activa(d) ? d : null;
}

// Interés total programado de una deuda con parámetros opcionales (para comparar).
function interesTotal(d, now, opts = {}) {
  return debtsMod.amortizacion(d, now, opts).total_intereses;
}

// Amortizar hoy: cancelas el saldo → te ahorras TODO el interés futuro.
function amortizarHoy(d, now) {
  const base = interesTotal(d, now);
  return {
    tipo: "amortizar_hoy",
    interes_ahorrado: base,
    impacto_caja: -eur(Number(d.outstanding_amount) || 0),   // sale el saldo de golpe
    cuota_liberada_mes: eur(Number(d.monthly_payment) || 0),
    explicacion: `Cancelar hoy "${d.name}" ahorra ${base} € de intereses y libera ${eur(Number(d.monthly_payment) || 0)} €/mes.`,
  };
}

// Amortizar dentro de N meses: pagas cuotas hasta el mes N y luego cancelas el
// saldo restante → ahorras el interés de las cuotas posteriores.
function amortizarEn(d, now, meses) {
  const cuadro = debtsMod.amortizacion(d, now).cuadro;
  const m = Math.max(0, Math.min(Number(meses) || 0, cuadro.length));
  const interesHastaM = cuadro.slice(0, m).reduce((s, c) => s + c.interes, 0);
  const interesTotalD = cuadro.reduce((s, c) => s + c.interes, 0);
  const ahorro = eur(interesTotalD - interesHastaM);
  const saldoEnM = m > 0 ? cuadro[m - 1].saldo : (Number(d.outstanding_amount) || 0);
  return {
    tipo: "amortizar_en", meses: m,
    interes_ahorrado: ahorro,
    impacto_caja: -eur(saldoEnM),
    explicacion: `Cancelar "${d.name}" dentro de ${m} meses ahorra ${ahorro} € de intereses (saldo a cancelar entonces: ${eur(saldoEnM)} €).`,
  };
}

// Subir la cuota mensual: amortizas más rápido → menos intereses.
function subirCuota(d, now, nuevaCuota) {
  const base = interesTotal(d, now);
  const nueva = interesTotal(d, now, { sistema: "french", monthly_payment: Number(nuevaCuota) || 0, n: null });
  const cuadroNuevo = debtsMod.amortizacion(d, now, { sistema: "french", monthly_payment: Number(nuevaCuota) || 0, n: null });
  const ahorro = eur(base - nueva);
  return {
    tipo: "subir_cuota", nueva_cuota: eur(Number(nuevaCuota) || 0),
    interes_ahorrado: ahorro,
    cuotas_nuevas: cuadroNuevo.cuotas,
    impacto_caja_mensual: -eur((Number(nuevaCuota) || 0) - (Number(d.monthly_payment) || 0)),
    explicacion: `Subir la cuota de "${d.name}" a ${eur(Number(nuevaCuota) || 0)} €/mes ahorra ${ahorro} € y salda la deuda en ${cuadroNuevo.cuotas} meses.`,
  };
}

// Refinanciar: misma deuda, nueva tasa y/o plazo (sistema francés).
function refinanciar(d, now, nuevaTasa, nuevoPlazoMeses) {
  const base = interesTotal(d, now);
  const dRef = { ...d, interest_rate: Number(nuevaTasa) != null ? Number(nuevaTasa) : d.interest_rate };
  const nuevo = debtsMod.amortizacion(dRef, now, { sistema: "french", n: Number(nuevoPlazoMeses) || debtsMod.cuotasRestantes(d, now), monthly_payment: null });
  const ahorro = eur(base - nuevo.total_intereses);
  const nuevaCuota = nuevo.cuadro.length ? nuevo.cuadro[0].cuota : 0;
  return {
    tipo: "refinanciar", nueva_tasa: Number(nuevaTasa), nuevo_plazo_meses: nuevo.cuotas,
    interes_ahorrado: ahorro,
    nueva_cuota: nuevaCuota,
    impacto_caja_mensual: -eur(nuevaCuota - (Number(d.monthly_payment) || 0)),
    explicacion: `Refinanciar "${d.name}" al ${Number(nuevaTasa)}% en ${nuevo.cuotas} meses: cuota ${nuevaCuota} €/mes y ${ahorro >= 0 ? "ahorro" : "coste extra"} de ${Math.abs(ahorro)} € en intereses.`,
  };
}

// Consolidar varias deudas en una nueva (nueva tasa/plazo). Une los saldos.
function consolidar(ids, now, nuevaTasa, plazoMeses) {
  const deudas = (ids || []).map(deudaPorId).filter(Boolean);
  if (deudas.length < 2) return { tipo: "consolidar", error: "Indica al menos dos deudas activas." };
  const saldoTotal = eur(deudas.reduce((s, d) => s + (Number(d.outstanding_amount) || 0), 0));
  const cuotaActual = eur(deudas.reduce((s, d) => s + (Number(d.monthly_payment) || 0), 0));
  const interesActual = eur(deudas.reduce((s, d) => s + interesTotal(d, now), 0));
  const nueva = debtsMod.amortizacion({ outstanding_amount: saldoTotal, interest_rate: Number(nuevaTasa) || 0, type: "loan" }, now, { sistema: "french", n: Number(plazoMeses) || 60 });
  const nuevaCuota = nueva.cuadro.length ? nueva.cuadro[0].cuota : 0;
  return {
    tipo: "consolidar",
    saldo_consolidado: saldoTotal,
    nueva_tasa: Number(nuevaTasa), nuevo_plazo_meses: nueva.cuotas,
    nueva_cuota: nuevaCuota, cuota_actual: cuotaActual,
    interes_ahorrado: eur(interesActual - nueva.total_intereses),
    impacto_caja_mensual: -eur(nuevaCuota - cuotaActual),
    explicacion: `Consolidar ${deudas.length} deudas (${saldoTotal} €) al ${Number(nuevaTasa)}% en ${nueva.cuotas} meses: una sola cuota de ${nuevaCuota} €/mes (antes ${cuotaActual} €/mes).`,
  };
}

// Punto de entrada: despacha por tipo de simulación.
function simular(params = {}) {
  const now = params.now || Date.now();
  const tipo = params.tipo;
  if (tipo === "consolidar") return consolidar(params.ids, now, params.nueva_tasa, params.plazo_meses);
  const d = deudaPorId(params.debt_id);
  if (!d) return { tipo, error: "Deuda no encontrada o ya pagada." };
  switch (tipo) {
    case "amortizar_hoy": return amortizarHoy(d, now);
    case "amortizar_en": return amortizarEn(d, now, params.meses);
    case "subir_cuota": return subirCuota(d, now, params.nueva_cuota);
    case "refinanciar": return refinanciar(d, now, params.nueva_tasa, params.plazo_meses);
    default: return { tipo, error: "Tipo de simulación no soportado." };
  }
}

module.exports = { simular, amortizarHoy, amortizarEn, subirCuota, refinanciar, consolidar };
