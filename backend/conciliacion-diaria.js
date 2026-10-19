// CONCILIACIÓN DIARIA Control M ⇄ Ágora · ¿quedó el día ENTERO y CUADRA?
// ─────────────────────────────────────────────────────────────────────────────
// Un vistazo al cierre del día: cuánto se vendió (con desglose por naturaleza —
// venta / invitación / devolución —), cuántas anulaciones hubo, y sobre todo si
// TODO lo de Ágora entró y cuadra. Si no (documentos que no entraron por productos
// sin vincular, posible doble conteo, o el conector caído), lo marca y, en el job
// diario automático, dispara una ALARMA push.
//
// No recalcula dinero: reutiliza conciliacion-ventas.conciliacionDia (bruto/neto/
// duplicados), lee docs_agora (anulaciones/bloqueados) y tpv-connector.saludConector
// (latido). El desglose por naturaleza sale de ventas.naturaleza (ya capturado en la
// ingesta). El descuento global de Ágora NO se persiste por documento (agora.5,
// pendiente de muestra real): se omite del cuadre en vez de inventarlo.

const store = require("./data-store");
const cv = require("./conciliacion-ventas");
const conector = require("./tpv-connector");
const push = require("./push");
const tz = require("./tz");

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
const CONFIG_ID = "conciliacion_diaria";
const HORA_DEFECTO = 10; // no avisar del día anterior hasta media mañana (sincros tardías)

function getConfig() {
  const c = store.findById("config", CONFIG_ID) || {};
  return {
    activo: c.activo !== false,
    hora: Number.isInteger(c.hora) ? c.hora : Number(process.env.CUADRE_HORA || HORA_DEFECTO),
    ultimo_aviso_dia: c.ultimo_aviso_dia || null,
    ultimo_aviso_en: c.ultimo_aviso_en || null,
  };
}
function setConfig(patch) {
  const existe = store.findById("config", CONFIG_ID);
  if (existe) return store.update("config", CONFIG_ID, patch);
  return store.insert("config", { id: CONFIG_ID, ...patch });
}

function delDia(rows, dia) { return (rows || []).filter((r) => String(r.fecha || r.created_at || "").slice(0, 10) === dia); }
function sum(arr, f) { return r2(arr.reduce((s, x) => s + (Number(f(x)) || 0), 0)); }

