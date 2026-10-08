// DASHBOARD CEO · centro de mando de la portada "visión general".
// Compone UNA respuesta para /api/dashboard orquestando los motores que ya existen
// (executive-dashboard, financials, treasury, break-even, analisis-diario, fichaje,
// turnos, decisiones, revisiones). NO recalcula dinero: reutiliza. Cada bloque lleva
// su ESTADO explícito (ok/atencion/critico/sin_datos/desactualizado/pendiente) para
// que la UI nunca muestre 0 € cuando el dato es, en realidad, desconocido.
//
// Funciones puras (estado, resultadoDiaDe, productividadDe, cierrePrevistoDe,
// scoreAlerta) exportadas para test. `calcular(opts)` lee el store y ensambla.

const store = require("./data-store");
const periods = require("./periods");
const financials = require("./financials");
const treasury = require("./treasury");
const breakEven = require("./break-even");
const operatingProfile = require("./operating-profile");
const fichaje = require("./fichaje");
const turnos = require("./turnos");
const costing = require("./costing");
const analisisDiario = require("./analisis-diario");
const decisiones = require("./decisiones");
const debtsMod = require("./debts");
const executive = require("./executive-dashboard");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function pct1(n) { return n == null ? null : Math.round(Number(n) * 10) / 10; }
const DAY = 86400000;
// Catálogo APPCC de apertura (routes/revisiones.js TIPOS_REVISION): 5 temperaturas
// + 3 de limpieza = 8 tareas/día. Fuente del total para "pendientes del día".
const APPCC_TAREAS_DIA = 8;
// Categorías que cuentan como BEBIDA (para bebidas/ticket). El resto = comida/otros.
const CATS_BEBIDA = ["cafe", "café", "matcha", "limonada", "burbuja", "zumo", "spritz", "infusion", "infusión", "te", "té", "bebida", "chai"];
function esBebida(cat) { const c = String(cat || "").toLowerCase(); return CATS_BEBIDA.some((k) => c.includes(k)); }

// ── ESTADO (fuente única del semáforo) ───────────────────────────────────────
// Devuelve 'ok' | 'atencion' | 'critico' | 'sin_datos'. `menorMejor`: cumplir =
// estar por DEBAJO del objetivo (food cost, personal…). Banda `umbral` (fracción)
// antes de pasar de ok a atención. Sin objetivo → 'ok' neutro (hay dato, no meta).
function estado(valor, opts = {}) {
  const { objetivo, menorMejor = false, umbral = 0.08, sinDatos = false } = opts;
  if (sinDatos || valor == null || (typeof valor === "number" && !Number.isFinite(valor))) return "sin_datos";
  if (objetivo == null || !(objetivo > 0)) return "ok";
  const ratio = valor / objetivo;
  if (menorMejor) {
    if (ratio <= 1) return "ok";
    if (ratio <= 1 + umbral) return "atencion";
    return "critico";
  }
  if (ratio >= 1) return "ok";
  if (ratio >= 1 - umbral) return "atencion";
  return "critico";
}

function comparar(actual, ref) {
  if (actual == null || ref == null || !(Math.abs(ref) > 0)) return null;
  return { abs: eur(actual - ref), pct: Math.round(((actual - ref) / Math.abs(ref)) * 1000) / 10 };
}

// ── RESULTADO ESTIMADO DEL DÍA (puro) ────────────────────────────────────────
// ventas − coste de materia − coste de personal − variables. NO resta costes fijos
// (eso es EBITDA, no "lo que deja el día"). Declara qué incluye y si es parcial.
function resultadoDiaDe(ben) {
  if (!ben) return { valor: null, sin_datos: true, incluye: [], parcial: true };
  const ventas = Number(ben.ventas) || 0;
  const tieneMateria = ben.coste_materia != null;
  const materia = tieneMateria ? Number(ben.coste_materia) || 0 : 0;
  const personal = Number(ben.coste_laboral) || 0;
  const variables = Number(ben.gastos_variables) || 0;
  const incluye = ["ventas"];
  if (tieneMateria) incluye.push("coste de materia");
  if (personal) incluye.push("personal (prorrateado)");
  if (variables) incluye.push("variables/mermas");
  return {
    valor: eur(ventas - materia - personal - variables),
    sin_datos: ventas <= 0,
    parcial: !tieneMateria,                 // sin escandallos → resultado incompleto
    incluye,
    ventas: eur(ventas), coste_materia: tieneMateria ? eur(materia) : null,
    personal: eur(personal), variables: eur(variables),
  };
}

