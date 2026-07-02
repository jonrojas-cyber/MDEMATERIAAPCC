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

// Resumen global de deuda para el dashboard.
function resumen(now = Date.now(), lista = null) {
  const deudas = (lista || store.readAll("debts")).map((d) => decorar(d, now));
  const activas = deudas.filter((d) => d.activa);
  const total = eur(activas.reduce((s, d) => s + (Number(d.outstanding_amount) || 0), 0));
  const cuotaMensual = eur(activas.reduce((s, d) => s + (Number(d.monthly_payment) || 0), 0));
  const intereses = eur(activas.reduce((s, d) => s + d.intereses_estimados, 0));
  const vencimientos = activas.map((d) => d.proximo_vencimiento).filter((x) => x != null).sort((a, b) => a - b);
  const finales = activas.map((d) => (d.end_date ? new Date(d.end_date).getTime() : null)).filter((x) => x != null).sort((a, b) => b - a);
  return {
    deuda_total: total,
    cuota_mensual_total: cuotaMensual,
    intereses_estimados: intereses,
    proximo_vencimiento: vencimientos.length ? vencimientos[0] : null,
    fecha_final_estimada: finales.length ? finales[0] : null,
    num_deudas: activas.length,
    deudas: activas.sort((a, b) => (b.outstanding_amount || 0) - (a.outstanding_amount || 0)),
  };
}

module.exports = { TIPOS, TIPO_LABEL, activa, cuotasRestantes, proximoVencimiento, interesesEstimados, decorar, resumen, eur };
