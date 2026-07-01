// CENTRO DE DECISIONES · el "cerebro" operativo de Control M.
//
// Cruza stock, lotes, caducidades, ritmo de venta, producción y compras para
// responder a tres preguntas, sin que el responsable tenga que pensar:
//   · ACCIONES     → qué hacer AHORA, ordenado por prioridad (food safety primero).
//   · RIESGOS      → qué va a salir mal si no se actúa.
//   · OPORTUNIDADES→ qué margen/eficiencia se puede ganar.
//
// Cada acción trae prioridad, motivo, tiempo estimado y un "handler" que el
// frontend convierte en un botón de acción directa (≤ 1 clic).

const store = require("./data-store");
const costing = require("./costing");
const { costePorUnidad, tamanosLote } = costing;
const { velocidadConsumo, horasDeStock } = require("./consumo");
const { consumoDiarioPorMateria, autonomiaDe } = require("./autonomia");
const { puntoPedido, estadoStock, cantidadSugerida } = require("./umbral");
const compras = require("./compras");

const BLOQUEADOS = ["Fuera de servicio", "Bloqueado", "No apto", "Rechazado"];

function horasRestantes(lote) {
  return (new Date(lote.caduca_en).getTime() - Date.now()) / 36e5;
}
function fechaValida(iso) {
  return iso && !isNaN(new Date(iso).getTime());
}
// (puntoPedido, estadoStock y cantidadSugerida viven en ./umbral — cerebro único.)
// Tiempo de preparación estimado (min) si la receta no lo define.
function tiempoReceta(r) {
  if (r.tiempo_min) return Number(r.tiempo_min);
  const nIng = (r.ingredientes || []).length;
  const nPasos = (r.pasos_proceso || []).length;
  return Math.max(5, Math.round(nIng * 1 + nPasos * 4));
}
function humanoHoras(h) {
  if (h <= 0) return "ya";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} días`;
}

function construir() {
  const materias = store.readAll("materias");
  const recetas = store.readAll("recetas");
  const lotes = store.readAll("lotes");
  const proveedores = store.readAll("proveedores");
  const recepciones = store.readAll("recepciones");
  const ajustes = store.readAll("ajustes");
  const preparaciones = store.readAll("preparaciones");
  const consumos = store.readAll("consumos");
  const ahora = Date.now();

  const recById = {};
  recetas.forEach((r) => (recById[r.id] = r));
  const provById = {};
  proveedores.forEach((p) => (provById[p.id] = p));
  const enCursoRecetas = new Set(preparaciones.filter((p) => p.estado === "En curso").map((p) => p.receta_id));

  const acciones = [];
  const riesgos = [];
  const oportunidades = [];
  let idc = 0;
  const nid = (t) => `${t}-${++idc}`;

  // ── 1) FOOD SAFETY · lotes caducados / bloqueados (máxima prioridad) ────────
  const conStock = (l) => l.cantidad_restante == null || l.cantidad_restante > 0;
  const caducados = lotes.filter((l) => conStock(l) && !BLOQUEADOS.includes(l.estado) && fechaValida(l.caduca_en) && horasRestantes(l) <= 0);
  const bloqueados = lotes.filter((l) => conStock(l) && BLOQUEADOS.includes(l.estado) && l.estado !== "Fuera de servicio");
  if (caducados.length) {
    const det = caducados.slice(0, 3).map((l) => `${recById[l.receta_id] ? recById[l.receta_id].nombre : l.receta_id} (${l.codigo})`).join(", ");
    acciones.push({
      id: nid("retirar"), tipo: "retirar_lote", severidad: "critico", prioridad: 1, estado: "pendiente",
      titulo: caducados.length === 1 ? "Retirar lote caducado" : `Retirar ${caducados.length} lotes caducados`,
      motivo: `${det}${caducados.length > 3 ? "…" : ""} · no usar · riesgo APPCC, acción obligatoria`,
      tiempo_min: 3, accion: { label: "Resolver", handler: "irA_lotes" },
    });
    riesgos.push({ id: nid("r"), severidad: "critico", titulo: `${caducados.length} lote(s) caducado(s) con producto`, motivo: "Riesgo sanitario si se usan. Retirar y dar de baja." });
  }
  if (bloqueados.length) {
    acciones.push({
      id: nid("bloq"), tipo: "retirar_lote", severidad: "critico", prioridad: 1, estado: "bloqueado",
      titulo: bloqueados.length === 1 ? "Lote bloqueado / no apto" : `${bloqueados.length} lotes bloqueados`,
      motivo: "Marcados no aptos. Retirar del servicio.", tiempo_min: 3,
      accion: { label: "Resolver", handler: "irA_lotes" },
    });
  }

  // ── 2) Recepciones pendientes de resolver ──────────────────────────────────
  const recepPend = recepciones.filter((r) => r.estado === "Pendiente de confirmar");
  if (recepPend.length) {
    acciones.push({
      id: nid("recep"), tipo: "recepcion", severidad: "importante", prioridad: 2, estado: "pendiente",
      titulo: recepPend.length === 1 ? "Resolver albarán recibido" : `Resolver ${recepPend.length} albaranes`,
      motivo: "Recepción pendiente de aceptar y cargar al stock.", tiempo_min: 5,
      accion: { label: "Hacer", handler: "irA_recepcion" },
    });
  }

  // ── 2b) Ventas de Ágora bloqueadas (producto sin vincular a la carta) ───────
  // Sin esto, un día de ventas puede NO descontar stock y nadie se entera.
  const docsBloqueados = store.readAll("docs_agora").filter((d) => d.status === "blocked");
  if (docsBloqueados.length) {
    const prods = [...new Set(docsBloqueados.flatMap((d) => d.no_vinculados || []))];
    acciones.push({
      id: nid("agora"), tipo: "ventas_bloqueadas", severidad: "importante", prioridad: 2, estado: "pendiente",
      titulo: docsBloqueados.length === 1 ? "1 venta sin descontar stock" : `${docsBloqueados.length} ventas sin descontar stock`,
      motivo: prods.length
        ? `Producto(s) de Ágora sin vincular: ${prods.slice(0, 3).join(", ")}${prods.length > 3 ? "…" : ""}. Créalos en la Carta con el mismo nombre.`
        : "Hay ventas con productos sin vincular a la carta.",
      tiempo_min: 4, accion: { label: "Vincular", handler: "irA_ventas" },
    });
    riesgos.push({ id: nid("r"), severidad: "importante", titulo: `${docsBloqueados.length} venta(s) sin descontar stock`, motivo: "El stock no baja hasta vincular esos productos en la Carta." });
  }

  // ── 3) Producción recomendada (ritmo real con fallback a umbral) ────────────
  const lotesVigentes = lotes.filter((l) => fechaValida(l.caduca_en) && horasRestantes(l) > 0);
  const produccion = [];
  recetas.forEach((r) => {
    const vig = lotesVigentes.filter((l) => l.receta_id === r.id);
    const totalRestante = vig.reduce((s, l) => s + (Number(l.cantidad_restante) || 0), 0);
    const vel = velocidadConsumo(r.id, consumos, ahora);
    const hStock = horasDeStock(totalRestante, vel);
    let recomendar = false, motivo = "";
    if (hStock != null) {
      recomendar = hStock < r.vida_util_horas * 0.5;
      motivo = `quedan ${humanoHoras(hStock)} de stock al ritmo actual`;
    } else {
      recomendar = totalRestante < r.resultado_base * 0.4;
      motivo = "por debajo del 40% del lote base";
    }
    if (!recomendar) return;
    const tamanos = tamanosLote(r);
    const cantidad = tamanos.length ? tamanos[Math.min(1, tamanos.length - 1)] : r.resultado_base;
    const tmin = tiempoReceta(r);
    produccion.push({ receta: r, cantidad, motivo, tiempo_min: tmin, coste: Math.round(costePorUnidad(r) * cantidad * 100) / 100 });
    acciones.push({
      id: nid("prod"), tipo: "produccion", severidad: "importante", prioridad: 3,
      estado: enCursoRecetas.has(r.id) ? "en_curso" : "pendiente",
      titulo: `Preparar ${r.nombre}`,
      motivo: `${motivo} · ${cantidad} ${r.unidad}`,
      tiempo_min: tmin,
      accion: { label: "Empezar", handler: "decisionProducir", args: { receta_id: r.id, cantidad } },
    });
  });

  // ── 4) Lotes próximos a caducar → dar salida ────────────────────────────────
  const proximos = lotes.filter((l) => conStock(l) && !BLOQUEADOS.includes(l.estado) && fechaValida(l.caduca_en) && horasRestantes(l) > 0 && horasRestantes(l) <= 12);
  proximos
    .sort((a, b) => horasRestantes(a) - horasRestantes(b))
    .slice(0, 5)
    .forEach((l) => {
      const nombre = recById[l.receta_id] ? recById[l.receta_id].nombre : l.receta_id;
      const h = horasRestantes(l);
      acciones.push({
        id: nid("salida"), tipo: "priorizar_uso", severidad: "importante", prioridad: 4, estado: "pendiente",
        titulo: `Dar salida a ${nombre}`,
        motivo: `Quedan ${l.cantidad_restante != null ? l.cantidad_restante : "?"}${recById[l.receta_id] ? " " + recById[l.receta_id].unidad : ""}, caduca en ${humanoHoras(h)}`,
        tiempo_min: null, accion: { label: "Hacer", handler: "irA_lotes" },
      });
      oportunidades.push({ id: nid("o"), titulo: `Aprovecha ${nombre}`, motivo: `Sobran existencias y caduca en ${humanoHoras(h)}: promoción o uso prioritario para evitar merma.`, accion: { label: "Ver lote", handler: "irA_lotes" } });
    });

  // ── 5) Compras ─────────────────────────────────────────────────────────────
  // A PROPÓSITO: las compras NO son tareas del momento. No se meten en la bandeja.
  // Se resuelven con el aviso diario de las 16:00 (agrupado por proveedor) y en
  // la pantalla de Pedidos. Aquí solo contamos proveedores a pedir para el "Hoy".
  const comprasSug = compras.sugerencias();

  // ── 6) Merma del día anterior / de hoy ──────────────────────────────────────
  const hoy = new Date().toDateString();
  const ayer = new Date(ahora - 864e5).toDateString();
  const mermaAyer = ajustes.filter((a) => new Date(a.fecha).toDateString() === ayer);
  const costeMermaAyer = Math.round(mermaAyer.reduce((s, a) => s + (a.coste_estimado || 0), 0) * 100) / 100;
  if (mermaAyer.length) {
    acciones.push({
      id: nid("merma"), tipo: "revisar_merma", severidad: "info", prioridad: 6, estado: "pendiente",
      titulo: "Revisar merma de ayer",
      motivo: `${mermaAyer.length} ajuste(s) · ${costeMermaAyer.toFixed(2)} € perdidos`,
      tiempo_min: 3, accion: { label: "Revisar", handler: "irA_ajustes" },
    });
  }
  const costeMermaHoy = Math.round(ajustes.filter((a) => new Date(a.fecha).toDateString() === hoy).reduce((s, a) => s + (a.coste_estimado || 0), 0) * 100) / 100;
  if (costeMermaHoy > 0) riesgos.push({ id: nid("r"), severidad: "info", titulo: "Merma de hoy", motivo: `${costeMermaHoy.toFixed(2)} € en mermas registradas hoy.` });

  // ── Oportunidad: sobrestock (muy por encima del óptimo) → priorizar uso ──────
  materias.forEach((m) => {
    const opt = m.stock_optimo != null ? Number(m.stock_optimo) : m.stock_ideal != null ? Number(m.stock_ideal) : null;
    if (opt && Number(m.disponibilidad_actual) > opt * 1.5) {
      oportunidades.push({ id: nid("o"), titulo: `Tienes de sobra ${m.nombre}`, motivo: `${m.disponibilidad_actual} ${m.unidad || ""} (óptimo ${opt}). Priorízalo para no generar merma.`, accion: { label: "Revisar", handler: "irA_materias" } });
    }
  });

  acciones.sort((a, b) => a.prioridad - b.prioridad);

  // ── KPIs inmediatos (cabecera del mando) · dinero desde costing.js ──────────
  const ventas = store.readAll("ventas");
  const idxMat = costing.indiceMaterias(materias);
  const ventasHoy = ventas
    .filter((v) => v.fecha && new Date(v.fecha).toDateString() === hoy)
    .reduce((s, v) => s + (Number(v.importe) || Number(v.total) || 0), 0);
  const kpis = {
    ventas_hoy: Math.round(ventasHoy * 100) / 100,
    food_cost: costing.foodCostMedioCarta(null, idxMat), // %
    merma_hoy: costeMermaHoy,
    valor_stock: costing.valorStock(materias),
    valor_produccion: costing.valorProduccion(lotes, recetas, idxMat),
    alertas: acciones.filter((a) => a.severidad === "critico" || a.severidad === "importante").length + riesgos.length,
  };

  // ── HOY · estado operativo del día ──────────────────────────────────────────
  const prodHoy = preparaciones.filter((p) => p.estado === "Finalizada" && p.finalizada_en && new Date(p.finalizada_en).toDateString() === hoy).length;
  const prodPlan = prodHoy + produccion.length; // realizadas + recomendadas pendientes
  const pedidosHoy = store.readAll("pedidos").filter((p) => p.fecha && new Date(p.fecha).toDateString() === hoy);
  const pedidosEnviados = pedidosHoy.filter((p) => p.estado === "enviado" || p.estado === "recibido").length;
  const recepHoy = recepciones.filter((r) => r.fecha && new Date(r.fecha).toDateString() === hoy);
  const recepRecibidas = recepHoy.filter((r) => r.estado && r.estado !== "Pendiente de confirmar").length;
  const hoyOperativo = [
    { etiqueta: "Producciones", hecho: prodHoy, total: prodPlan },
    { etiqueta: "Pedidos", hecho: pedidosEnviados, total: pedidosHoy.length + comprasSug.length },
    { etiqueta: "Recepciones", hecho: recepRecibidas, total: recepHoy.length },
  ];

  return {
    generado_en: new Date().toISOString(),
    resumen: {
      acciones: acciones.length,
      criticas: acciones.filter((a) => a.severidad === "critico").length,
      riesgos: riesgos.length,
      oportunidades: oportunidades.length,
      produccion_recomendada: produccion.length,
      tiempo_total_min: produccion.reduce((s, p) => s + (p.tiempo_min || 0), 0),
      coste_produccion: Math.round(produccion.reduce((s, p) => s + p.coste, 0) * 100) / 100,
    },
    kpis,
    hoy: hoyOperativo,
    acciones,
    riesgos,
    oportunidades,
    produccion,
  };
}

module.exports = { construir };
