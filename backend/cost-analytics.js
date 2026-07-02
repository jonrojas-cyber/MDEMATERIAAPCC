// COST ANALYTICS ENGINE + COST FORECAST ENGINE
// Convierte la lista de costes fijos en inteligencia: detecta subidas anómalas,
// suscripciones duplicadas, servicios probablemente sin uso y contratos caros
// renegociables — y estima el impacto anual de cada oportunidad de ahorro.
// El forecast de coste compone forecast.js (histórico de snapshots) más la
// proyección por inflación de fixed-costs. No recalcula dinero por su cuenta.

const store = require("./data-store");
const fixedCosts = require("./fixed-costs");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Categorías típicamente renegociables (donde una llamada suele bajar el precio).
const RENEGOCIABLES = new Set([
  "Software", "Seguros", "Internet", "Teléfono", "Luz", "Gas", "Marketing",
  "Comisiones bancarias", "Alarma", "Seguridad", "Renting", "Leasing",
]);
// Categorías de suscripción (donde los duplicados y el olvido son frecuentes).
const SUSCRIPCIONES = new Set(["Software", "Suscripciones", "Marketing", "TPV", "Alarma"]);

function mensualDe(f) { return fixedCosts.costeDiario(f) * (365 / 12); }

// ── COST ANALYTICS ENGINE ───────────────────────────────────────────────────
function alertas(now = Date.now()) {
  const activos = store.readAll("fixed_costs").filter((f) => fixedCosts.activoEn(f, now) && f.periodicity !== "one_time");
  const out = [];

  // 1) Suscripciones duplicadas: mismo proveedor/nombre normalizado repetido en
  //    categorías de suscripción → probablemente pagas dos veces lo mismo.
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const grupos = {};
  activos.filter((f) => SUSCRIPCIONES.has(f.category)).forEach((f) => {
    const clave = norm(f.provider || f.name);
    if (!clave) return;
    (grupos[clave] = grupos[clave] || []).push(f);
  });
  Object.values(grupos).filter((g) => g.length > 1).forEach((g) => {
    const menor = g.reduce((a, b) => (mensualDe(a) <= mensualDe(b) ? a : b));
    const ahorroMes = mensualDe(menor);
    out.push({
      tipo: "duplicado", severidad: "importante",
      titulo: `Posible suscripción duplicada: ${g[0].provider || g[0].name}`,
      detalle: `${g.length} cargos parecidos en ${g[0].category}. Revisa si pagas el mismo servicio más de una vez.`,
      ahorro_anual: eur(ahorroMes * 12),
      costes: g.map((f) => f.id),
    });
  });

  // 2) Servicio probablemente sin uso: coste recurrente cuyo contrato terminó
  //    (end_date pasada) pero sigue activo, o sin proveedor y con nota vacía.
  activos.forEach((f) => {
    if (f.end_date) {
      const e = new Date(f.end_date).getTime();
      if (Number.isFinite(e) && e < now) {
        out.push({
          tipo: "sin_uso", severidad: "importante",
          titulo: `Contrato vencido aún activo: ${f.name}`,
          detalle: `Su fecha de fin (${f.end_date}) ya pasó pero sigue contando como coste. Dalo de baja si no lo usas.`,
          ahorro_anual: eur(mensualDe(f) * 12), costes: [f.id],
        });
      }
    }
  });

  // 3) Contratos caros renegociables: el mayor coste de cada categoría negociable
  //    por encima de un umbral relevante → merece una llamada.
  const porCat = {};
  activos.filter((f) => RENEGOCIABLES.has(f.category)).forEach((f) => {
    if (!porCat[f.category] || mensualDe(f) > mensualDe(porCat[f.category])) porCat[f.category] = f;
  });
  Object.values(porCat).forEach((f) => {
    const mes = mensualDe(f);
    if (mes >= 50) {
      // Estimamos un ahorro conservador del 10% al renegociar.
      out.push({
        tipo: "renegociar", severidad: "info",
        titulo: `Oportunidad de renegociar: ${f.name}`,
        detalle: `${eur(mes)} €/mes en ${f.category}. Renegociar suele bajar un 10–20 %.`,
        ahorro_anual: eur(mes * 12 * 0.1), costes: [f.id],
      });
    }
  });

  // 4) Subidas anómalas de coste fijo total (z-score sobre el histórico diario).
  try {
    const anomaly = require("./anomaly");
    const cfg = { metric: "fixed_cost_dia", senal: "flow", malo: "sube", label: "Coste fijo",
      txt: { sube: "El coste fijo diario subió de forma inusual", baja: "El coste fijo bajó de forma inusual" },
      accion: "Revisa qué coste ha cambiado este mes." };
    const a = anomaly.analizar(cfg, localId);
    if (a && a.preocupante) {
      out.push({
        tipo: "subida", severidad: "importante",
        titulo: "Subida anómala del coste fijo",
        detalle: a.explicacion || "El coste fijo diario se ha desviado de su patrón habitual.",
        ahorro_anual: null, costes: [],
      });
    }
  } catch (e) { /* anomaly opcional: si no hay histórico, no bloquea */ }

  const orden = { importante: 0, info: 1 };
  out.sort((a, b) => (orden[a.severidad] - orden[b.severidad]) || (b.ahorro_anual || 0) - (a.ahorro_anual || 0));
  const ahorroTotal = eur(out.reduce((s, x) => s + (x.ahorro_anual || 0), 0));
  return { alertas: out, ahorro_anual_potencial: ahorroTotal, n: out.length };
}

