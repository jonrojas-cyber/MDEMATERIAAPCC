// DEUDA · préstamos, leasing, renting, tarjetas, deuda fiscal y con Seguridad Social.
// Todo lo que la empresa debe. Alimenta el patrimonio neto (resta) y la tesorería
// (próximos vencimientos). No duplica costes fijos: la cuota de deuda NO se suma
// al "coste de abrir la persiana" (es financiación, no coste operativo).

const store = require("./data-store");

const TIPOS = [
  "loan", "credit_line", "leasing", "renting",
  "credit_card", "supplier_debt", "tax_debt", "social_security", "other",
];

const TIPO_LABEL = {
  loan: "Préstamo",
  credit_line: "Línea de crédito",
  leasing: "Leasing",
  renting: "Renting",
  credit_card: "Tarjeta de crédito",
  supplier_debt: "Deuda con proveedor",
  tax_debt: "Deuda con Hacienda",
  social_security: "Seguridad Social",
  other: "Otra",
};

// Sistemas de amortización soportados (arquitectura abierta a más).
const SISTEMAS = ["french", "german", "american", "interest_only", "custom"];
const SISTEMA_LABEL = {
  french: "Francés (cuota constante)",
  german: "Alemán (capital constante)",
  american: "Americano (interés + capital al final)",
  interest_only: "Solo interés",
  custom: "Personalizado",
};

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

function activa(d) {
  return d.status !== "pagada" && d.status !== "cerrada" && (Number(d.outstanding_amount) || 0) > 0;
}

// Cuotas restantes estimadas de una deuda: por end_date si existe, si no por
// pendiente/cuota. Se etiqueta internamente como estimación.
function cuotasRestantes(d, now = Date.now()) {
  const pend = Number(d.outstanding_amount) || 0;
  const cuota = Number(d.monthly_payment) || 0;
  if (d.end_date) {
    const fin = new Date(d.end_date).getTime();
    if (Number.isFinite(fin) && fin > now) {
      const meses = (fin - now) / (365 / 12 * 86400000);
      return Math.max(0, Math.ceil(meses));
    }
  }
  if (cuota > 0 && pend > 0) return Math.ceil(pend / cuota);
  return null;
}

// Próximo vencimiento (fecha) según payment_day. Estimación de calendario.
function proximoVencimiento(d, now = Date.now()) {
  const day = Number(d.payment_day);
  if (!day || day < 1 || day > 31) return null;
  const ref = new Date(now);
  let y = ref.getFullYear();
  let m = ref.getMonth();
  if (ref.getDate() >= day) m += 1; // ya pasó este mes → el que viene
  return new Date(y, m, day).getTime();
}

// Intereses estimados restantes: (cuota × cuotas) − pendiente. Nunca negativo.
function interesesEstimados(d, now = Date.now()) {
  const cuota = Number(d.monthly_payment) || 0;
  const n = cuotasRestantes(d, now);
  const pend = Number(d.outstanding_amount) || 0;
  if (!cuota || n == null) return 0;
  return Math.max(0, eur(cuota * n - pend));
}

function decorar(d, now = Date.now()) {
  return {
    ...d,
    tipo_label: TIPO_LABEL[d.type] || TIPO_LABEL.other,
    activa: activa(d),
    cuotas_restantes: cuotasRestantes(d, now),
    proximo_vencimiento: proximoVencimiento(d, now),
    intereses_estimados: interesesEstimados(d, now),
  };
}

// ── CUADRO DE AMORTIZACIÓN ──────────────────────────────────────────────────
// Genera el calendario de pagos RESTANTE de una deuda desde su saldo pendiente.
// Sistemas: francés (cuota constante), alemán (capital constante), americano /
// solo interés (interés cada periodo + capital al final) y personalizado (cuota
// fija hasta amortizar). Fuente única del reparto interés/capital de cada cuota.
function amortizacion(d, now = Date.now(), opts = {}) {
  const saldo0 = Number(d.outstanding_amount) || 0;
  const iMes = (Number(d.interest_rate) || 0) / 100 / 12; // tasa mensual
  const sistema = opts.sistema || d.amortization_system || (d.type === "credit_line" || d.type === "credit_card" ? "interest_only" : "french");
  let n = opts.n != null ? opts.n : cuotasRestantes(d, now);
  const cuotaFija = opts.monthly_payment != null ? Number(opts.monthly_payment) : (Number(d.monthly_payment) || 0);
  if (saldo0 <= 0) return { sistema, cuadro: [], total_intereses: 0, total_pagado: 0, cuotas: 0 };

  // Fecha de la primera cuota restante (según payment_day, si hay).
  const primera = proximoVencimiento(d, now) || now;
  const MES = 365 / 12 * 86400000;
  const cuadro = [];
  let saldo = saldo0;
  const MAX = 720; // tope de seguridad (60 años)

  // Deriva nº de cuotas si falta y hay cuota fija (francés/personalizado).
  if ((n == null || n <= 0) && cuotaFija > 0) {
    if (iMes > 0 && cuotaFija > saldo0 * iMes) n = Math.ceil(Math.log(cuotaFija / (cuotaFija - saldo0 * iMes)) / Math.log(1 + iMes));
    else n = Math.ceil(saldo0 / cuotaFija);
  }
  n = n && n > 0 ? Math.min(n, MAX) : null;

  // Cuota del sistema francés si no viene dada.
  let cuotaFrancesa = cuotaFija;
  if (sistema === "french" && !(cuotaFrancesa > 0) && n) {
    cuotaFrancesa = iMes > 0 ? saldo0 * iMes / (1 - Math.pow(1 + iMes, -n)) : saldo0 / n;
  }
  const capitalConstante = (sistema === "german" && n) ? saldo0 / n : 0;

  for (let k = 0; k < (n || MAX) && saldo > 0.005; k++) {
    const interes = saldo * iMes;
    let principal;
    let cuota;
    if (sistema === "german") { principal = capitalConstante; cuota = principal + interes; }
    else if (sistema === "american" || sistema === "interest_only") {
      const ultimo = n ? k === n - 1 : false;
      principal = ultimo ? saldo : 0; cuota = interes + principal;
    } else { // french / custom
      cuota = sistema === "custom" ? cuotaFija : (cuotaFrancesa || cuotaFija);
      if (!(cuota > 0)) break;
      principal = cuota - interes;
      if (principal <= 0) break; // la cuota no cubre ni el interés: no amortiza
    }
    if (principal > saldo) { principal = saldo; cuota = principal + interes; }
    saldo = eur(saldo - principal);
    cuadro.push({ periodo: k + 1, fecha: primera + k * MES, cuota: eur(cuota), interes: eur(interes), principal: eur(principal), saldo });
  }
  const totalIntereses = eur(cuadro.reduce((s, c) => s + c.interes, 0));
  const totalPagado = eur(cuadro.reduce((s, c) => s + c.cuota, 0));
  return { sistema, sistema_label: SISTEMA_LABEL[sistema] || sistema, cuadro, total_intereses: totalIntereses, total_pagado: totalPagado, cuotas: cuadro.length };
}

