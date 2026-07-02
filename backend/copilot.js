// COPILOTO · traduce el estado financiero en frases cortas y accionables.
// Recibe el contexto ya calculado por executive-dashboard (no recalcula) y solo
// habla cuando hay señal. Español premium, sin jerga contable.

function eur0(n) { return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)); }
function eur2(n) { return new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0); }

let _seq = 0;
function nid() { return `cop-${++_seq}`; }

function generar(ctx) {
  _seq = 0;
  const out = [];
  const push = (severidad, texto, handler) => out.push({ id: nid(), severidad, texto, accion: handler ? { handler } : null });

  const { costeAbrir, beneficio, tesoreria, deuda, salud, capitalParado, objetivos, periodoLabel } = ctx;

  // 1) Cuánto cuesta abrir y cuánto hay que vender para cubrirlo con margen.
  if (costeAbrir && costeAbrir.prorrateo && costeAbrir.prorrateo.diario > 0) {
    const costeHoy = costeAbrir.prorrateo.diario;
    const objMargen = (objetivos && objetivos.find((o) => o.tipo === "food_cost")) ? (1 - objetivos.find((o) => o.tipo === "food_cost").objetivo / 100) : 0.65;
    const ventaNecesaria = objMargen > 0 ? costeHoy / objMargen : costeHoy;
    push("importante", `Hoy abrir el negocio cuesta ${eur0(costeHoy)} €. Necesitas vender ${eur0(ventaNecesaria)} € para cubrir costes con tu margen objetivo.`, "irA_costeAbrir");
  }

  // 2) Coste laboral por encima del objetivo.
  const tgtLab = objetivos && objetivos.find((o) => o.tipo === "coste_laboral");
  if (beneficio && beneficio.coste_laboral_pct != null && tgtLab && beneficio.coste_laboral_pct > tgtLab.objetivo) {
    const dif = beneficio.coste_laboral_pct - tgtLab.objetivo;
    push("importante", `El coste laboral de ${periodoLabel.toLowerCase()} está ${dif.toFixed(1)} % por encima del objetivo.`, "irA_equipo");
  }

  // 3) Capital parado / sin rotación.
  if (capitalParado && capitalParado.sin_rotacion_eur > 100) {
    push("info", `Tienes ${eur0(capitalParado.sin_rotacion_eur)} € en almacén sin rotación suficiente.`, "irA_capitalParado");
  }
  if (capitalParado && capitalParado.en_caducidad_eur > 30) {
    push("importante", `Hay ${eur0(capitalParado.en_caducidad_eur)} € a punto de caducar. Priorízalo o promociónalo.`, "irA_lotes");
  }

  // 4) Proyección de beneficio a fin de mes (ritmo actual).
  if (beneficio && beneficio.proyeccion_mes != null) {
    const p = beneficio.proyeccion_mes;
    push(p >= 0 ? "info" : "importante", `Con el ritmo actual cerrarás el mes con ${eur0(p)} € de beneficio.`, "irA_beneficio");
  }

  // 5) Deuda.
  if (deuda && deuda.deuda_total > 0) {
    push("info", `Tu deuda pendiente es de ${eur0(deuda.deuda_total)} € y este mes pagarás ${eur0(deuda.cuota_mensual_total)} €.`, "irA_deuda");
  }

  // 6) Runway.
  if (tesoreria && tesoreria.dias_supervivencia != null) {
    const d = tesoreria.dias_supervivencia;
    push(d >= 30 ? "info" : "importante", `Tu liquidez permite operar ${d} día${d === 1 ? "" : "s"} sin ingresos.`, "irA_tesoreria");
  }

  // 7) Salud del negocio si está baja.
  if (salud && salud.score != null && salud.score < 55) {
    const peor = (salud.razones || []).find((r) => r.estado === "mal");
    push("importante", `La salud del negocio está en ${salud.score}/100${peor ? `: ${peor.texto.toLowerCase()}.` : "."}`, "irA_salud");
  }

  const orden = { importante: 0, info: 1 };
  out.sort((a, b) => (orden[a.severidad] ?? 2) - (orden[b.severidad] ?? 2));
  return out;
}

module.exports = { generar };
