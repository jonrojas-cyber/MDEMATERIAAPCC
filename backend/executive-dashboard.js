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
const breakEven = require("./break-even");
const costAnalytics = require("./cost-analytics");
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
      case "prime_cost": out.prime_cost = ben.prime_cost_pct; break;
      case "gastos_fijos": out.gastos_fijos = ben.gastos_fijos_pct; break;
      case "ebitda": out.ebitda = ben.margen_operativo_pct; break;
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

  // Break-even en vivo + ahorro potencial en costes fijos (para titular y copiloto).
  const puntoEquilibrio = breakEven.puntoEquilibrio(now);
  const ahorroFijos = costAnalytics.alertas(now);

  // ── PANEL DE DIRECCIÓN (home CEO) ──────────────────────────────────────────
  // Todo lo que la portada de dirección necesita, en UNA sola llamada. El
  // objetivo es DINÁMICO: un 10% más que el mismo periodo del mes anterior.
  const fin = financials.extrasFinancieros(now);
  const rHoy = periods.rango("hoy", now);
  const benHoy = financials.beneficio(rHoy, now);
  const d0 = new Date(now); const primerDiaMes = new Date(d0.getFullYear(), d0.getMonth(), 1).getTime();
  const primerDiaMesAnt = new Date(d0.getFullYear(), d0.getMonth() - 1, 1).getTime();
  const benMesAnt = financials.beneficio({ desde: primerDiaMesAnt, hasta: primerDiaMes, preset: "mes_anterior" }, now);
  const diasEnMes = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
  // Días ABIERTOS del mes anterior = días con venta (no el calendario). El objetivo
  // diario se reparte entre los días que de verdad se abre, no entre 30/31.
  const diaSet = new Set();
  (store.readAll("ventas") || []).forEach((v) => {
    const t = new Date(v.fecha).getTime();
    if (Number.isFinite(t) && t >= primerDiaMesAnt && t < primerDiaMes) diaSet.add(String(v.fecha).slice(0, 10));
  });
  const diasAbiertosAnt = diaSet.size;
  const OBJ = 1.10; // regla: +10% sobre el mes anterior
  const objetivoMes = eur(benMesAnt.ventas * OBJ);
  // Objetivo diario = media por día ABIERTO del mes anterior × 1,10. Si aún no hay
  // histórico de días abiertos, cae al reparto por días del mes (aproximación).
  const objetivoDia = diasAbiertosAnt > 0 ? eur((benMesAnt.ventas * OBJ) / diasAbiertosAnt) : eur(objetivoMes / diasEnMes);
  const ticketsHoy = financials.ticketsEnRango(rHoy);
  const ventasHoy = benHoy.ventas || 0;
  // Previsión de cierre del día: proyección por fracción de jornada (8–23 h).
  const horaDec = d0.getHours() + d0.getMinutes() / 60;
  const fracDia = Math.min(1, Math.max(0.08, (horaDec - 8) / 15));
  const prevCierre = eur(ventasHoy / fracDia);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
  const panel_direccion = {
    objetivo_regla: "mes anterior × 1,10",
    hoy: {
      ventas: ventasHoy,
      vs_anterior_pct: beneficio.vs_anterior && beneficio.vs_anterior.ventas ? beneficio.vs_anterior.ventas.pct : null,
      tickets: ticketsHoy,
      ticket_medio: ticketsHoy > 0 ? eur(ventasHoy / ticketsHoy) : null,
      margen_pct: benHoy.margen_operativo_pct,
      food_cost_pct: benHoy.food_cost_pct,
      coste_laboral_pct: benHoy.coste_laboral_pct,
      objetivo_dia: objetivoDia,
      objetivo_dia_pct: pct(ventasHoy, objetivoDia),
      prevision_cierre: prevCierre,
      prevision_vs_objetivo_pct: objetivoDia > 0 ? Math.round(((prevCierre - objetivoDia) / objetivoDia) * 100) : null,
    },
    mes: {
      ventas: benMes.ventas,
      objetivo: objetivoMes,
      objetivo_pct: pct(benMes.ventas, objetivoMes),
      vs_anterior_pct: benMesAnt.ventas > 0 ? Math.round(((benMes.ventas - benMesAnt.ventas) / benMesAnt.ventas) * 100) : null,
      ebitda_pct: fin.margen_mes_pct,
      ebitda_eur: fin.ebitda_mes,
      food_cost_pct: benMes.food_cost_pct,
      coste_laboral_pct: benMes.coste_laboral_pct,
      ventas_mes_anterior: benMesAnt.ventas,
      dias_abiertos_anterior: diasAbiertosAnt,
    },
  };

  // Inteligencia temporal: forecast de caja/salud y anomalías sobre la serie.
  const runwayForecast = forecast.runwayCaja();
  const anomalias = anomaly.detectar();
  const saludForecast = forecast.proyectar("salud", 30);

  // Copiloto (a partir del contexto ya calculado, incluida la inteligencia temporal).
  const copiloto = copilot.generar({
    rango: r, now, periodoLabel: r.label,
    costeAbrir, beneficio, tesoreria, deuda, salud: saludBloque,
    capitalParado, objetivos, runwayForecast, anomalias,
    breakEven: puntoEquilibrio, ahorroFijos,
  });

  return {
    generado_en: new Date(now).toISOString(),
    periodo: { preset: r.preset, label: r.label, desde: r.desde, hasta: r.hasta },
    comparativo: { anterior: res.anterior, anio_anterior: res.anio_anterior },
    salud: saludBloque,
    valor_empresa: patrimonio,
    financiero: fin, // burn, nómina/fijos esperados, EBITDA-ready
    panel_direccion,  // portada de dirección (home CEO): hoy + mes con objetivo dinámico
    beneficio,
    coste_abrir: costeAbrir,
    break_even: puntoEquilibrio,                   // ingreso/clientes/cafés para no perder + margen de seguridad
    tesoreria,
    deuda,
    equipo,
    operaciones: operaciones(now),                 // producción, entregas, stock crítico, caducidades, merma
    capital_parado: capitalParado,
    activos,
    objetivos,
    tendencia: snapshotEngine.tendencia(now),      // serie histórica (semana/mes) desde los snapshots
    inteligencia: { runway_forecast: runwayForecast, anomalias, salud_forecast: saludForecast },
    copiloto,
  };
}

module.exports = { construir, actualesObjetivos };
