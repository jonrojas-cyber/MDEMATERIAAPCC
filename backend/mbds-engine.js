// MATERIA BEVERAGE DESIGN SYSTEM · motor de cálculo, validación y corrección.
// No es un recetario: es la "física" del laboratorio. Dado un cordial (ingredientes
// + cantidades) o una bebida (cordial + base + vino + agua), calcula TODOS los
// parámetros técnicos (ABV, °Brix, pH, coste, food cost, margen, PVP, salinidad,
// perfil ácido, rendimiento), valida si cumple el estándar M de Materia y, si no,
// propone correcciones concretas. Módulo PURO (sin I/O) → totalmente testable.
//
// Los cálculos son aproximaciones de ingeniería, claramente acotadas:
//  · °Brix y salinidad → media ponderada por cantidad/volumen (densidad ≈ 1).
//  · pH → media de iones H+ (10^-pH), no media aritmética (el pH es logarítmico).
//  · ABV → media ponderada por volumen.

// ── ESTÁNDAR M DE MATERIA ───────────────────────────────────────────────────
const STANDARDS = {
  ph: { obj: 3.18, tol: 0.05, min: 3.13, max: 3.23 },
  brix: { obj: 8.1, tol: 0.3, min: 7.8, max: 8.4 },
  abv: { obj: 7.5, tol: 0.5, min: 7.0, max: 8.0 },
  co2: { obj: 5.8 },              // g/L, editable por lote
  sal: { obj: 0.10, min: 0.08, max: 0.12 }, // %
  temp: { min: 2, max: 4 },       // ºC de servicio
  perfil_acido: { malico: 60, citrico: 25, tartarico: 15 }, // %
  sensorial: { drinkability_min: 8, persistencia_min: 7, salivacion_min: 8, dulzor_max: 5 },
  servicio_ml: 200,
  food_cost_obj: 0.22,            // objetivo de food cost (coste/PVP)
};

const FUNCIONES_SENSORIALES = [
  "Acidez", "Dulzor", "Amargor", "Aromática", "Textura", "Persistencia",
  "Color", "Salinidad", "Carbonatación", "Drinkability",
];

function round(n, d = 2) { const f = Math.pow(10, d); return Math.round((Number(n) || 0) * f) / f; }
function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

// Índice de ingredientes por id.
function indexar(ingredientes) {
  const idx = {};
  (ingredientes || []).forEach((i) => (idx[i.id] = i));
  return idx;
}

// ¿Es un ácido? (para el perfil ácido). Por función o por nombre.
function tipoAcido(ing) {
  const n = (ing.nombre || "").toLowerCase();
  if (/m[áa]lico/.test(n)) return "malico";
  if (/c[íi]trico/.test(n)) return "citrico";
  if (/tart[áa]rico/.test(n)) return "tartarico";
  return null;
}
function esSal(ing) { return /\bsal\b/i.test(ing.nombre || "") || (ing.funcion_sensorial || "").toLowerCase() === "salinidad"; }

// Media logarítmica de pH ponderada por cantidad (sobre partes con pH > 0).
function phMezcla(partes) {
  let h = 0, tot = 0;
  partes.forEach((p) => { if (p.ph > 0 && p.cant > 0) { h += p.cant * Math.pow(10, -p.ph); tot += p.cant; } });
  if (tot <= 0 || h <= 0) return null;
  return round(-Math.log10(h / tot), 2);
}
function mediaPond(partes, campo) {
  let s = 0, tot = 0;
  partes.forEach((p) => { if (p.cant > 0) { s += p.cant * num(p[campo]); tot += p.cant; } });
  return tot > 0 ? s / tot : 0;
}