// ── PRODUCTIVIDAD LABORAL €/HORA (puro) ───────────────────────────────────────
function productividadDe(ventas, horasTrabajadas, objetivoHora) {
  const horas = Math.round((Number(horasTrabajadas) || 0) * 100) / 100;
  if (!(horas > 0)) return { valor: null, horas, sin_datos: true, objetivo: objetivoHora != null ? eur(objetivoHora) : null };
  const valor = eur((Number(ventas) || 0) / horas);
  const obj = objetivoHora != null && objetivoHora > 0 ? eur(objetivoHora) : null;
  return {
    valor, horas, sin_datos: false, objetivo: obj,
    desviacion_eur: obj != null ? eur(valor - obj) : null,
    desviacion_pct: obj != null ? Math.round(((valor - obj) / obj) * 1000) / 10 : null,
  };
}

// ── CIERRE PREVISTO DEL DÍA (puro) ────────────────────────────────────────────
// Prioridad honesta con los datos que SÍ hay (Ágora no da hora de venta):
//  (1) fracción de jornada sobre la venta real de hoy (si ya hay venta);
//  (2) media del mismo día de la semana del histórico (si no hay venta aún);
//  (3) sin datos. Declara el método usado.
function cierrePrevistoDe(ventasHoy, fracDia, mediaDiaSemana) {
  if (ventasHoy > 0 && fracDia > 0) {
    return { valor: eur(ventasHoy / fracDia), metodo: "fraccion_jornada", metodo_txt: `proyección del ritmo de hoy (${Math.round(fracDia * 100)}% de la jornada transcurrido)` };
  }
  if (mediaDiaSemana != null && mediaDiaSemana > 0) {
    return { valor: eur(mediaDiaSemana), metodo: "media_dia_semana", metodo_txt: "media de los mismos días de la semana (aún sin ventas hoy)" };
  }
  return { valor: null, metodo: "sin_datos", metodo_txt: "sin ventas hoy ni histórico comparable" };
}

// Puntuación de una alerta para ordenar "Requiere tu atención". Mezcla impacto
// económico, urgencia, riesgo APPCC/seguridad, antigüedad y bloqueo de procesos.
function scoreAlerta(a) {
  const sev = { critico: 100, importante: 55, info: 20 }[a.severidad] || 20;
  const impacto = Math.min(60, (Number(a.impacto_eur) || 0) / 5); // 300€ ≈ +60
  const appcc = a.appcc ? 40 : 0;
  const bloqueo = a.bloquea ? 25 : 0;
  const antig = Math.min(15, (Number(a.antiguedad_dias) || 0) * 3);
  const urg = a.tiempo_min != null && a.tiempo_min <= 5 ? 10 : 0;
  return Math.round(sev + impacto + appcc + bloqueo + antig + urg);
}

// ── Índices de producto (para analisis-diario.ventaDia) ──────────────────────
function indices() {
  const productos = store.readAll("productos");
  const byId = {}, byName = {};
  productos.forEach((p) => { byId[p.id] = p; if (p.nombre) byName[p.nombre.toLowerCase()] = p; });
  return { byId, byName };
}

