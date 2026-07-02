// CALENDARIO DE EMPRESA · unifica en una vista semanal (lunes→domingo) los eventos
// operativos y financieros: producciones, pedidos, recepciones, pagos, cobros,
// nóminas, impuestos, vencimientos de deuda, APPCC, caducidades y vacaciones/bajas.

const store = require("./data-store");
const periods = require("./periods");
const debtsMod = require("./debts");
const fixedCosts = require("./fixed-costs");

const DAY = periods.DAY;
function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function ymd(t) { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

// Semana (lunes-domingo) desplazada `offset` semanas respecto a la actual.
function semana(now = Date.now(), offset = 0) {
  const inicio = periods.startOfWeek(now) + offset * 7 * DAY;
  const fin = inicio + 7 * DAY;
  const eventos = [];
  const push = (t, tipo, titulo, detalle, importe) => {
    const ts = new Date(t).getTime();
    if (Number.isFinite(ts) && ts >= inicio && ts < fin) eventos.push({ fecha: ts, dia: ymd(ts), tipo, titulo, detalle: detalle || "", importe: importe != null ? eur(importe) : null });
  };

  // Operativo.
  store.readAll("preparaciones").forEach((p) => push(p.finalizada_en || p.creado_en, "produccion", "Producción", p.receta_nombre || ""));
  store.readAll("pedidos").forEach((p) => push(p.fecha, "pedido", "Pedido", p.proveedor_nombre || ""));
  store.readAll("recepciones").forEach((r) => push(r.fecha, "recepcion", "Recepción", r.proveedor_nombre || "", r.importe_total));
  store.readAll("revisiones").forEach((r) => push(r.fecha, "appcc", "APPCC", r.tipo || ""));
  store.readAll("lotes").forEach((l) => { if (l.caduca_en && l.estado !== "Fuera de servicio") push(l.caduca_en, "caducidad", "Caducidad", l.codigo || ""); });

  // Financiero.
  debtsMod.resumen(now).deudas.forEach((d) => { if (d.proximo_vencimiento) push(d.proximo_vencimiento, "pago", `Cuota · ${d.name}`, d.tipo_label, d.monthly_payment); });
  store.readAll("treasury_movements").forEach((m) => { if (m.fecha) push(m.fecha, m.tipo === "cobro" ? "cobro" : "pago", m.concepto || m.categoria || "Movimiento", "", m.importe); });

  // Costes fijos domiciliados: su día de pago dentro de la semana.
  fixedCosts.totales(now); // asegura carga
  store.readAll("fixed_costs").filter((f) => f.active !== false && f.payment_day).forEach((f) => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicio + i * DAY);
      if (d.getDate() === Number(f.payment_day)) push(d.getTime(), "pago", f.name, "Coste fijo", f.amount);
    }
  });

  // Vacaciones / bajas del equipo (si hay rango de fechas).
  store.readAll("staff_finance").forEach((s) => {
    if (s.estado === "vacaciones" || s.estado === "baja") {
      if (s.desde) push(s.desde, s.estado, s.estado === "baja" ? "Baja" : "Vacaciones", s.nombre || "");
    }
  });

  // Agrupa por día (lunes→domingo).
  const dias = [];
  const nombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  for (let i = 0; i < 7; i++) {
    const t = inicio + i * DAY;
    dias.push({
      fecha: ymd(t),
      nombre: nombres[i],
      eventos: eventos.filter((e) => e.dia === ymd(t)).sort((a, b) => a.fecha - b.fecha),
    });
  }
  return { inicio: ymd(inicio), fin: ymd(fin - DAY), offset, dias, total_eventos: eventos.length };
}

module.exports = { semana };