// ── CORDIAL ─────────────────────────────────────────────────────────────────
// cordial.ingredientes = [{ingrediente_id, cantidad}] en g o ml. coste del
// ingrediente en € por kg/L (base 1000). rendimiento_ml = volumen final tras el
// proceso (si no se indica, se asume la suma de cantidades menos la merma).
function calcularCordial(cordial, ingredientes) {
  const idx = indexar(ingredientes);
  const lineas = (cordial.ingredientes || []).map((ing) => {
    const m = idx[ing.ingrediente_id] || {};
    const cant = num(ing.cantidad);
    const costeLinea = round((cant / 1000) * num(m.coste), 4); // coste €/kg o €/L → €/g o €/ml
    return { ingrediente_id: ing.ingrediente_id, nombre: m.nombre || "—", cantidad: cant, coste: costeLinea, ph: num(m.ph), brix: num(m.brix), sal: esSal(m) ? cant : 0, tipo_acido: tipoAcido(m) };
  });
  const cantTotal = lineas.reduce((s, l) => s + l.cantidad, 0);
  const partes = lineas.map((l) => ({ cant: l.cantidad, ph: l.ph, brix: l.brix }));
  const merma = num(cordial.merma_pct) / 100;
  const rendimiento = num(cordial.rendimiento_ml) > 0 ? num(cordial.rendimiento_ml) : round(cantTotal * (1 - merma));
  const costeTotal = round(lineas.reduce((s, l) => s + l.coste, 0), 4);

  // Perfil ácido (proporción entre los tres ácidos).
  const acidos = { malico: 0, citrico: 0, tartarico: 0 };
  lineas.forEach((l) => { if (l.tipo_acido) acidos[l.tipo_acido] += l.cantidad; });
  const sumaAcidos = acidos.malico + acidos.citrico + acidos.tartarico;
  const perfilAcido = sumaAcidos > 0
    ? { malico: round((acidos.malico / sumaAcidos) * 100, 1), citrico: round((acidos.citrico / sumaAcidos) * 100, 1), tartarico: round((acidos.tartarico / sumaAcidos) * 100, 1) }
    : null;

  const salGramos = lineas.reduce((s, l) => s + l.sal, 0);
  return {
    coste_total: costeTotal,
    coste_por_litro: rendimiento > 0 ? round((costeTotal / rendimiento) * 1000, 4) : 0,
    brix: round(mediaPond(partes, "brix"), 2),
    ph: phMezcla(partes),
    salinidad: cantTotal > 0 ? round((salGramos / cantTotal) * 100, 3) : 0,
    perfil_acido: perfilAcido,
    rendimiento_ml: round(rendimiento),
    merma_pct: round(merma * 100, 1),
    cantidad_total: round(cantTotal),
    lineas,
  };
}

// ── BEBIDA FINAL ────────────────────────────────────────────────────────────
// bebida.cordial_ml (ml del cordial ya calculado) + componentes [{ingrediente_id, ml}]
// (base alcohólica, vino, agua…). volumen_total opcional (si no, suma). La bebida
// SIEMPRE va carbonatada terminada (co2 g/L por lote). servicio_ml por defecto 200.
function calcularBebida(bebida, cordialCalc, ingredientes) {
  const idx = indexar(ingredientes);
  const partes = [];
  // Cordial como una parte más.
  const cml = num(bebida.cordial_ml);
  if (cml > 0 && cordialCalc) {
    partes.push({ nombre: "Cordial", cant: cml, abv: num(bebida.cordial_abv), brix: num(cordialCalc.brix), ph: num(cordialCalc.ph), sal: num(cordialCalc.salinidad), coste_ml: num(cordialCalc.coste_por_litro) / 1000 });
  }
  (bebida.componentes || []).forEach((c) => {
    const m = idx[c.ingrediente_id] || {};
    const ml = num(c.ml);
    if (ml <= 0) return;
    partes.push({ nombre: m.nombre || "—", cant: ml, abv: num(m.abv), brix: num(m.brix), ph: num(m.ph), sal: esSal(m) ? 100 : 0, coste_ml: num(m.coste) / 1000 });
  });

  const totalMl = num(bebida.volumen_total) > 0 ? num(bebida.volumen_total) : partes.reduce((s, p) => s + p.cant, 0);
  const abv = round(partes.reduce((s, p) => s + p.cant * p.abv, 0) / (totalMl || 1), 2);
  const brix = round(mediaPond(partes, "brix"), 2);
  const ph = phMezcla(partes);
  const salinidad = round(mediaPond(partes, "sal"), 3);
  const coste = round(partes.reduce((s, p) => s + p.cant * p.coste_ml, 0), 4);

  const servicioMl = num(bebida.servicio_ml) > 0 ? num(bebida.servicio_ml) : STANDARDS.servicio_ml;
  const servicios = servicioMl > 0 ? Math.floor(totalMl / servicioMl) : 0;
  const costeServicio = servicios > 0 ? round(coste / servicios, 4) : 0;
  const pvpRec = costeServicio > 0 ? round(costeServicio / STANDARDS.food_cost_obj, 2) : 0;
  const pvp = num(bebida.pvp) > 0 ? num(bebida.pvp) : pvpRec;
  const foodCost = pvp > 0 ? round((costeServicio / pvp) * 100, 1) : null;
  const margen = pvp > 0 ? round(((pvp - costeServicio) / pvp) * 100, 1) : null;

  return {
    volumen_total: round(totalMl),
    abv, brix, ph, co2: num(bebida.co2) || STANDARDS.co2.obj, salinidad,
    coste_total: coste,
    servicios,
    coste_por_servicio: costeServicio,
    pvp_recomendado: pvpRec,
    pvp,
    food_cost_pct: foodCost,
    margen_pct: margen,
    partes,
  };
}