// Cuadre de un día concreto (YYYY-MM-DD; por defecto hoy en hora local).
function cuadreDia(dia, now = Date.now()) {
  dia = dia || tz.fechaLocal(new Date(now).toISOString());
  const base = cv.conciliacionDia(dia, now); // bruto, neto, num_tickets, duplicados, total_duplicado
  const ventas = delDia(store.readAll("ventas"), dia);
  const docs = delDia(store.readAll("docs_agora"), dia);

  const porNat = (nat) => ventas.filter((v) => (v.naturaleza || "venta") === nat);
  const vventa = porNat("venta");
  const invit = porNat("invitacion");
  const devol = porNat("devolucion");

  const ventasBloque = {
    num_tickets: base.num_tickets || 0,
    unidades: sum(vventa, (v) => v.cantidad),
    bruto: sum(vventa, (v) => v.importe),
    neto: sum(vventa, (v) => (v.importe_neto != null && v.importe_neto !== "" ? v.importe_neto : v.importe)),
  };
  ventasBloque.iva = r2(ventasBloque.bruto - ventasBloque.neto);

  const invitaciones = { n: invit.length, unidades: sum(invit, (v) => v.cantidad) };
  const devoluciones = { n: devol.length, importe: sum(devol, (v) => v.importe) };
  const anulaciones = { n: docs.filter((d) => d.anulado).length };

  const bloqueadosDocs = docs.filter((d) => d.status === "blocked");
  const bloqueados = {
    n: bloqueadosDocs.length,
    docs: bloqueadosDocs.slice(0, 20).map((d) => ({ tipo: d.type, serie: d.serie, number: d.number, no_vinculados: d.no_vinculados || [] })),
  };
  const duplicados = { n: (base.duplicados || []).length, importe: r2(base.total_duplicado) };
  const salud = conector.saludConector(store, now);

  // Incidencias que rompen el cuadre, cada una con su motivo claro.
  const incidencias = [];
  if (bloqueados.n > 0) incidencias.push({ tipo: "bloqueados", severidad: "alta", detalle: `${bloqueados.n} documento(s) de Ágora sin entrar (productos sin vincular): sus ventas NO están contabilizadas.` });
  if (duplicados.n > 0) incidencias.push({ tipo: "duplicados", severidad: "alta", detalle: `${duplicados.n} posible(s) doble conteo (${duplicados.importe} €).` });
  if (salud.salud === "caido") incidencias.push({ tipo: "conector_caido", severidad: "alta", detalle: `El conector de Ágora no da señal desde hace ${salud.ultimo_contacto_hace_min != null ? salud.ultimo_contacto_hace_min + " min" : "un rato"}: pueden faltar ventas del día.` });

  const alta = incidencias.some((i) => i.severidad === "alta");
  const veredicto = alta ? "descuadre" : "cuadra";

  const partes = [`${ventasBloque.num_tickets} tickets`, `${ventasBloque.bruto} € brutos`];
  if (invitaciones.n) partes.push(`${invitaciones.n} invitación(es)`);
  if (devoluciones.n) partes.push(`${devoluciones.n} devolución(es)`);
  if (anulaciones.n) partes.push(`${anulaciones.n} anulación(es)`);
  const resumen_texto = veredicto === "cuadra"
    ? `Cuadre ${dia}: ✓ cuadra · ${partes.join(" · ")}.`
    : `Cuadre ${dia}: ⚠ revisar · ${incidencias.map((i) => i.detalle).join(" ")}`;

  return {
    dia, veredicto,
    ventas: ventasBloque, invitaciones, devoluciones, anulaciones,
    bloqueados, duplicados,
    conector: { salud: salud.salud, ultimo_contacto: salud.ultimo_contacto, hace_min: salud.ultimo_contacto_hace_min },
    incidencias,
    descuento_global: { desglosado: false, nota: "El descuento global de Ágora no llega por documento (pendiente de muestra); no se reparte por línea." },
    resumen_texto,
  };
}

// Job diario (patrón de avisos.js): a partir de la hora configurada, concilia el
// día ANTERIOR una sola vez; si no cuadra, dispara alarma push. Idempotente por día.
async function cronTick(now = Date.now()) {
  const cfg = getConfig();
  if (!cfg.activo) return { ok: true, accion: "omitido", motivo: "desactivado" };
  const hora = tz.horaDecimal(new Date(now).toISOString());
  if (hora < cfg.hora) return { ok: true, accion: "omitido", motivo: `fuera_de_hora (${Math.floor(hora)}<${cfg.hora})` };
  const ayer = tz.fechaLocal(new Date(now - 86400000).toISOString());
  if (cfg.ultimo_aviso_dia === ayer) return { ok: true, accion: "omitido", motivo: "ya_conciliado_hoy" };

  const cuadre = cuadreDia(ayer, now);
  setConfig({ ultimo_aviso_dia: ayer, ultimo_aviso_en: new Date(now).toISOString() }); // marca antes de enviar
  if (cuadre.veredicto === "cuadra") return { ok: true, accion: "sin_novedades", veredicto: "cuadra", dia: ayer };
  if (!push.disponible()) return { ok: true, accion: "omitido_sin_dispositivos", veredicto: cuadre.veredicto, dia: ayer };
  try {
    const r = await push.enviarATodos({ title: `Cuadre del ${ayer}: revisar`, body: cuadre.resumen_texto, url: "/", tag: "cuadre-diario" }, { topic: "cuadre-diario" });
    return { ok: true, accion: "avisado", veredicto: cuadre.veredicto, dia: ayer, push: r };
  } catch (e) {
    return { ok: false, accion: "error", error: e.message, dia: ayer };
  }
}

module.exports = { cuadreDia, cronTick, getConfig, setConfig };
