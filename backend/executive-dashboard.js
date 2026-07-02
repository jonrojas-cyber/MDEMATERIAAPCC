// CENTRO DE CONTROL · ensambla todos los bloques del dashboard ejecutivo a partir
// de los módulos financieros (que a su vez componen costing.js). Punto único que
// consume la ruta /api/executive-dashboard. Nada de dinero se calcula aquí: se orquesta.

const periods = require("./periods");
const financials = require("./financials");
const health = require("./business-health");
const treasury = require("./treasury");
const debtsMod = require("./debts");
const assetsMod = require("./assets");
const staff = require("./staff-finance");
const targets = require("./targets");
const inventoryCapital = require("./inventory-capital");
const copilot = require("./copilot");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function delta(actual, anterior) {
  if (actual == null || anterior == null) return null;
  return { abs: eur(actual - anterior), pct: anterior !== 0 ? Math.round(((actual - anterior) / Math.abs(anterior)) * 100) : null };
}

// Valores reales por objetivo, cada uno en el periodo que le corresponde.
function actualesObjetivos(now) {
  const out = {};
  targets.lista().forEach((t) => {
    const r = periods.rango(t.periodo || "mes", now);
    const ben = financials.beneficio(r, now);
    switch (t.tipo) {
      case "ventas": out.ventas = ben.ventas; break;
      case "beneficio": out.beneficio = ben.beneficio_operativo; break;
      case "food_cost": out.food_cost = ben.food_cost_pct; break;
      case "coste_laboral": out.coste_laboral = ben.coste_laboral_pct; break;
      case "merma": out.merma = ben.ventas > 0 ? Math.round((financials.mermaEnRango(r) / ben.ventas) * 1000) / 10 : null; break;
      case "ticket_medio": { const tk = financials.ticketsEnRango(r); out.ticket_medio = tk > 0 ? Math.round((ben.ventas / tk) * 100) / 100 : null; break; }
      case "clientes": out.clientes = financials.ticketsEnRango(r); break;
      case "reserva_caja": out.reserva_caja = treasury.liquidez().liquidez_inmediata; break;
      default: break;
    }
  });
  return out;
}

function construir(preset = "hoy", opts = {}) {
  const now = opts.now != null ? Number(opts.now) : Date.now();
  const res = periods.resolver(preset, { now, desde: opts.desde, hasta: opts.hasta });
  const r = res.actual;

  // Bloques financieros.
  const beneficioActual = financials.beneficio(r, now);
  const beneficioAnterior = financials.beneficio(res.anterior, now);
  const costeAbrir = financials.costeDeAbrir(r, now);
  const patrimonio = financials.patrimonioNeto(now);
  const costeDiario = financials.costeMedioDiario(now);
  const tesoreria = treasury.resumen(now, costeDiario);
  const deuda = debtsMod.resumen(now);
  const equipo = staff.resumen(r, now);
  const capitalParado = inventoryCapital.calcular(now);
  const activos = assetsMod.resumen(now);
  const saludBloque = health.calcularConComparativo(r, res.anterior, now);

  // Proyección de beneficio del mes en curso (ritmo actual).
  const rMes = periods.rango("mes", now);
  const benMes = financials.beneficio(rMes, now);
  const diasTranscurridos = Math.max(1, (now - rMes.desde) / periods.DAY);
  const diasDelMes = 365 / 12;
  beneficioActual.proyeccion_mes = eur(benMes.beneficio_operativo * (diasDelMes / diasTranscurridos));

  // Objetivos con progreso.
  const objetivos = targets.evaluar(actualesObjetivos(now));

  // Beneficio con comparativo.
  const beneficio = {
    ...beneficioActual,
    vs_anterior: {
      ventas: delta(beneficioActual.ventas, beneficioAnterior.ventas),
      beneficio: delta(beneficioActual.beneficio_operativo, beneficioAnterior.beneficio_operativo),
    },
  };

  // Copiloto (a partir del contexto ya calculado).
  const copiloto = copilot.generar({
    rango: r, now, periodoLabel: r.label,
    costeAbrir, beneficio, tesoreria, deuda, salud: saludBloque,
    capitalParado, objetivos,
  });

  return {
    generado_en: new Date(now).toISOString(),
    periodo: { preset: r.preset, label: r.label, desde: r.desde, hasta: r.hasta },
    comparativo: { anterior: res.anterior, anio_anterior: res.anio_anterior },
    salud: saludBloque,
    valor_empresa: patrimonio,
    beneficio,
    coste_abrir: costeAbrir,
    tesoreria,
    deuda,
    equipo,
    capital_parado: capitalParado,
    activos,
    objetivos,
    copiloto,
  };
}

module.exports = { construir, actualesObjetivos };
