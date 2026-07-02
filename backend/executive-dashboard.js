// CENTRO DE CONTROL · ensambla todos los bloques del dashboard ejecutivo a partir
// de los módulos financieros (que a su vez componen costing.js). Punto único que
// consume la ruta /api/executive-dashboard. Nada de dinero se calcula aquí: se orquesta.

const store = require("./data-store");
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
const snapshotEngine = require("./snapshot-engine");
const forecast = require("./forecast");
const anomaly = require("./anomaly");
const { estadoStock } = require("./umbral");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function enRango(fecha, r) { const t = new Date(fecha).getTime(); return Number.isFinite(t) && t >= r.desde && t < r.hasta; }

// OPERACIONES · estado operativo del día unificado en la pantalla ejecutiva.
// Compone módulos existentes (preparaciones, lotes, materias, recepciones, mermas):
// no recalcula dinero ni duplica reglas.
function operaciones(now) {
  const rHoy = periods.rango("hoy", now);
  const rSem = periods.rango("semana", now);
  const rMes = periods.rango("mes", now);
  const preps = store.readAll("preparaciones");
  const produccionHoy = preps.filter((p) => p.estado === "Finalizada" && p.finalizada_en && enRango(p.finalizada_en, rHoy)).length;
  const produccionEnCurso = preps.filter((p) => p.estado === "En curso").length;
  const materias = store.readAll("materias");
  const stockCritico = materias.filter((m) => estadoStock(m) !== "correcto").length;
  const caducan48h = store.readAll("lotes").filter((l) => l.estado !== "Fuera de servicio" && l.caduca_en &&
    (l.cantidad_restante == null || l.cantidad_restante > 0) &&
    new Date(l.caduca_en).getTime() - now <= 48 * 3.6e6).length;
  const recepPendientes = store.readAll("recepciones").filter((r) => r.estado === "Pendiente de confirmar").length;
  const pedidosEnCamino = store.readAll("pedidos").filter((p) => p.estado === "enviado").length;
  return {
    produccion_hoy: produccionHoy,
    produccion_en_curso: produccionEnCurso,
    stock_critico: stockCritico,
    caducan_48h: caducan48h,
    entregas_esperadas: recepPendientes + pedidosEnCamino,
    merma_hoy: eur(financials.mermaEnRango(rHoy)),
    merma_semana: eur(financials.mermaEnRango(rSem)),
    merma_mes: eur(financials.mermaEnRango(rMes)),
  };
}
function delta(actual, anterior) {
  if (actual == null || anterior == null) return null;
  return { abs: eur(actual - anterior), pct: anterior !== 0 ? Math.round(((actual - anterior) / Math.abs(anterior)) * 100) : null };
}

// Valores reales por objetivo, cada uno en el periodo que le corresponde.
// Memoiza beneficio por periodo: muchos objetivos comparten "mes", así se escanea
// ventas una sola vez por periodo distinto en lugar de una vez por objetivo.
function actualesObjetivos(now, benCache = {}) {
  const out = {};
  const benDe = (periodo) => {
    const r = periods.rango(periodo || "mes", now);
    const key = periodo || "mes";
    if (!benCache[key]) benCache[key] = { r, ben: financials.beneficio(r, now) };
    return benCache[key];
  };
  targets.lista().forEach((t) => {
    const { r, ben } = benDe(t.periodo || "mes");
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

  // Bloques financieros. Se calculan UNA vez y se reparten a quien los necesita
  // (salud, objetivos) para no volver a escanear ventas por cada consumidor.
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
  const saludBloque = health.calcularConComparativo(r, res.anterior, now, { beneficio: beneficioActual, beneficioAnterior, costeMedioDiario: costeDiario });

  // Proyección de beneficio del mes en curso (ritmo actual). Reutilizamos este
  // beneficio del mes como caché para los objetivos con periodo "mes".
  const rMes = periods.rango("mes", now);
  const benMes = financials.beneficio(rMes, now);
  const diasTranscurridos = Math.max(1, (now - rMes.desde) / periods.DAY);
  const diasDelMes = 365 / 12;
  beneficioActual.proyeccion_mes = eur(benMes.beneficio_operativo * (diasDelMes / diasTranscurridos));

  // Objetivos con progreso (beneficio memoizado por periodo; "mes" ya calculado).
  const benCache = { mes: { r: rMes, ben: benMes } };
  if (r.preset && !benCache[r.preset]) benCache[r.preset] = { r, ben: beneficioActual };
  const objetivos = targets.evaluar(actualesObjetivos(now, benCache));

  // Beneficio con comparativo.
  const beneficio = {
    ...beneficioActual,
    vs_anterior: {
      ventas: delta(beneficioActual.ventas, beneficioAnterior.ventas),
      beneficio: delta(beneficioActual.beneficio_operativo, beneficioAnterior.beneficio_operativo),
    },
  };

  // Inteligencia temporal: forecast de caja y anomalías sobre la serie histórica.
  const runwayForecast = forecast.runwayCaja();
  const anomalias = anomaly.detectar();

  // Copiloto (a partir del contexto ya calculado, incluida la inteligencia temporal).
  const copiloto = copilot.generar({
    rango: r, now, periodoLabel: r.label,
    costeAbrir, beneficio, tesoreria, deuda, salud: saludBloque,
    capitalParado, objetivos, runwayForecast, anomalias,
  });

  return {
    generado_en: new Date(now).toISOString(),
    periodo: { preset: r.preset, label: r.label, desde: r.desde, hasta: r.hasta },
    comparativo: { anterior: res.anterior, anio_anterior: res.anio_anterior },
    salud: saludBloque,
    valor_empresa: patrimonio,
    financiero: financials.extrasFinancieros(now), // burn, nómina/fijos esperados, EBITDA-ready
    beneficio,
    coste_abrir: costeAbrir,
    tesoreria,
    deuda,
    equipo,
    operaciones: operaciones(now),                 // producción, entregas, stock crítico, caducidades, merma
    capital_parado: capitalParado,
    activos,
    objetivos,
    tendencia: snapshotEngine.tendencia(now),      // serie histórica (semana/mes) desde los snapshots
    inteligencia: { runway_forecast: runwayForecast, anomalias },
    copiloto,
  };
}

module.exports = { construir, actualesObjetivos };