// ── VALIDACIÓN · "Materia Apta" ─────────────────────────────────────────────
// sensorial = {drinkability, persistencia, salivacion, dulzor} (de la última cata
// o del objetivo). alcoholica = la bebida lleva alcohol (aplica el rango de ABV).
function validar(calc, sensorial = {}, alcoholica = true) {
  const S = STANDARDS;
  const checks = [];
  const chk = (clave, label, valor, min, max, unidad, sol) => {
    const ok = valor != null && valor >= min && valor <= max;
    checks.push({ clave, label, valor, rango: `${min}–${max}${unidad || ""}`, ok, solucion: ok ? null : sol });
  };
  chk("ph", "pH", calc.ph, S.ph.min, S.ph.max, "", "Ajusta la acidez: si el pH es alto, sube ácido cítrico; si es bajo, reduce cítrico y sube málico.");
  chk("brix", "°Brix", calc.brix, S.brix.min, S.brix.max, "", "Si sobra dulzor, reduce azúcar/cordial o añade agua; si falta, sube ligeramente el cordial.");
  if (alcoholica) chk("abv", "Alcohol", calc.abv, S.abv.min, S.abv.max, " % vol", "Ajusta la base alcohólica o el agua para acercar el ABV a 7.5 %.");
  chk("sal", "Sal", calc.salinidad, S.sal.min, S.sal.max, " %", "Ajusta la sal a ~0.10 %: potencia salivación sin sabor salado.");
  const sn = sensorial || {};
  // Sensorial: si no hay dato (no catada), queda PENDIENTE (ok:null), no es un fallo.
  const chkMin = (clave, label, valor, min, sol) => { const ok = valor == null ? null : valor >= min; checks.push({ clave, label, valor: valor != null ? valor : null, rango: `≥ ${min}`, ok, pendiente: valor == null, solucion: ok === false ? sol : null }); };
  const chkMax = (clave, label, valor, max, sol) => { const ok = valor == null ? null : valor <= max; checks.push({ clave, label, valor: valor != null ? valor : null, rango: `≤ ${max}`, ok, pendiente: valor == null, solucion: ok === false ? sol : null }); };
  chkMin("drinkability", "Drinkability", sn.drinkability, S.sensorial.drinkability_min, "No invita al siguiente sorbo: reduce dulzor, revisa amargor y acidez, ajusta carbonatación.");
  chkMin("persistencia", "Persistencia", sn.persistencia, S.sensorial.persistencia_min, "Poca longitud: revisa botánicos, taninos (té blanco) y salinidad.");
  chkMin("salivacion", "Salivación", sn.salivacion, S.sensorial.salivacion_min, "Sube ligeramente ácido málico y ajusta la sal para provocar salivación.");
  chkMax("dulzor", "Dulzor", sn.dulzor, S.sensorial.dulzor_max, "Demasiado dulce: reduce cordial/azúcar, sube málico y añade algo de agua.");

  const fallos = checks.filter((c) => c.ok === false);
  const pendientes = checks.filter((c) => c.ok === null);
  return { apta: fallos.length === 0 && pendientes.length === 0, fallos_tecnicos: fallos.length > 0, checks, fallos, pendientes };
}

// ── CORRECCIÓN · soluciones concretas según el problema ─────────────────────
function corregir(calc, sensorial = {}) {
  const S = STANDARDS, out = [];
  const add = (problema, acciones) => out.push({ problema, acciones });
  if (calc.brix != null && calc.brix > S.brix.max) add("Está dulce (°Brix alto)", ["Reducir cordial", "Reducir azúcar", "Subir ácido málico", "Aumentar agua"]);
  if (sensorial.dulzor != null && sensorial.dulzor > S.sensorial.dulzor_max) add("Percibida dulce en cata", ["Reducir cordial", "Reducir azúcar", "Subir ácido málico", "Aumentar agua"]);
  if (calc.ph != null && calc.ph > S.ph.max) add("Está plana (pH alto)", ["Bajar pH", "Aumentar cítrico", "Subir CO₂"]);
  if (calc.ph != null && calc.ph < S.ph.min) add("Está agresiva (pH bajo)", ["Reducir cítrico", "Aumentar málico", "Reducir CO₂"]);
  if (sensorial.persistencia != null && sensorial.persistencia < S.sensorial.persistencia_min) add("Poca persistencia", ["Revisar botánicos", "Revisar taninos", "Revisar té blanco", "Revisar salinidad"]);
  if (sensorial.drinkability != null && sensorial.drinkability < S.sensorial.drinkability_min) add("No invita al siguiente sorbo", ["Reducir dulzor", "Revisar amargor", "Revisar acidez", "Revisar carbonatación"]);
  if (calc.abv != null && calc.abv > S.abv.max) add("Alcohol alto", ["Reducir base alcohólica", "Aumentar agua o cordial 0.0"]);
  if (calc.abv != null && calc.abv < S.abv.min) add("Alcohol bajo", ["Aumentar base alcohólica", "Reducir agua"]);
  if (calc.salinidad != null && (calc.salinidad < S.sal.min || calc.salinidad > S.sal.max)) add("Sal fuera de rango", ["Ajustar sal a ~0.10 %"]);
  return out;
}

module.exports = {
  STANDARDS, FUNCIONES_SENSORIALES,
  indexar, calcularCordial, calcularBebida, validar, corregir, round,
};
