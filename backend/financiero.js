// FINANCIERO · resumen zoomable (día abierto · mes · año) con la cascada que mira
// de verdad un hostelero:
//   Ventas (neto) → − food cost %  → Margen bruto
//                 → − personal %   → PRIME COST %  (materia + personal)
//                 → − costes fijos %                → EBITDA (€ y %)
// NO recalcula el dinero: toma el P&L mensual de cuenta-resultados (fuente única)
// y lo ESCALA. Fracciona por DÍA ABIERTO — los costes del mes se reparten entre
// los días que de verdad abres (break-even por día abierto), no por día natural.
//
// `componer(base, opts)` es puro (test). `calcular(opts)` reúne del store + motores.

const cr = require("./cuenta-resultados");
const operatingProfile = require("./operating-profile");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
// Ratio en % con 1 decimal (sobre ventas). null si no hay base.
function pctDe(n, base) { return base > 0 ? Math.round((n / base) * 1000) / 10 : null; }

// Días ABIERTOS al mes = días de apertura/semana × (52/12). 6 días ≈ 26,1/mes.
function diasAbiertos(perfil) {
  const d = Number(perfil.dias_semana) > 0 ? Number(perfil.dias_semana) : 6;
  return { dias_semana: d, dias_abiertos_mes: Math.round(d * (365 / 12 / 7) * 10) / 10 };
}

const MESCORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Cascada en € a partir de un P&L (base: {ingresos, coste_materia, personal,
// otros_fijos, variables, cuota_creditos}). Sirve igual para un mes, para el día
// abierto (base escalada ÷ días) o para el ACUMULADO del año (suma de meses).
function cascadaDe(base) {
  const tieneMateria = base.coste_materia != null;
  const V = Number(base.ingresos) || 0;
  const materia = tieneMateria ? (Number(base.coste_materia) || 0) : null;
  const personal = Number(base.personal) || 0;
  const fijos = Number(base.otros_fijos) || 0;
  const variables = Number(base.variables) || 0;
  const margenBruto = tieneMateria ? V - materia : null;
  const primeCost = tieneMateria ? materia + personal : null;
  const ebitda = tieneMateria ? margenBruto - personal - fijos - variables : null;
  const cred = Number(base.cuota_creditos) || 0;
  const caja = ebitda != null ? ebitda - cred : null;
  return {
    ventas: eur(V),
    coste_materia: materia != null ? eur(materia) : null,
    margen_bruto: margenBruto != null ? eur(margenBruto) : null,
    personal: eur(personal),
    prime_cost: primeCost != null ? eur(primeCost) : null,
    otros_fijos: eur(fijos),
    variables: eur(variables),
    ebitda: ebitda != null ? eur(ebitda) : null,
    cuota_creditos: eur(cred),
    resultado_caja: caja != null ? eur(caja) : null,
  };
}

// Ratios sobre ventas (food cost, personal, prime cost, fijos, EBITDA) de un P&L.
function ratiosDe(base) {
  const tieneMateria = base.coste_materia != null;
  const V = Number(base.ingresos) || 0;
  const materia = tieneMateria ? (Number(base.coste_materia) || 0) : null;
  const personal = Number(base.personal) || 0;
  const fijos = Number(base.otros_fijos) || 0;
  const variables = Number(base.variables) || 0;
  const margenBruto = tieneMateria ? V - materia : null;
  const primeCost = tieneMateria ? materia + personal : null;
  const ebitda = tieneMateria ? margenBruto - personal - fijos - variables : null;
  return {
    food_cost_pct: materia != null ? pctDe(materia, V) : null,
    margen_bruto_pct: margenBruto != null ? pctDe(margenBruto, V) : null,
    personal_pct: pctDe(personal, V),
    prime_cost_pct: primeCost != null ? pctDe(primeCost, V) : null,
    fijos_pct: pctDe(fijos, V),
    variables_pct: pctDe(variables, V),
    ebitda_pct: ebitda != null ? pctDe(ebitda, V) : null,
  };
}

// Escala un P&L por un factor (para pasar de mes a día abierto, o a proyección ×N).
function escalarBase(base, f) {
  return {
    ingresos: (Number(base.ingresos) || 0) * f,
    coste_materia: base.coste_materia != null ? (Number(base.coste_materia) || 0) * f : null,
    personal: (Number(base.personal) || 0) * f,
    otros_fijos: (Number(base.otros_fijos) || 0) * f,
    variables: (Number(base.variables) || 0) * f,
    cuota_creditos: (Number(base.cuota_creditos) || 0) * f,
  };
}

// ── COMPONER (puro) ─────────────────────────────────────────────────────────
// base = P&L de UN mes completo. Devuelve día abierto / mes / año (proyección ×12,
// que calcular() sustituye por el ACUMULADO real), ratios del mes y break-even.
function componer(base, opts = {}) {
  const diasAb = Number(opts.dias_abiertos_mes) > 0 ? Number(opts.dias_abiertos_mes) : 26.1;
  const V = Number(base.ingresos) || 0;
  const materia = base.coste_materia != null ? (Number(base.coste_materia) || 0) : null;
  const personal = Number(base.personal) || 0;
  const fijos = Number(base.otros_fijos) || 0;
  const credMes = Number(base.cuota_creditos) || 0;

  // Break-even por día abierto, consistente con la cascada del mes base.
  const contrib = (materia != null && V > 0) ? 1 - (materia / V) : null;
  const fijaMes = personal + fijos;
  const equMes = contrib ? fijaMes / contrib : null;
  const equConCredMes = contrib ? (fijaMes + credMes) / contrib : null;
  const ventasDiaAb = V / diasAb;
  const equDiaAb = equMes != null ? equMes / diasAb : null;
  const equConCredDiaAb = equConCredMes != null ? equConCredMes / diasAb : null;
  const margenSeg = (equDiaAb != null && ventasDiaAb > 0) ? Math.round(((ventasDiaAb - equDiaAb) / ventasDiaAb) * 1000) / 10 : null;

  return {
    ratios: ratiosDe(base),
    escalas: { dia: cascadaDe(escalarBase(base, 1 / diasAb)), mes: cascadaDe(base), anio: cascadaDe(escalarBase(base, 12)) },
    equilibrio: {
      contribucion_pct: contrib != null ? Math.round(contrib * 1000) / 10 : null,
      dia_abierto: equDiaAb != null ? eur(equDiaAb) : null,
      dia_abierto_con_creditos: equConCredDiaAb != null ? eur(equConCredDiaAb) : null,
      mes: equMes != null ? eur(equMes) : null,
      mes_con_creditos: equConCredMes != null ? eur(equConCredMes) : null,
      ventas_dia_abierto: eur(ventasDiaAb),
      margen_seguridad_pct: margenSeg,
      en_perdidas: margenSeg != null ? margenSeg < 0 : null,
    },
  };
}

// ── ACUMULADO DEL AÑO (YTD real) ─────────────────────────────────────────────
// Suma el P&L REAL de cada mes del año en curso con actividad (ventas o costes
// fijos activos), usando la cuenta mensual (fuente única). El mes en curso entra
// hasta hoy. Es "lo que de verdad llevas", no una proyección.
function acumuladoAnio(now = Date.now()) {
  const d = new Date(now);
  const year = d.getFullYear(), mNow = d.getMonth();
  const sum = { ingresos: 0, coste_materia: 0, personal: 0, otros_fijos: 0, variables: 0, cuota_creditos: 0 };
  let tieneMateria = false, primero = null, ultimo = null, nMeses = 0;
  for (let m = 0; m <= mNow; m++) {
    const etq = `${year}-${String(m + 1).padStart(2, "0")}`;
    const c = cr.calcular({ mes: etq, now });
    const cu = c.cuenta || {};
    const V = Number(cu.ingresos) || 0;
    // Solo meses con ventas registradas: así el mes en curso sin cierre (conector
    // atrasado) no distorsiona el acumulado con costes y 0 ingresos. Entra en cuanto
    // tiene ventas. (El coste real del mes en curso se ve en la pestaña "Mes".)
    if (V <= 0) continue;
    sum.ingresos += V;
    if (cu.coste_materia != null) { sum.coste_materia += Number(cu.coste_materia) || 0; tieneMateria = true; }
    sum.personal += Number(cu.personal) || 0;
    sum.otros_fijos += Number(cu.otros_fijos) || 0;
    sum.variables += Number(cu.variables) || 0;
    sum.cuota_creditos += Number(cu.cuota_creditos) || 0;
    if (primero == null) primero = m;
    ultimo = m; nMeses++;
  }
  if (!tieneMateria) sum.coste_materia = null;
  return {
    base: sum, meses: nMeses, year,
    etiqueta: nMeses ? (primero === ultimo ? `${MESCORTO[primero]} ${year}` : `${MESCORTO[primero]}–${MESCORTO[ultimo]} ${year}`) : String(year),
  };
}

// Semáforo de un ratio contra su objetivo. UMBRAL = margen (en puntos) antes de
// pasar de "ok" a "ámbar". null si no hay valor u objetivo. Única fuente del color.
const UMBRAL_PT = 3;
function estadoObjetivo(real, objetivo, menorMejor) {
  if (real == null || objetivo == null || !(objetivo > 0)) return null;
  const exceso = menorMejor ? (real - objetivo) : (objetivo - real); // >0 = peor que el objetivo
  if (exceso <= 0) return "ok";
  if (exceso <= UMBRAL_PT) return "warn";
  return "bad";
}

// Mapa ratio→{objetivo, estado, menor_mejor} usando los objetivos configurados
// (business_targets, fuente única). Lo consumen la vista Financiero y la portada.
function semaforo(ratios) {
  const targets = require("./targets");
  const porTipo = {};
  targets.lista().forEach((t) => { if (t && t.tipo && porTipo[t.tipo] == null) porTipo[t.tipo] = Number(t.valor) || 0; });
  const MENOR = targets.MENOR_MEJOR;
  const defs = [
    ["food_cost", "food_cost", ratios.food_cost_pct],
    ["personal", "coste_laboral", ratios.personal_pct],
    ["prime_cost", "prime_cost", ratios.prime_cost_pct],
    ["fijos", "gastos_fijos", ratios.fijos_pct],
    ["ebitda", "ebitda", ratios.ebitda_pct],
  ];
  const out = {};
  defs.forEach(([clave, tipo, real]) => {
    const objetivo = porTipo[tipo] != null ? porTipo[tipo] : null;
    const menor = MENOR.has(tipo);
    out[clave] = { objetivo, menor_mejor: menor, estado: estadoObjetivo(real, objetivo, menor) };
  });
  return out;
}

// Último mes (hasta 13 atrás) con ventas > 0, para que al abrir la app el resumen
// muestre un EBITDA real y no los ceros del mes en curso sin cierre.
function mesConDatos(now = Date.now()) {
  const d = new Date(now);
  for (let i = 0; i < 13; i++) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const etq = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const c = cr.calcular({ mes: etq, now });
    const base = c.proyeccion || c.cuenta;
    if (base && Number(base.ingresos) > 0) return etq;
  }
  return null;
}

// ── CALCULAR (lee store + motores) ──────────────────────────────────────────
function calcular(opts = {}) {
  const now = opts.now || Date.now();
  const perfil = operatingProfile.leer();
  const { dias_semana, dias_abiertos_mes } = diasAbiertos(perfil);

  // Mes base: param > mes en curso CON datos > último mes con datos > mes en curso.
  let mesBase = opts.mes;
  let autodetectado = false;
  if (!mesBase) {
    const curr = cr.calcular({ now });
    const baseCurr = curr.proyeccion || curr.cuenta;
    if (baseCurr && Number(baseCurr.ingresos) > 0) { mesBase = curr.mes; }
    else { mesBase = mesConDatos(now) || curr.mes; autodetectado = true; }
  }

  const c = cr.calcular({ mes: mesBase, ventas: opts.ventas, foodCost: opts.foodCost, now });
  const base = c.proyeccion || c.cuenta;    // P&L a mes completo (ritmo del mes base)
  const comp = componer(base, { dias_abiertos_mes });

  // AÑO = acumulado REAL del año en curso (suma de meses), no una proyección ×12.
  // Es "lo que de verdad llevas". Tiene su propia cascada y sus propios ratios.
  const ytd = acumuladoAnio(now);
  comp.escalas.anio = cascadaDe(ytd.base);
  const ratiosAnio = ratiosDe(ytd.base);

  return {
    mes_base: c.mes,
    en_curso: c.en_curso,
    autodetectado,                                   // true si no era el mes en curso
    tiene_materia: base.coste_materia != null,
    food_cost_origen: c.cuenta.food_cost_origen,
    ventas_origen: c.cuenta.ventas_origen,
    dias_semana,
    dias_abiertos_mes,
    ratios: comp.ratios,                             // ritmo del mes base (día y mes)
    ratios_anio: ratiosAnio,                         // ratios reales del acumulado del año
    objetivos: semaforo(comp.ratios),
    objetivos_anio: semaforo(ratiosAnio),
    escalas: comp.escalas,
    equilibrio: comp.equilibrio,
    segmentos: segmentos(now, Number(base.ingresos) || 0),
    anio_info: { acumulado: true, meses: ytd.meses, etiqueta: ytd.etiqueta, year: ytd.year },
    nota_anio: ytd.meses ? `Acumulado real de ${ytd.etiqueta} (${ytd.meses} ${ytd.meses === 1 ? "mes" : "meses"})` : `Año ${ytd.year}`,
  };
}

// Segmentos para el detalle: personal por persona + otros fijos por concepto,
// cada línea con su coste mensual y su % sobre las ventas del mes base.
function segmentos(now, ventasMes) {
  const fixedCosts = require("./fixed-costs");
  const lineas = fixedCosts.lineasMensuales(now);
  const map = (l) => ({ nombre: l.nombre, categoria: l.categoria, mensual: l.mensual, pct: pctDe(l.mensual, ventasMes) });
  return {
    personal: lineas.filter((l) => l.es_personal).map(map),
    fijos: lineas.filter((l) => !l.es_personal).map(map),
    personal_total_mes: eur(lineas.filter((l) => l.es_personal).reduce((s, l) => s + l.mensual, 0)),
    fijos_total_mes: eur(lineas.filter((l) => !l.es_personal).reduce((s, l) => s + l.mensual, 0)),
  };
}

module.exports = { calcular, componer, acumuladoAnio, cascadaDe, ratiosDe, mesConDatos, diasAbiertos, semaforo, estadoObjetivo, eur };
