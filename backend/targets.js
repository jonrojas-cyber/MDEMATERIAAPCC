// OBJETIVOS · metas configurables del negocio y su progreso real.
// El módulo no calcula los "actuales": los recibe ya calculados (de costing,
// ventas, mermas, laboral) para no duplicar lógica de negocio.

const store = require("./data-store");

// Para estos objetivos, MENOS es mejor (cumples si el real está por debajo).
const MENOR_MEJOR = new Set(["food_cost", "coste_laboral", "merma"]);

const TIPOS = [
  "ventas", "beneficio", "food_cost", "coste_laboral", "merma",
  "ticket_medio", "clientes", "socios", "reserva_caja",
];

function pct(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }

function lista() {
  return store.readAll("business_targets").filter((t) => t.activo !== false);
}

// Evalúa cada objetivo contra su valor real. `actuales` es un mapa tipo→valor.
function evaluar(actuales = {}) {
  return lista().map((t) => {
    const objetivo = Number(t.valor) || 0;
    const real = actuales[t.tipo] != null ? Number(actuales[t.tipo]) : null;
    let progreso = null;
    let cumple = null;
    if (real != null && objetivo > 0) {
      if (MENOR_MEJOR.has(t.tipo)) {
        progreso = pct(objetivo / (real || objetivo)); // 1 = justo en objetivo
        cumple = real <= objetivo;
      } else {
        progreso = pct(real / objetivo);
        cumple = real >= objetivo;
      }
    }
    return {
      id: t.id, tipo: t.tipo, label: t.label || t.tipo, periodo: t.periodo || "mes",
      unidad: t.unidad || "eur", objetivo, real,
      progreso_pct: progreso != null ? Math.round(Math.min(1.5, Math.max(0, progreso)) * 100) : null,
      cumple, menor_mejor: MENOR_MEJOR.has(t.tipo),
    };
  });
}

module.exports = { TIPOS, MENOR_MEJOR, lista, evaluar };
