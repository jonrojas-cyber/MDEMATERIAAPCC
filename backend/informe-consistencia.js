// Informe semanal de CONSISTENCIA de producción (solo lectura).
//
// Pregunta que responde: ¿cada lote salió como debía y la casa funcionó con
// rigor esta semana? No mira ventas ni dinero de caja: solo producción,
// trazabilidad, APPCC, mermas, stock e incidencias. Lo consume una tarea
// programada externa (Claude) vía GET /informe/consistencia con token propio.
//
// Función pura sobre el data-store: generar(store, { ahora, dias }).
const tz = require("./tz");

const DIA_MS = 86400000;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function enRango(iso, desde, hasta) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= desde && t < hasta;
}

function contarPor(items, clave) {
  const o = {};
  for (const it of items) {
    const k = clave(it) || "—";
    o[k] = (o[k] || 0) + 1;
  }
  return o;
}

function top(obj, n, campo = "n") {
  return Object.entries(obj)
    .map(([k, v]) => (typeof v === "object" ? { nombre: k, ...v } : { nombre: k, [campo]: v }))
    .sort((a, b) => (b.coste_eur ?? b[campo] ?? 0) - (a.coste_eur ?? a[campo] ?? 0))
    .slice(0, n);
}

function generar(store, opts = {}) {
  const ahora = opts.ahora ? new Date(opts.ahora).getTime() : Date.now();
  const dias = Math.min(Math.max(Number(opts.dias) || 7, 1), 31);
  const desde = ahora - dias * DIA_MS;
  const leer = (e) => (store.readAll(e) || []).filter((x) => x && !x.eliminado);

  const materias = leer("materias");
  const recetas = leer("recetas");
  const nombreMateria = (id) => (materias.find((m) => m.id === id) || {}).nombre || id;
  const nombreReceta = (id) => (recetas.find((r) => r.id === id) || {}).nombre || id;

  // Días locales (Málaga) del periodo, del más antiguo al más reciente.
  const diasLocales = [];
  for (let i = dias - 1; i >= 0; i--) diasLocales.push(tz.fechaLocal(new Date(ahora - i * DIA_MS)));

  // ── Producción ───────────────────────────────────────────────────────────
  const preps = leer("preparaciones");
  const prepsPeriodo = preps.filter((p) => enRango(p.creada_en, desde, ahora));
  const prepsAtascadas = preps
    .filter((p) => p.estado === "En curso" && new Date(p.creada_en).getTime() < ahora - DIA_MS)
    .map((p) => ({ id: p.id, receta: nombreReceta(p.receta_id), desde: p.creada_en, paso: `${p.paso_actual || 0}/${(p.pasos || []).length}`, responsable: p.responsable }));

  const lotes = leer("lotes");
  const lotesPeriodo = lotes.filter((l) => enRango(l.producido_en, desde, ahora));
  const lotesProd = leer("lotes_produccion").filter((l) => enRango(l.fecha, desde, ahora));
  const porProducto = {};
  for (const l of lotesProd) {
    const k = l.producto || l.tipo || "—";
    const o = (porProducto[k] = porProducto[k] || { lotes: 0, litros: 0, unidades: 0 });
    o.lotes++;
    o.litros = r2(o.litros + (Number(l.litros) || 0));
    o.unidades += Number(l.unidades) || 0;
  }

  // ── Trazabilidad de lotes ────────────────────────────────────────────────
  const activos = lotes.filter((l) => l.estado !== "Fuera de servicio" && Number(l.cantidad_restante) > 0);
  const caducadosEnServicio = activos
    .filter((l) => l.caduca_en && new Date(l.caduca_en).getTime() < ahora)
    .map((l) => ({ codigo: l.codigo, receta: nombreReceta(l.receta_id), caduco: l.caduca_en, restante: l.cantidad_restante, ubicacion: l.ubicacion || "" }));
  const caducanEn24h = activos.filter((l) => {
    const t = new Date(l.caduca_en).getTime();
    return t >= ahora && t < ahora + DIA_MS;
  }).length;

  // ── APPCC: revisiones ────────────────────────────────────────────────────
  const revs = leer("revisiones").filter((r) => enRango(r.fecha, desde, ahora));
  const fueraRango = revs.filter((r) => r.estado && r.estado !== "Correcto");
  const diasConRevision = new Set(revs.map((r) => tz.fechaLocal(r.fecha)));

  // ── Rutinas de apertura y cierre ─────────────────────────────────────────
  const docsRutina = leer("apertura");
  const rutinas = diasLocales.map((d) => {
    const ap = docsRutina.find((a) => a.id === d);
    const ci = docsRutina.find((a) => a.id === `cierre-${d}`);
    const n = (doc) => (doc && doc.pasos ? Object.values(doc.pasos).filter((p) => p && p.hecho).length : 0);
    return { dia: d, apertura_pasos: n(ap), cierre_pasos: n(ci) };
  });

  // ── Mermas (ajustes: única fuente) ──────────────────────────────────────
  const mermas = leer("ajustes").filter((a) => enRango(a.fecha, desde, ahora));
  const porMotivo = {};
  const porObjetivo = {};
  for (const a of mermas) {
    const c = Number(a.coste_estimado) || 0;
    const m = (porMotivo[a.motivo || "sin motivo"] = porMotivo[a.motivo || "sin motivo"] || { n: 0, coste_eur: 0 });
    m.n++; m.coste_eur = r2(m.coste_eur + c);
    const nombre = a.objetivo_nombre || (a.tipo_objetivo === "materia" ? nombreMateria(a.objetivo_id) : a.objetivo_id) || "—";
    const o = (porObjetivo[nombre] = porObjetivo[nombre] || { n: 0, coste_eur: 0 });
    o.n++; o.coste_eur = r2(o.coste_eur + c);
  }

  // ── Stock ────────────────────────────────────────────────────────────────
  const bajoMinimo = materias
    .filter((m) => Number(m.stock_minimo) > 0 && Number(m.disponibilidad_actual) < Number(m.stock_minimo))
    .map((m) => ({ nombre: m.nombre, actual: Number(m.disponibilidad_actual) || 0, minimo: Number(m.stock_minimo), unidad: m.unidad }))
    .sort((a, b) => a.actual / a.minimo - b.actual / b.minimo);
  const negativo = materias.filter((m) => Number(m.disponibilidad_actual) < 0).map((m) => m.nombre);
  const sinMinimo = materias.filter((m) => !(Number(m.stock_minimo) > 0)).length;

  const inventarios = leer("inventarios").filter((i) => enRango(i.fecha, desde, ahora));

  // ── Incidencias abiertas ─────────────────────────────────────────────────
  const incAbiertas = leer("incidencias")
    .filter((i) => i.estado !== "resuelta")
    .map((i) => ({ titulo: i.titulo, categoria: i.categoria, prioridad: i.prioridad, desde: i.fecha }));

  return {
    periodo: { desde: new Date(desde).toISOString(), hasta: new Date(ahora).toISOString(), dias, zona: tz.TZ },
    produccion: {
      preparaciones_iniciadas: prepsPeriodo.length,
      preparaciones_finalizadas: prepsPeriodo.filter((p) => p.estado !== "En curso").length,
      preparaciones_atascadas: prepsAtascadas,
      lotes_por_receta: contarPor(lotesPeriodo.map((l) => ({ ...l, n: nombreReceta(l.receta_id) })), (l) => l.n),
      lotes_barril_por_producto: porProducto,
    },
    trazabilidad: {
      lotes_activos: activos.length,
      caducados_en_servicio: caducadosEnServicio,
      caducan_en_24h: caducanEn24h,
    },
    appcc: {
      revisiones: revs.length,
      fuera_de_rango: fueraRango.length,
      fuera_de_rango_sin_accion: fueraRango.filter((r) => !String(r.accion_correctiva || "").trim()).length,
      fuera_de_rango_sin_resolver: fueraRango.filter((r) => !r.resuelta_en).length,
      por_tipo: contarPor(revs, (r) => r.tipo),
      dias_sin_revision: diasLocales.filter((d) => !diasConRevision.has(d)),
    },
    rutinas,
    mermas: {
      registros: mermas.length,
      coste_total_eur: r2(mermas.reduce((s, a) => s + (Number(a.coste_estimado) || 0), 0)),
      por_motivo: top(porMotivo, 6),
      top_productos: top(porObjetivo, 6),
    },
    stock: {
      bajo_minimo: bajoMinimo.slice(0, 15),
      bajo_minimo_total: bajoMinimo.length,
      negativo,
      materias_sin_minimo: sinMinimo,
      materias_total: materias.length,
    },
    inventarios: {
      recuentos: inventarios.length,
      lineas_con_descuadre: inventarios.reduce((s, i) => s + (Number(i.lineas_con_descuadre) || 0), 0),
      descuadre_eur: r2(inventarios.reduce((s, i) => s + (Number(i.descuadre_eur) || 0), 0)),
    },
    incidencias_abiertas: incAbiertas,
    recetas_definidas: recetas.length,
  };
}

module.exports = { generar };
