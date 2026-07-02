// BREAK-EVEN ENGINE + CONTRIBUTION MARGIN ENGINE
// Responde, siempre en vivo: ¿cuánto hay que vender hoy/semana/mes/año para no
// perder dinero?, ¿cuántos clientes/cafés son eso?, ¿cuánto pueden caer las ventas
// antes de entrar en pérdidas? NO recalcula dinero: compone costing (margen de la
// carta), fixed-costs + staff (base fija) y financials (ventas reales).
//
// Contribución = parte de cada euro vendido que queda tras el coste variable
// (materia prima). El punto de equilibrio = coste fijo / margen de contribución.

const costing = require("./costing");
const fixedCosts = require("./fixed-costs");
const staff = require("./staff-finance");
const periods = require("./periods");
const operatingProfile = require("./operating-profile");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
const MES = 365 / 12;

// ── CONTRIBUTION MARGIN ENGINE ──────────────────────────────────────────────
// Margen de contribución de la carta (1 − food cost). Además, contribución por
// producto y por categoría, para ver qué sostiene realmente el negocio.
function contribucion(productos = null, idxMat = null) {
  const idx = idxMat || costing.indiceMaterias();
  const items = (productos || require("./data-store").readAll("productos"))
    .filter((p) => p.activo !== false && Number(p.precio_venta) > 0);

  const porProducto = items.map((p) => {
    const m = costing.margenProducto(p, idx);
    return {
      id: p.id, nombre: p.nombre, categoria: p.categoria || "Otros",
      precio: m.precio, coste: m.coste,
      contribucion_eur: m.margen_euros,          // € que aporta cada venta
      contribucion_pct: m.margen_bruto,          // fracción (0..1)
    };
  }).sort((a, b) => b.contribucion_eur - a.contribucion_eur);

  // Contribución media de la carta (ratio 0..1). Base del punto de equilibrio.
  const ratio = costing.margenMedioCarta(items, idx);

  // Agregado por categoría (contribución media de cada familia de producto).
  const g = {};
  porProducto.forEach((p) => {
    if (!g[p.categoria]) g[p.categoria] = { categoria: p.categoria, n: 0, suma_pct: 0, suma_eur: 0 };
    g[p.categoria].n++; g[p.categoria].suma_pct += p.contribucion_pct; g[p.categoria].suma_eur += p.contribucion_eur;
  });
  const porCategoria = Object.values(g).map((c) => ({
    categoria: c.categoria, productos: c.n,
    contribucion_media_pct: Math.round((c.suma_pct / c.n) * 1000) / 1000,
    contribucion_media_eur: eur(c.suma_eur / c.n),
  })).sort((a, b) => b.contribucion_media_pct - a.contribucion_media_pct);

  return {
    ratio_contribucion: ratio,                    // 0..1 (fracción de cada € que cubre lo fijo)
    ratio_contribucion_pct: Math.round(ratio * 1000) / 10, // %
    food_cost_medio_pct: costing.foodCostMedioCarta(items, idx),
    por_producto: porProducto.slice(0, 30),
    top_contribuyentes: porProducto.slice(0, 5),
    por_categoria: porCategoria,
    productos_evaluados: items.length,
  };
}

// Coste fijo diario "de sobrevivir" = costes fijos prorrateados + coste laboral.
// (El coste de materia es variable con la venta y ya está dentro del margen de
// contribución, por eso no se suma aquí.)
function baseFijaDiaria(now = Date.now()) {
  return fixedCosts.totales(now).diario + staff.costeDiarioTotal();
}

// ── BREAK-EVEN ENGINE ───────────────────────────────────────────────────────
// Ingreso necesario para cubrir lo fijo con el margen de contribución de la carta.
// Live: cambia solo con editar un coste, un sueldo o un precio.
function puntoEquilibrio(now = Date.now(), opts = {}) {
  const perfil = opts.perfil || operatingProfile.leer();
  const contrib = opts.contribucion || contribucion();
  const ratio = contrib.ratio_contribucion > 0 ? contrib.ratio_contribucion : null;

  const fijoDia = baseFijaDiaria(now);
  const ingresoDia = ratio ? fijoDia / ratio : null;   // ventas para equilibrio hoy
  const ticket = Number(perfil.ticket_medio) > 0 ? Number(perfil.ticket_medio) : null;
  const cafe = Number(perfil.cafe_medio) > 0 ? Number(perfil.cafe_medio) : null;

  const escala = (dias) => {
    if (ingresoDia == null) return { disponible: false };
    const ingreso = ingresoDia * dias;
    return {
      disponible: true,
      ingreso_necesario: eur(ingreso),
      clientes: ticket ? Math.ceil(ingreso / ticket) : null,
      cafes: cafe ? Math.ceil(ingreso / cafe) : null,
    };
  };

  // Margen de seguridad: cuánto pueden caer las ventas reales antes de perder.
  // Compara la venta media diaria reciente (30 días) con el ingreso de equilibrio.
  const financials = require("./financials");
  const rMes = periods.rango("mes", now);
  const ventasMes = financials.ventasEnRango(rMes);
  const diasMes = Math.max(1, (Math.min(now, rMes.hasta) - rMes.desde) / 86400000);
  const ventaMediaDia = ventasMes / diasMes;
  let margenSeguridad = null;
  if (ingresoDia != null && ventaMediaDia > 0) {
    margenSeguridad = Math.round(((ventaMediaDia - ingresoDia) / ventaMediaDia) * 1000) / 10; // %
  }

  return {
    disponible: ingresoDia != null,
    ratio_contribucion_pct: contrib.ratio_contribucion_pct,
    base_fija_diaria: eur(fijoDia),
    ingreso_equilibrio_dia: ingresoDia != null ? eur(ingresoDia) : null,
    hoy: escala(1),
    semana: escala(7),
    mes: escala(MES),
    anio: escala(365),
    venta_media_dia: eur(ventaMediaDia),
    margen_seguridad_pct: margenSeguridad,       // >0 = por encima del equilibrio
    en_perdidas: margenSeguridad != null ? margenSeguridad < 0 : null,
    ticket_medio: ticket, cafe_medio: cafe,
  };
}

module.exports = { contribucion, baseFijaDiaria, puntoEquilibrio, eur };
