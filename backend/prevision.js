// Motor de PREVISIÓN DE DEMANDA por día de la semana.
//
// Aprende de las ventas reales (las que entran de Ágora): para cada producto y
// cada día de la semana, calcula cuánto se vende de media. Cuantas más semanas
// de datos, más fiable (se cuenta el nº de semanas observadas como "confianza").
//
// Con esa estimación:
//   · explota cada producto a sus materias (escandallo) → demanda de materias.
//   · compara con el stock actual → qué FALTARÍA para llegar a las ventas
//     estimadas del día.
//   · para las recetas cuyo resultado es una materia (p. ej. "Cold brew"),
//     recomienda cuánto PRODUCIR para cubrir ese déficit.

const store = require("./data-store");

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Agrupa ventas por (producto, día de la semana) con nº de semanas (fechas
// distintas) para saber la confianza.
function aprender() {
  const acc = {};
  store.readAll("ventas").forEach((v) => {
    if (!v.fecha) return;
    const d = new Date(v.fecha);
    if (isNaN(d.getTime())) return;
    const wd = d.getDay();
    const pid = v.producto_id || v.producto || "?";
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const k = pid + "|" + wd;
    if (!acc[k]) acc[k] = { producto_id: v.producto_id || null, producto: v.producto || v.producto_id, weekday: wd, total: 0, fechas: new Set() };
    acc[k].total += Number(v.cantidad) || 0;
    acc[k].fechas.add(dateKey);
  });
  return acc;
}

// Estimación de unidades por producto para un día de la semana (0=Dom … 6=Sáb).
function estimacionPara(weekday) {
  const acc = aprender();
  return Object.values(acc)
    .filter((x) => x.weekday === weekday)
    .map((x) => {
      const semanas = x.fechas.size;
      const media = semanas > 0 ? x.total / semanas : 0;
      return { producto_id: x.producto_id, producto: x.producto, unidades_estimadas: Math.round(media * 10) / 10, semanas };
    })
    .sort((a, b) => b.unidades_estimadas - a.unidades_estimadas);
}

// Qué materia repone cada receta. Fuente de verdad: el campo explícito
// produce_materia_id. Si el campo NO existe (recetas antiguas), se cae a
// coincidencia por nombre como respaldo. Un campo presente pero vacío = "no
// produce ninguna materia" (evita falsos positivos como Matcha base).
function materiaDeReceta(receta, materias) {
  if (Object.prototype.hasOwnProperty.call(receta, "produce_materia_id")) {
    return receta.produce_materia_id || null;
  }
  const m = materias.find((x) => x.nombre && receta.nombre && x.nombre.toLowerCase() === receta.nombre.toLowerCase());
  return m ? m.id : null;
}

// Plan completo del día: estimación + materias que faltan + qué producir.
function planDia(weekday) {
  const est = estimacionPara(weekday);
  const productos = store.readAll("productos");
  const prodById = {}; productos.forEach((p) => (prodById[p.id] = p));
  const materias = store.readAll("materias");
  const matById = {}; materias.forEach((m) => (matById[m.id] = m));
  const recetas = store.readAll("recetas");

  // Demanda por materia = Σ (unidades estimadas del producto × escandallo).
  const demanda = {};
  est.forEach((e) => {
    const p = prodById[e.producto_id] ||
      productos.find((x) => x.nombre && e.producto && x.nombre.toLowerCase() === String(e.producto).toLowerCase());
    if (!p) return;
    (p.ingredientes || []).forEach((ing) => {
      demanda[ing.materia_id] = (demanda[ing.materia_id] || 0) + (Number(ing.cantidad) || 0) * e.unidades_estimadas;
    });
  });

  const materiasPlan = Object.entries(demanda)
    .map(([mid, dem]) => {
      const m = matById[mid];
      if (!m) return null;
      const disp = Number(m.disponibilidad_actual) || 0;
      const falta = Math.round((dem - disp) * 100) / 100;
      return {
        materia_id: mid, nombre: m.nombre, unidad: m.unidad || "",
        demanda: Math.round(dem * 100) / 100, disponible: disp,
        falta: falta > 0 ? falta : 0, cubierto: falta <= 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.falta - a.falta);

  // Producción recomendada: recetas cuyo resultado es una materia con déficit.
  const produccion = recetas
    .map((r) => {
      const outId = materiaDeReceta(r, materias);
      if (!outId) return null;
      const plan = materiasPlan.find((x) => x.materia_id === outId);
      if (!plan || plan.falta <= 0) return null;
      return { receta_id: r.id, nombre: r.nombre, unidad: r.unidad || plan.unidad, producir: plan.falta, para_materia: plan.nombre };
    })
    .filter(Boolean);

  const semanasDatos = est.reduce((max, e) => Math.max(max, e.semanas), 0);
  const totalUnidades = Math.round(est.reduce((s, e) => s + e.unidades_estimadas, 0) * 10) / 10;

  return {
    weekday, dia: DIAS[weekday],
    semanas_datos: semanasDatos,
    total_unidades_estimadas: totalUnidades,
    estimacion: est,
    materias: materiasPlan,
    produccion,
  };
}

module.exports = { aprender, estimacionPara, planDia, DIAS };