// Tasa de interés media ponderada por saldo pendiente (%).
function tasaMediaPonderada(activas) {
  const total = activas.reduce((s, d) => s + (Number(d.outstanding_amount) || 0), 0);
  if (total <= 0) return 0;
  const suma = activas.reduce((s, d) => s + (Number(d.outstanding_amount) || 0) * (Number(d.interest_rate) || 0), 0);
  return Math.round((suma / total) * 100) / 100;
}

// Duración media restante ponderada por saldo (meses).
function duracionMediaRestante(activas, now = Date.now()) {
  const total = activas.reduce((s, d) => s + (Number(d.outstanding_amount) || 0), 0);
  if (total <= 0) return 0;
  const suma = activas.reduce((s, d) => { const n = cuotasRestantes(d, now) || 0; return s + (Number(d.outstanding_amount) || 0) * n; }, 0);
  return Math.round((suma / total) * 10) / 10;
}

// Distribución de la deuda por tipo (para el gráfico de reparto).
function distribucion(activas) {
  const total = activas.reduce((s, d) => s + (Number(d.outstanding_amount) || 0), 0);
  const g = {};
  activas.forEach((d) => { const t = d.type || "other"; g[t] = (g[t] || 0) + (Number(d.outstanding_amount) || 0); });
  return Object.entries(g).map(([tipo, monto]) => ({ tipo, label: TIPO_LABEL[tipo] || TIPO_LABEL.other, monto: eur(monto), pct: total > 0 ? Math.round((monto / total) * 100) : 0 }))
    .sort((a, b) => b.monto - a.monto);
}

// Resumen global de deuda para el dashboard.
function resumen(now = Date.now(), lista = null) {
  const deudas = (lista || store.readAll("debts")).map((d) => decorar(d, now));
  const activas = deudas.filter((d) => d.activa);
  const total = eur(activas.reduce((s, d) => s + (Number(d.outstanding_amount) || 0), 0));
  const cuotaMensual = eur(activas.reduce((s, d) => s + (Number(d.monthly_payment) || 0), 0));
  const intereses = eur(activas.reduce((s, d) => s + d.intereses_estimados, 0));
  const vencimientos = activas.map((d) => d.proximo_vencimiento).filter((x) => x != null).sort((a, b) => a - b);
  const finales = activas.map((d) => (d.end_date ? new Date(d.end_date).getTime() : null)).filter((x) => x != null).sort((a, b) => b - a);
  const ordenadas = activas.sort((a, b) => (b.outstanding_amount || 0) - (a.outstanding_amount || 0));
  const mayorInteres = activas.slice().sort((a, b) => (Number(b.interest_rate) || 0) - (Number(a.interest_rate) || 0))[0] || null;
  return {
    deuda_total: total,
    cuota_mensual_total: cuotaMensual,
    intereses_estimados: intereses,
    proximo_vencimiento: vencimientos.length ? vencimientos[0] : null,
    fecha_final_estimada: finales.length ? finales[0] : null,
    num_deudas: activas.length,
    tasa_media: tasaMediaPonderada(activas),
    duracion_media_meses: duracionMediaRestante(activas, now),
    distribucion: distribucion(activas),
    mayor_interes: mayorInteres ? { id: mayorInteres.id, name: mayorInteres.name, tipo_label: mayorInteres.tipo_label, interest_rate: Number(mayorInteres.interest_rate) || 0, outstanding_amount: Number(mayorInteres.outstanding_amount) || 0 } : null,
    deudas: ordenadas,
  };
}

module.exports = {
  TIPOS, TIPO_LABEL, SISTEMAS, SISTEMA_LABEL, activa, cuotasRestantes, proximoVencimiento,
  interesesEstimados, amortizacion, tasaMediaPonderada, duracionMediaRestante, distribucion,
  decorar, resumen, eur,
};
