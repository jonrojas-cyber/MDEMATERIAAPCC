const express = require("express");
const store = require("../data-store");
const { costePorUnidad, tamanosLote } = require("../costing");
const { velocidadConsumo, horasDeStock } = require("../consumo");
const agora = require("../agora");

const router = express.Router();

function horasRestantes(lote) {
  return (new Date(lote.caduca_en).getTime() - Date.now()) / (1000 * 60 * 60);
}

router.get("/", (req, res) => {
  const materias = store.readAll("materias");
  const recetas = store.readAll("recetas");
  const lotes = store.readAll("lotes");
  const revisiones = store.readAll("revisiones");
  const proveedores = store.readAll("proveedores");
  const preparaciones = store.readAll("preparaciones");
  const ajustes = store.readAll("ajustes");

  const hoy = new Date().toDateString();
  const lotesVigentes = lotes.filter((l) => horasRestantes(l) > 0);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  // Coste de producción del día (preparaciones finalizadas hoy)
  const prepHoy = preparaciones.filter(
    (p) => p.estado === "Finalizada" && p.finalizada_en && new Date(p.finalizada_en).toDateString() === hoy
  );
  const costeProduccionHoy = prepHoy.reduce((sum, p) => {
    const receta = recetas.find((r) => r.id === p.receta_id);
    return sum + (receta ? Math.round(costePorUnidad(receta) * p.cantidad_objetivo * 100) / 100 : 0);
  }, 0);

  // Coste de mermas del día
  const ajustesHoy = ajustes.filter((a) => new Date(a.fecha).toDateString() === hoy);
  const costeAjustesHoy = Math.round(ajustesHoy.reduce((sum, a) => sum + (a.coste_estimado || 0), 0) * 100) / 100;

  // Valor total del stock actual
  const valorStockTotal = Math.round(materias.reduce((sum, m) => sum + m.disponibilidad_actual * m.coste_medio, 0) * 100) / 100;

  // Margen bruto medio de la carta (food cost objetivo de hostelería < 30%)
  const productos = store.readAll("productos").filter((p) => p.activo !== false && p.precio_venta > 0);
  const idxMat = {};
  materias.forEach((m) => (idxMat[m.id] = m));
  const margenes = productos.map((p) => {
    const coste = (p.ingredientes || []).reduce((s, ing) => {
      const m = idxMat[ing.materia_id];
      return s + (m ? m.coste_medio * ing.cantidad : 0);
    }, 0);
    return p.precio_venta > 0 ? (p.precio_venta - coste) / p.precio_venta : 0;
  });
  const margenMedioCarta = margenes.length
    ? Math.round((margenes.reduce((s, m) => s + m, 0) / margenes.length) * 1000) / 1000
    : 0;

  // Materias con días de stock restante (basado en consumo promedio de la receta que las usa)
  const diasStock = materias
    .filter((m) => m.disponibilidad_actual <= m.stock_minimo * 1.5)
    .map((m) => {
      const diasRestantes = m.stock_minimo > 0
        ? Math.round((m.disponibilidad_actual / m.stock_minimo) * 10) / 10
        : null;
      return { ...m, dias_estimados: diasRestantes };
    });

  const kpis = {
    coste_produccion_hoy: Math.round(costeProduccionHoy * 100) / 100,
    coste_mermas_hoy: costeAjustesHoy,
    valor_stock_total: valorStockTotal,
    preparaciones_hoy: prepHoy.length,
    ajustes_hoy: ajustesHoy.length,
    margen_medio_carta: margenMedioCarta,
    productos_carta: productos.length,
  };

  // ── PREPARAR (producción JIT con fallback a umbral fijo) ───────────────────
  const consumos = store.readAll("consumos");
  const ahora = Date.now();

  // Ritmo de consumo de cada receta (para el dashboard y la decisión de preparar).
  const ritmoConsumo = recetas.map((r) => {
    const vigentesDeReceta = lotesVigentes.filter((l) => l.receta_id === r.id);
    const totalRestante = vigentesDeReceta.reduce((sum, l) => sum + l.cantidad_restante, 0);
    const velocidad = velocidadConsumo(r.id, consumos, ahora); // unidades/hora o null
    const horasStock = horasDeStock(totalRestante, velocidad);
    return { receta: r, totalRestante, velocidad, horasStock };
  });

  const preparar = ritmoConsumo
    .map(({ receta: r, totalRestante, velocidad, horasStock }) => {
      let recomendar = false;
      let motivo = "";
      let metodo = "umbral";

      if (horasStock != null) {
        // JIT: preparar cuando el stock baja de la mitad de la vida útil de la receta.
        metodo = "ritmo_real";
        recomendar = horasStock < r.vida_util_horas * 0.5;
        motivo = `quedan ${horasStock.toFixed(1)} h de stock al ritmo actual`;
      } else {
        // Fallback: sin histórico suficiente, umbral del 40% del resultado base.
        recomendar = totalRestante < r.resultado_base * 0.4;
        motivo = "por debajo del 40% del resultado base";
      }

      if (!recomendar) return null;
      const opciones = tamanosLote(r);
      return {
        receta_id: r.id,
        nombre: r.nombre,
        disponible_ahora: Math.round(totalRestante * 100) / 100,
        unidad: r.unidad,
        metodo,
        velocidad_por_hora: velocidad != null ? Math.round(velocidad * 100) / 100 : null,
        horas_stock_restante: horasStock != null ? Math.round(horasStock * 10) / 10 : null,
        motivo,
        mensaje: `${r.nombre} — ${motivo}`,
        opciones_tamano: opciones.map((t) => ({
          cantidad: t,
          coste_estimado: Math.round(costePorUnidad(r) * t * 100) / 100,
        })),
      };
    })
    .filter(Boolean);

  // Resumen de ritmo para el dashboard (todas las recetas con histórico).
  const stockEnHoras = ritmoConsumo
    .filter((x) => x.horasStock != null)
    .map((x) => ({
      receta_id: x.receta.id,
      nombre: x.receta.nombre,
      horas_restantes: Math.round(x.horasStock * 10) / 10,
      velocidad_por_hora: Math.round(x.velocidad * 100) / 100,
      unidad: x.receta.unidad,
      mensaje: `${x.receta.nombre} — quedan ${x.horasStock.toFixed(1)} horas de stock al ritmo actual`,
    }))
    .sort((a, b) => a.horas_restantes - b.horas_restantes);

  // ── PEDIR ─────────────────────────────────────────────────────────────────
  const pedir = materias
    .filter((m) => m.disponibilidad_actual <= m.stock_minimo)
    .map((m) => {
      const proveedor = proveedores.find((p) => p.id === m.proveedor_id);
      const cantidadSugerida = Math.round((m.stock_ideal - m.disponibilidad_actual) * 100) / 100;
      return {
        materia_id: m.id,
        nombre: m.nombre,
        disponibilidad_actual: m.disponibilidad_actual,
        unidad: m.unidad,
        cantidad_sugerida: cantidadSugerida,
        valor_stock_actual: Math.round(m.disponibilidad_actual * m.coste_medio * 100) / 100,
        proveedor: proveedor ? proveedor.nombre : "Sin proveedor asignado",
        contacto: proveedor ? proveedor.contacto : "",
        whatsapp: proveedor ? proveedor.whatsapp.replace(/[^0-9+]/g, "") : null,
      };
    });

  // ── REVISAR ───────────────────────────────────────────────────────────────
  const revisar = revisiones.filter(
    (r) => r.estado !== "Correcto" && new Date(r.fecha).toDateString() === hoy
  );

  // ── LOTES A VIGILAR ───────────────────────────────────────────────────────
  const lotesAtencion = lotes
    .filter((l) => {
      const hr = horasRestantes(l);
      return l.estado === "Requiere atención" || l.estado === "Priorizar uso" || (hr > 0 && hr <= 6) || hr <= 0;
    })
    .map((l) => {
      const receta = recetas.find((r) => r.id === l.receta_id);
      return {
        id: l.id,
        codigo: l.codigo,
        nombre: receta ? receta.nombre : l.receta_id,
        estado: l.estado,
        ubicacion: l.ubicacion,
        cantidad_restante: l.cantidad_restante,
        horas_restantes: Math.round(horasRestantes(l) * 10) / 10,
        caducado: horasRestantes(l) <= 0,
      };
    })
    .filter((l) => l.estado !== "Fuera de servicio");

  // ── EN CURSO ──────────────────────────────────────────────────────────────
  const enCurso = preparaciones
    .filter((p) => p.estado === "En curso")
    .map((p) => {
      const receta = recetas.find((r) => r.id === p.receta_id);
      return {
        id: p.id,
        nombre: receta ? receta.nombre : p.receta_id,
        cantidad_objetivo: p.cantidad_objetivo,
        unidad: receta ? receta.unidad : "",
        responsable: p.responsable,
        creada_en: p.creada_en,
      };
    });

  let estadoServicio = "Servicio en orden";
  if (revisar.length > 0 || lotesAtencion.length > 0) estadoServicio = "Requiere atención antes del próximo servicio";
  if (pedir.length >= 3) estadoServicio = "Disponibilidad baja en varias materias";

  // Estado de sincronización con Ágora (TPV)
  const sync = agora.ultimaSync();
  let agoraEstado = { ultima_sync: null, hace_minutos: null, mensaje: "Sin sincronizar con Ágora aún" };
  if (sync && sync.cuando) {
    const min = Math.round((ahora - new Date(sync.cuando).getTime()) / 60000);
    const cuando = min < 60 ? `hace ${min} minutos` : `hace ${Math.round(min / 60)} h`;
    agoraEstado = { ultima_sync: sync.cuando, hace_minutos: min, mensaje: `Última sincronización con Ágora: ${cuando}` };
  }

  res.json({
    estado_servicio: estadoServicio,
    kpis,
    agora: agoraEstado,
    preparar,
    stock_en_horas: stockEnHoras,
    pedir,
    revisar,
    lotes_a_vigilar: lotesAtencion,
    en_curso: enCurso,
  });
});

module.exports = router;
