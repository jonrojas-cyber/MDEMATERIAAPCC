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
const { costePorUnidad, tamanosLote } = require("./costing");
const { velocidadConsumo, horasDeStock } = require("./consumo");

const BLOQUEADOS = ["Fuera de servicio", "Bloqueado", "No apto", "Rechazado"];

function horasRestantes(lote) {
  return (new Date(lote.caduca_en).getTime() - Date.now()) / 36e5;
}
function fechaValida(iso) {
  return iso && !isNaN(new Date(iso).getTime());
}
function puntoPedido(m) {
  if (m.punto_pedido != null && m.punto_pedido !== "") return Number(m.punto_pedido);
  return Math.round((Number(m.stock_minimo) || 0) * 1.3);
}
function estadoStock(m) {
  const disp = Number(m.disponibilidad_actual) || 0;
  const min = Number(m.stock_minimo) || 0;
  if (disp <= min) return "critico";
  if (disp <= puntoPedido(m)) return "por_pedir";
  return "correcto";
}
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
      motivo: `${det}${caducados.length > 3 ? "…" : ""} · no deben usarse`,
      tiempo_min: 3, accion: { label: "Ver lotes", handler: "irA_lotes" },
    });
    riesgos.push({ id: nid("r"), severidad: "critico", titulo: `${caducados.length} lote(s) caducado(s) con producto`, motivo: "Riesgo sanitario si se usan. Retirar y dar de baja." });
  }
  if (bloqueados.length) {
    acciones.push({
      id: nid("bloq"), tipo: "retirar_lote", severidad: "critico", prioridad: 1, estado: "bloqueado",
      titulo: bloqueados.length === 1 ? "Lote bloqueado / no apto" : `${bloqueados.length} lotes bloqueados`,
      motivo: "Marcados no aptos. Retirar del servicio.", tiempo_min: 3,
      accion: { label: "Ver lotes", handler: "irA_lotes" },
    });
  }

  // ── 2) Recepciones pendientes de resolver ──────────────────────────────────
  const recepPend = recepciones.filter((r) => r.estado === "Pendiente de confirmar");
  if (recepPend.length) {
    acciones.push({
      id: nid("recep"), tipo: "recepcion", severidad: "aviso", prioridad: 2, estado: "pendiente",
      titulo: recepPend.length === 1 ? "Resolver albarán recibido" : `Resolver ${recepPend.length} albaranes`,
      motivo: "Recepción pendiente de aceptar y cargar al stock.", tiempo_min: 5,
      accion: { label: "Ir a recepción", handler: "irA_recepcion" },
    });
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
      id: nid("prod"), tipo: "produccion", severidad: "aviso", prioridad: 3,
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
        id: nid("salida"), tipo: "priorizar_uso", severidad: "aviso", prioridad: 4, estado: "pendiente",
        titulo: `Dar salida a ${nombre}`,
        motivo: `Quedan ${l.cantidad_restante != null ? l.cantidad_restante : "?"}${recById[l.receta_id] ? " " + recById[l.receta_id].unidad : ""}, caduca en ${humanoHoras(h)}`,
        tiempo_min: null, accion: { label: "Ver lote", handler: "irA_lotes" },
      });
      oportunidades.push({ id: nid("o"), titulo: `Aprovecha ${nombre}`, motivo: `Sobran existencias y caduca en ${humanoHoras(h)}: promoción o uso prioritario para evitar merma.` });
    });

  // ── 5) Compras sugeridas (stock ≤ punto de pedido), agrupadas por proveedor ─
  const porPedir = materias.filter((m) => estadoStock(m) !== "correcto");
  const porProv = {};
  porPedir.forEach((m) => {
    const key = m.proveedor_id || "sin";
    (porProv[key] = porProv[key] || []).push(m);
  });
  Object.entries(porProv).forEach(([provId, items]) => {
    const prov = provById[provId];
    const criticos = items.filter((m) => estadoStock(m) === "critico").length;
    const nombres = items.slice(0, 3).map((m) => m.nombre).join(", ");
    acciones.push({
      id: nid("pedido"), tipo: "pedido", severidad: criticos ? "critico" : "aviso", prioridad: criticos ? 2 : 5, estado: "pendiente",
      titulo: prov ? `Pedir a ${prov.nombre}` : "Pedir (sin proveedor asignado)",
      motivo: `${items.length} producto(s) bajo punto de pedido: ${nombres}${items.length > 3 ? "…" : ""}`,
      tiempo_min: 4, accion: { label: "Generar pedido", handler: "irA_pedidos" },
    });
  });
  // Riesgo: se quedará sin X (los críticos), con horizonte si se conoce el ritmo.
  porPedir.filter((m) => estadoStock(m) === "critico").slice(0, 6).forEach((m) => {
    riesgos.push({ id: nid("r"), severidad: "aviso", titulo: `Te quedarás sin ${m.nombre}`, motivo: `Stock ${m.disponibilidad_actual} ${m.unidad || ""} (mínimo ${m.stock_minimo}). Pide al proveedor.` });
  });

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
      tiempo_min: 3, accion: { label: "Ver ajustes", handler: "irA_ajustes" },
    });
  }
  const costeMermaHoy = Math.round(ajustes.filter((a) => new Date(a.fecha).toDateString() === hoy).reduce((s, a) => s + (a.coste_estimado || 0), 0) * 100) / 100;
  if (costeMermaHoy > 0) riesgos.push({ id: nid("r"), severidad: "info", titulo: "Merma de hoy", motivo: `${costeMermaHoy.toFixed(2)} € en mermas registradas hoy.` });

  // ── Oportunidad: sobrestock (muy por encima del óptimo) → priorizar uso ──────
  materias.forEach((m) => {
    const opt = m.stock_optimo != null ? Number(m.stock_optimo) : m.stock_ideal != null ? Number(m.stock_ideal) : null;
    if (opt && Number(m.disponibilidad_actual) > opt * 1.5) {
      oportunidades.push({ id: nid("o"), titulo: `Tienes de sobra ${m.nombre}`, motivo: `${m.disponibilidad_actual} ${m.unidad || ""} (óptimo ${opt}). Priorízalo para no generar merma.` });
    }
  });

  acciones.sort((a, b) => a.prioridad - b.prioridad);

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
    acciones,
    riesgos,
    oportunidades,
    produccion,
  };
}

module.exports = { construir };