// Suma de horas trabajadas HOY por todo el equipo (fichajes) + nº trabajando ahora.
function horasEquipoHoy(now) {
  const hoy = new Date(now).toISOString().slice(0, 10);
  const fichajes = store.readAll("fichajes") || [];
  const personas = [...new Set(fichajes.filter((f) => String(f.fecha).slice(0, 10) === hoy).map((f) => f.persona))];
  let horas = 0, trabajando = 0, abiertos = [];
  personas.forEach((p) => {
    const j = fichaje.jornada(fichaje.eventosDe(fichajes, p, hoy), now);
    horas += Number(j.horas_trabajadas) || 0;
    if (j.estado === "trabajando" || j.estado === "pausa") trabajando++;
    // Fichaje anómalo: jornada abierta (sin salida) con más de 10 h acumuladas.
    if (j.estado !== "fuera" && Number(j.horas_trabajadas) > 10) abiertos.push({ persona: p, horas: j.horas_trabajadas });
  });
  // Horas planificadas de hoy (turnos).
  const horasPlan = (store.readAll("turnos") || [])
    .filter((t) => String(t.fecha).slice(0, 10) === hoy)
    .reduce((s, t) => s + (Number(turnos.horasTurno(t)) || 0), 0);
  return { horas: Math.round(horas * 100) / 100, trabajando, abiertos, horas_plan: Math.round(horasPlan * 100) / 100, personas: personas.length };
}

// Media de ventas del MISMO día de la semana en las últimas `semanas` semanas.
function mediaMismoDiaSemana(now, idx, idxMat, semanas = 8) {
  const hoyYmd = new Date(now).toISOString().slice(0, 10);
  const ventas = store.readAll("ventas") || [];
  let suma = 0, n = 0;
  for (let i = 1; i <= semanas; i++) {
    const d = analisisDiario.restarDias(hoyYmd, 7 * i);
    const v = analisisDiario.ventaDia(d, ventas, idx.byId, idx.byName, idxMat);
    if (v.total > 0) { suma += v.total; n++; }
  }
  return n > 0 ? eur(suma / n) : null;
}

// Pagos previstos en los próximos `dias` días (ventana real, no top-8).
function pagos7Dias(now, dias = 7) {
  const limite = now + dias * DAY;
  const prox = treasury.proximos(now) || {};
  const items = (prox.proximos_pagos || []).filter((p) => {
    const t = new Date(p.fecha).getTime();
    return Number.isFinite(t) && t >= now - DAY && t <= limite;
  });
  const total = items.reduce((s, p) => s + (Number(p.importe) || 0), 0);
  return { total: eur(total), items: items.slice(0, 6) };
}

// APPCC del día: tareas completadas vs pendientes + registros fuera de rango.
function appccDia(now) {
  const hoy = new Date(now).toISOString().slice(0, 10);
  const revs = (store.readAll("revisiones") || []).filter((r) => String(r.fecha).slice(0, 10) === hoy);
  const tiposHechos = new Set(revs.map((r) => r.tipo));
  const completadas = tiposHechos.size;
  const fueraRango = revs.filter((r) => r.estado === "Fuera del rango esperado" && !r.resuelta_en).length;
  const pendientes = Math.max(0, APPCC_TAREAS_DIA - completadas);
  return { completadas, pendientes, total: APPCC_TAREAS_DIA, fuera_rango: fueraRango };
}