// ── COST FORECAST ENGINE ────────────────────────────────────────────────────
// Previsión del coste fijo: histórico (regresión sobre snapshots) si lo hay, y
// siempre la proyección por inflación a 12 meses (arquitectura, nunca hardcode).
function forecast(now = Date.now(), inflacionDefault = 0, localId = "principal") {
  const proyeccion = fixedCosts.costeAnualProyectado(now, inflacionDefault);
  let historico = { disponible: false };
  try {
    const fc = require("./forecast");
    const h = fc.horizontes("fixed_cost_dia", localId);
    if (h.disponible) historico = { disponible: true, horizontes: h.horizontes };
  } catch (e) { /* sin histórico suficiente: solo proyección por inflación */ }
  return {
    inflacion_default_pct: Number(inflacionDefault) || 0,
    anual_actual: proyeccion.base,
    anual_proyectado: proyeccion.proyectado,
    incremento_anual: proyeccion.incremento,
    historico,
  };
}

// ── EVOLUCIÓN HISTÓRICA (mes vs mes, año vs año) ────────────────────────────
function evolucion(now = Date.now(), localId = "principal") {
  let serie = [];
  try { serie = require("./snapshot-engine").historico(400, localId); } catch (e) { serie = []; }
  if (!serie.length) return { disponible: false };
  const DAY = 86400000;
  const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const valorEn = (diasAtras) => {
    const objetivo = ymd(now - diasAtras * DAY);
    let cand = null;
    for (const s of serie) { if (s.fecha <= objetivo && s.fixed_cost_dia != null) cand = s; }
    return cand ? Number(cand.fixed_cost_dia) : null;
  };
  const hoy = Number(serie[serie.length - 1].fixed_cost_dia) || 0;
  const cmp = (ref) => (ref != null ? { desde: eur(ref * (365 / 12)), hasta: eur(hoy * (365 / 12)), abs: eur((hoy - ref) * (365 / 12)), pct: ref !== 0 ? Math.round(((hoy - ref) / Math.abs(ref)) * 100) : null } : null);
  return {
    disponible: true,
    dias_registrados: serie.length,
    mes_vs_mes: cmp(valorEn(30)),
    anio_vs_anio: cmp(valorEn(365)),
  };
}

module.exports = { alertas, forecast, evolucion, RENEGOCIABLES, SUSCRIPCIONES };
