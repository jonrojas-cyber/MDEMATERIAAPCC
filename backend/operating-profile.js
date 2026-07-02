// PERFIL OPERATIVO · los parámetros del negocio que convierten costes en
// inteligencia: horas de apertura (coste por hora), ticket medio (break-even en
// clientes/cafés) e inflación por defecto (proyección). Singleton configurable —
// nunca hardcodeado. Si no hay override guardado, usa valores sensatos de café.

const store = require("./data-store");

const ID = "perfil";

// Valores por defecto de una cafetería de especialidad (editables por el dueño).
const DEFAULTS = {
  dias_semana: 6,        // días de apertura a la semana
  horas_dia: 10,         // horas de apertura al día
  ticket_medio: 4.5,     // gasto medio por cliente (€) — semilla; se refina con ventas
  cafe_medio: 2.2,       // precio medio de un café (€) — para "cafés hasta equilibrio"
  inflacion_anual_pct: 3, // subida anual por defecto para proyección de costes
};

function leer() {
  const reg = store.findById("business_config", ID) || {};
  const p = { ...DEFAULTS };
  ["dias_semana", "horas_dia", "ticket_medio", "cafe_medio", "inflacion_anual_pct"].forEach((k) => {
    if (reg[k] != null && reg[k] !== "" && Number.isFinite(Number(reg[k]))) p[k] = Number(reg[k]);
  });
  return p;
}

async function guardar(patch = {}) {
  const actual = store.findById("business_config", ID);
  const limpio = {};
  ["dias_semana", "horas_dia", "ticket_medio", "cafe_medio", "inflacion_anual_pct"].forEach((k) => {
    if (patch[k] != null && patch[k] !== "" && Number.isFinite(Number(patch[k]))) limpio[k] = Number(patch[k]);
  });
  if (actual) {
    store.update("business_config", ID, { ...limpio, updated_at: new Date().toISOString() });
  } else {
    store.insert("business_config", { id: ID, ...limpio, creado_en: new Date().toISOString(), updated_at: new Date().toISOString() });
  }
  await store.flush();
  return leer();
}

module.exports = { DEFAULTS, leer, guardar };