// ── CALCULAR ──────────────────────────────────────────────────────────────────
function calcular(opts = {}) {
  const now = opts.now || Date.now();
  const d0 = new Date(now);
  const perfil = operatingProfile.leer();

  // Base: el ensamblador ejecutivo (objetivos, tesorería, operaciones, equipo…).
  const base = executive.construir("hoy", { now });
  const H = (base.panel_direccion && base.panel_direccion.hoy) || {};
  const M = (base.panel_direccion && base.panel_direccion.mes) || {};
  const objetivosEval = base.objetivos || [];
  const objDe = (tipo) => { const o = objetivosEval.find((x) => x.tipo === tipo); return o ? o.objetivo : null; };

  const rHoy = periods.rango("hoy", now);
  const benHoy = financials.beneficio(rHoy, now);
  const idx = indices();
  const idxMat = costing.indiceMaterias();
  const vDia = analisisDiario.ventaDia(new Date(now).toISOString().slice(0, 10), store.readAll("ventas") || [], idx.byId, idx.byName, idxMat);
  const hayVentasHoy = (vDia.total || 0) > 0;

  // ── FRESHNESS ──────────────────────────────────────────────────────────────
  let agoraSync = null; try { agoraSync = require("./agora").ultimaSync(); } catch (e) { agoraSync = null; }
  let tpv = null; try { tpv = require("./tpv-connector").estado(store); } catch (e) { tpv = null; }
  const syncIso = (agoraSync && agoraSync.cuando) || (tpv && tpv.ultima_sync) || null;
  const haceMin = syncIso ? Math.round((now - new Date(syncIso).getTime()) / 60000) : null;
  const horaAbre = d0.getHours() >= 8 && d0.getHours() < 23;
  // Desactualizado: en horario de apertura y sin sync en >90 min (o nunca).
  const desactualizado = horaAbre && (syncIso == null || (haceMin != null && haceMin > 90));
  const freshness = {
    generado_en: new Date(now).toISOString(),
    agora_sync: syncIso,
    agora_hace_min: haceMin,
    conector_configurado: !!(tpv && tpv.configurado),
    origen: tpv && tpv.configurado ? "conector" : (syncIso ? "importacion" : "ninguno"),
    desactualizado,
    estado: syncIso == null ? "pendiente" : (desactualizado ? "desactualizado" : "ok"),
  };

  // ── 5 KPIs ──────────────────────────────────────────────────────────────────
  const ventasHoy = H.ventas || 0;
  const objetivoDia = H.objetivo_dia || null;
  const horaDec = d0.getHours() + d0.getMinutes() / 60;
  const fracDia = Math.min(1, Math.max(0.08, (horaDec - 8) / 15)); // jornada 8–23 h
  const mediaDiaSem = mediaMismoDiaSemana(now, idx, idxMat);
  const cierre = cierrePrevistoDe(ventasHoy, fracDia, mediaDiaSem);

  const equipoHoy = horasEquipoHoy(now);
  const objHora = (objetivoDia && equipoHoy.horas_plan > 0) ? objetivoDia / equipoHoy.horas_plan : null;
  const prod = productividadDe(ventasHoy, equipoHoy.horas, objHora);
  const resultado = resultadoDiaDe(benHoy);

  const kpis = {
    ventas_hoy: {
      valor: eur(ventasHoy), objetivo: objetivoDia,
      delta_pct: H.vs_anterior_pct != null ? pct1(H.vs_anterior_pct) : null,
      estado: hayVentasHoy ? estado(ventasHoy, { objetivo: objetivoDia }) : (freshness.estado === "pendiente" ? "pendiente" : "sin_datos"),
      nota: hayVentasHoy ? "Ventas netas registradas hoy" : "Aún sin ventas registradas hoy",
    },
    resultado_dia: {
      valor: resultado.valor, parcial: resultado.parcial, incluye: resultado.incluye,
      estado: resultado.sin_datos ? "sin_datos" : (resultado.valor >= 0 ? "ok" : "critico"),
      nota: resultado.parcial ? "Sin escandallos completos: resultado parcial (no resta todos los costes)" : "Ventas − materia − personal − variables (sin costes fijos)",
    },
    productividad: {
      valor: prod.valor, objetivo: prod.objetivo, horas: prod.horas,
      desviacion_eur: prod.desviacion_eur, desviacion_pct: prod.desviacion_pct,
      estado: prod.sin_datos ? "sin_datos" : estado(prod.valor, { objetivo: prod.objetivo }),
      nota: prod.sin_datos ? "Sin fichajes hoy: no puedo medir €/hora (necesita el reloj de fichaje)" : "Ventas ÷ horas trabajadas",
    },
    objetivo_dia: {
      valor: H.objetivo_dia_pct != null ? H.objetivo_dia_pct : null, unidad: "pct",
      referencia: objetivoDia,
      estado: H.objetivo_dia_pct == null ? "sin_datos" : estado(H.objetivo_dia_pct, { objetivo: 100 }),
      nota: `Objetivo del día ${objetivoDia != null ? eur(objetivoDia) + " €" : "—"} (${base.panel_direccion && base.panel_direccion.objetivo_regla})`,
    },
    cierre_previsto: {
      valor: cierre.valor, metodo: cierre.metodo, metodo_txt: cierre.metodo_txt, referencia: objetivoDia,
      estado: cierre.valor == null ? "sin_datos" : estado(cierre.valor, { objetivo: objetivoDia }),
      nota: cierre.valor != null ? `Previsión por ${cierre.metodo_txt}` : cierre.metodo_txt,
    },
  };

  // ── EVOLUCIÓN / RITMO DEL DÍA + conclusión automática ────────────────────────
  const faltaObjetivo = objetivoDia != null ? eur(Math.max(0, objetivoDia - ventasHoy)) : null;
  const ritmoNecesarioHoy = objetivoDia != null ? eur(objetivoDia * fracDia) : null; // lo que "debería" llevar a esta hora
  const vsRitmo = ritmoNecesarioHoy != null ? eur(ventasHoy - ritmoNecesarioHoy) : null;
  let conclusion;
  if (!hayVentasHoy) {
    conclusion = freshness.estado === "pendiente"
      ? "Aún no han entrado ventas de Ágora hoy. En cuanto sincronice verás el ritmo del día."
      : "Sin ventas registradas todavía hoy.";
  } else if (vsRitmo != null && objetivoDia != null) {
    const cierreOk = cierre.valor != null && cierre.valor >= objetivoDia;
    if (vsRitmo >= 0) conclusion = `Vas ${eur(vsRitmo)} € por encima del ritmo necesario a esta hora. El cierre previsto (${cierre.valor != null ? eur(cierre.valor) + " €" : "—"}) ${cierreOk ? "supera" : "no llega a"} el objetivo.`;
    else conclusion = `Vas ${eur(Math.abs(vsRitmo))} € por debajo del ritmo necesario, ${cierreOk ? "pero el cierre previsto mantiene el objetivo alcanzable." : "y al ritmo actual el cierre previsto no llega al objetivo."}`;
  } else {
    conclusion = `Llevas ${eur(ventasHoy)} € hoy.`;
  }
  const dia = {
    ventas: eur(ventasHoy), objetivo: objetivoDia, prevision: cierre.valor,
    falta_para_objetivo: faltaObjetivo, ritmo_necesario_hoy: ritmoNecesarioHoy, vs_ritmo: vsRitmo,
    vs_semana_pasada_pct: H.vs_anterior_pct != null ? pct1(H.vs_anterior_pct) : null,
    media_dia_semana: mediaDiaSem,
    intradia_disponible: false, // Ágora no exporta hora de venta (ver nota)
    nota_intradia: "El detalle por horas requiere que Ágora exporte la hora de cada ticket (hoy solo da el día).",
    conclusion,
  };

  // ── RENDIMIENTO COMERCIAL ────────────────────────────────────────────────────
  const udsBebida = (vDia.por_categoria || []).filter((c) => esBebida(c.categoria)).reduce((s, c) => s + (c.unidades || 0), 0);
  const bebidasPorTicket = vDia.tickets > 0 ? Math.round((udsBebida / vDia.tickets) * 10) / 10 : null;
  const horasAbiertoHoy = Math.max(0, Math.min(15, horaDec - 8));
  const ventasPorHora = horasAbiertoHoy > 0 && hayVentasHoy ? eur(ventasHoy / horasAbiertoHoy) : null;
  // Comparativas: mismo día semana pasada (ventaDia) y objetivo de ticket medio.
  const ventas = store.readAll("ventas") || [];
  const vSemPasada = analisisDiario.ventaDia(analisisDiario.restarDias(new Date(now).toISOString().slice(0, 10), 7), ventas, idx.byId, idx.byName, idxMat);
  const objTicket = objDe("ticket_medio");
  const comercial = {
    ticket_medio: { valor: vDia.ticket_medio || null, objetivo: objTicket, vs_dia_equivalente: comparar(vDia.ticket_medio, vSemPasada.ticket_medio), estado: vDia.tickets > 0 ? estado(vDia.ticket_medio, { objetivo: objTicket }) : "sin_datos" },
    tickets: { valor: vDia.tickets || 0, vs_dia_equivalente: comparar(vDia.tickets, vSemPasada.tickets), estado: vDia.tickets > 0 ? "ok" : "sin_datos" },
    unidades_por_ticket: { valor: vDia.unidades_por_ticket || null, estado: vDia.tickets > 0 ? "ok" : "sin_datos" },
    bebidas_por_ticket: { valor: bebidasPorTicket, estado: vDia.tickets > 0 ? "ok" : "sin_datos" },
    ventas_por_hora: { valor: ventasPorHora, estado: ventasPorHora != null ? "ok" : "sin_datos" },
    coste_producto_pct: { valor: benHoy.food_cost_pct, objetivo: objDe("food_cost"), estado: benHoy.food_cost_pct == null ? "sin_datos" : estado(benHoy.food_cost_pct, { objetivo: objDe("food_cost"), menorMejor: true }) },
    coste_personal_pct: { valor: benHoy.coste_laboral_pct, objetivo: objDe("coste_laboral"), estado: benHoy.coste_laboral_pct == null ? "sin_datos" : estado(benHoy.coste_laboral_pct, { objetivo: objDe("coste_laboral"), menorMejor: true }) },
    producto_top: (vDia.top_por_unidades || [])[0] ? { nombre: vDia.top_por_unidades[0].producto, unidades: vDia.top_por_unidades[0].unidades } : null,
    producto_margen: (vDia.top_por_beneficio || [])[0] ? { nombre: vDia.top_por_beneficio[0].producto, margen_pct: vDia.top_por_beneficio[0].margen_pct, beneficio: vDia.top_por_beneficio[0].beneficio } : null,
    producto_riesgo: (vDia.menor_margen || [])[0] ? { nombre: vDia.menor_margen[0].producto, margen_pct: vDia.menor_margen[0].margen_pct } : null,
    sin_datos: !hayVentasHoy,
  };

  // ── REQUIERE TU ATENCIÓN (scored) ────────────────────────────────────────────
  let atencion = [];
  try {
    const dec = decisiones.construir();
    atencion = (dec.acciones || []).map((a) => {
      // Impacto económico si el motivo trae € (merma, ventas sin coste); si no, null.
      const mEur = /([0-9][0-9.,]*)\s*€/.exec(String(a.motivo || ""));
      const impactoEur = mEur ? Number(mEur[1].replace(/\./g, "").replace(",", ".")) : null;
      const item = {
        id: a.id, tipo: a.tipo, severidad: a.severidad, estado: a.estado,
        titulo: a.titulo, motivo: a.motivo, tiempo_min: a.tiempo_min,
        impacto_eur: impactoEur, appcc: a.tipo === "retirar_lote" || a.tipo === "priorizar_uso",
        bloquea: a.tipo === "ventas_bloqueadas" || a.tipo === "recepcion",
        accion: a.accion || null,
      };
      item.score = scoreAlerta(item);
      return item;
    });
  } catch (e) { atencion = []; }
  // Alerta propia: fichaje abierto >10 h (no existe en el cerebro de decisiones).
  equipoHoy.abiertos.forEach((f) => {
    const it = { id: "fichaje-abierto-" + f.persona, tipo: "fichaje_abierto", severidad: "importante", estado: "pendiente", titulo: `Fichaje abierto de ${f.persona} (${f.horas} h)`, motivo: "Una jornada lleva más de 10 h sin cierre. Revisa si olvidó fichar la salida.", tiempo_min: 2, impacto_eur: null, appcc: false, bloquea: false, accion: { label: "Revisar", handler: "irA_fichaje" } };
    it.score = scoreAlerta(it); atencion.push(it);
  });
  atencion.sort((a, b) => b.score - a.score);
  const atencionResumen = { items: atencion.slice(0, 3), total: atencion.length, criticos: atencion.filter((a) => a.severidad === "critico").length };

  // ── PULSO OPERATIVO ───────────────────────────────────────────────────────────
  const OP = base.operaciones || {};
  // Valor de stock crítico.
  let valorCritico = null, bajoMinimo = OP.stock_critico != null ? OP.stock_critico : null;
  try {
    const conc = require("./conciliacion").resumenAlmacen(store);
    const criticos = (conc.items || []).filter((m) => m.bajo_minimo);
    valorCritico = eur(criticos.reduce((s, m) => s + (Number(m.valor) || 0), 0));
    bajoMinimo = conc.n_bajo_minimo != null ? conc.n_bajo_minimo : bajoMinimo;
  } catch (e) { /* conciliación opcional */ }
  const appcc = appccDia(now);
  const pulso = {
    produccion: {
      completadas: OP.produccion_hoy || 0, en_curso: OP.produccion_en_curso || 0,
      pendientes: null, retrasos: null, // sin fecha programada: no calculable (pendiente)
      estado: (OP.produccion_en_curso || 0) > 0 ? "atencion" : "ok", go: "irA_lab",
    },
    stock: {
      bajo_minimo: bajoMinimo || 0, caducan_48h: OP.caducan_48h || 0, valor_critico: valorCritico,
      sin_movimiento: null, // sin ledger fiable de rotación (pendiente)
      estado: (OP.caducan_48h || 0) > 0 ? "critico" : ((bajoMinimo || 0) > 0 ? "atencion" : "ok"), go: "irA_materias",
    },
    equipo: {
      trabajando_ahora: equipoHoy.trabajando, horas_plan: equipoHoy.horas_plan, horas_reales: equipoHoy.horas,
      fichajes_abiertos: equipoHoy.abiertos.length, coste_dia: (base.financiero && base.financiero.expected_payroll != null) ? eur(base.financiero.expected_payroll / (365 / 12)) : null,
      productividad_hora: prod.valor,
      estado: equipoHoy.abiertos.length > 0 ? "atencion" : "ok", go: "irA_equipoHub",
    },
    appcc: {
      completadas: appcc.completadas, pendientes: appcc.pendientes, total: appcc.total, fuera_rango: appcc.fuera_rango,
      estado: appcc.fuera_rango > 0 ? "critico" : (appcc.pendientes > 0 ? "atencion" : "ok"), go: "irA_appcc",
    },
  };

  // ── TESORERÍA ─────────────────────────────────────────────────────────────────
  const T = base.tesoreria || {};
  const pagos7 = pagos7Dias(now);
  const liquidez = T.liquidez_inmediata != null ? T.liquidez_inmediata : ((T.caja || 0) + (T.banco || 0));
  const comprometido = eur((T.pagos_pendientes || 0) + (T.iva_pendiente || 0) + (T.irpf_pendiente || 0) + (T.ss_pendiente || 0));
  const saldoPrevisto7 = eur(liquidez - (pagos7.total || 0));
  // Sin cuentas ni movimientos: la tesorería está PENDIENTE de conectar, no "en rojo".
  const sinTesoreria = (T.num_cuentas || 0) === 0 && liquidez === 0 && comprometido === 0 && (T.cobros_pendientes || 0) === 0;
  const tesoreria = {
    caja: T.caja != null ? eur(T.caja) : null,
    banco: T.banco != null ? eur(T.banco) : null,
    liquidez: eur(liquidez),
    cobros_pendientes: T.cobros_pendientes != null ? eur(T.cobros_pendientes) : null,
    pagos_7d: pagos7.total, pagos_7d_items: pagos7.items,
    comprometido, disponible: eur(liquidez),
    fiscal: { iva: eur(T.iva_pendiente || 0), irpf: eur(T.irpf_pendiente || 0), ss: eur(T.ss_pendiente || 0) },
    dias_supervivencia: T.dias_supervivencia != null ? T.dias_supervivencia : null,
    saldo_previsto_7d: saldoPrevisto7,
    frase: sinTesoreria
      ? "Conecta las cuentas de caja y banco para ver la liquidez real y los pagos próximos."
      : `Después de los pagos confirmados de los próximos 7 días (${eur(pagos7.total)} €), la liquidez prevista será de ${saldoPrevisto7} €.`,
    estado: sinTesoreria ? "pendiente" : (liquidez <= 0 ? "critico" : (saldoPrevisto7 < 0 ? "atencion" : "ok")),
    pendiente_desglose: "Nóminas y proveedores aún no se desglosan por separado (solo IVA/IRPF/SS).",
  };

  // ── RENDIMIENTO MENSUAL ─────────────────────────────────────────────────────
  const rMes = periods.rango("mes", now);
  const diasTranscurridos = Math.max(1, (now - rMes.desde) / DAY);
  const { dias_abiertos_mes } = require("./financiero").diasAbiertos(perfil);
  const diaSemana = d0.getDay(); // 0=domingo
  // Días abiertos restantes del mes (sin domingos, usando dias_semana del perfil).
  const finMes = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  let diasAbiertosRestantes = 0;
  for (let dd = d0.getDate() + 1; dd <= finMes; dd++) {
    const wd = new Date(d0.getFullYear(), d0.getMonth(), dd).getDay();
    // Con 6 días/semana se cierra domingo (wd===0). Con 7, ninguno.
    if (perfil.dias_semana >= 7 || wd !== 0) diasAbiertosRestantes++;
  }
  const ventasMes = M.ventas || 0;
  const objetivoMes = M.objetivo || null;
  const faltaMes = objetivoMes != null ? Math.max(0, objetivoMes - ventasMes) : null;
  const ritmoNecesarioDia = (faltaMes != null && diasAbiertosRestantes > 0) ? eur(faltaMes / diasAbiertosRestantes) : null;
  // Previsión de cierre del mes por días ABIERTOS (no naturales): ritmo real × días abiertos del mes.
  const diasAbiertosPasados = Math.max(1, dias_abiertos_mes * (diasTranscurridos / (365 / 12)));
  const prevCierreMes = ventasMes > 0 ? eur((ventasMes / diasAbiertosPasados) * dias_abiertos_mes) : null;
  const serieMes = (() => {
    const mapa = {};
    (store.readAll("ventas") || []).forEach((v) => { const t = new Date(v.fecha).getTime(); if (t >= rMes.desde && t < rMes.hasta) { const k = String(v.fecha).slice(0, 10); mapa[k] = (mapa[k] || 0) + (Number(v.importe) || 0); } });
    return Object.entries(mapa).sort().map(([fecha, ventas]) => ({ fecha, ventas: eur(ventas) }));
  })();
  const mes = {
    ventas_acum: eur(ventasMes), objetivo: objetivoMes, pct: M.objetivo_pct,
    ritmo_necesario_dia: ritmoNecesarioDia, dias_abiertos_restantes: diasAbiertosRestantes,
    prevision_cierre: prevCierreMes,
    desviacion_prevista: (prevCierreMes != null && objetivoMes != null) ? eur(prevCierreMes - objetivoMes) : null,
    vs_mes_anterior_pct: M.vs_anterior_pct != null ? pct1(M.vs_anterior_pct) : null,
    resultado_operativo: (base.financiero && base.financiero.ebitda_mes != null) ? eur(base.financiero.ebitda_mes) : null,
    ebitda_pct: M.ebitda_pct,
    serie: serieMes,
    estado: objetivoMes != null && ventasMes > 0 ? estado(prevCierreMes || ventasMes, { objetivo: objetivoMes }) : "sin_datos",
  };

  return {
    generado_en: new Date(now).toISOString(),
    freshness, kpis, dia, comercial,
    atencion: atencionResumen,
    pulso, tesoreria, mes,
    objetivos: objetivosEval,
  };
}

module.exports = { calcular, estado, comparar, resultadoDiaDe, productividadDe, cierrePrevistoDe, scoreAlerta, esBebida, eur };
