// GUARDIÁN ECONÓMICO · defensa en profundidad de la regla innegociable nº2:
// el rol `equipo` NUNCA ve coste, precio de coste ni margen. No basta ocultarlo en
// el front (cosmético): el backend debe NO enviarlo. Este módulo elimina, de forma
// recursiva, cualquier campo económico de una respuesta cuando quien pide no es admin.
// Se aplica como middleware global a /api (ver server.js), así ninguna ruta —ni las
// futuras— puede filtrar dinero por olvido. Las vistas de admin no se tocan.
//
// Qué NO se toca: `precio_venta` (el PVP de la carta es público, lo ve el equipo) y
// `pvp`/`importe` (precio de venta / importe cobrado). Solo se oculta el lado del
// COSTE, el MARGEN y el VALOR del stock.

// Un nombre de campo es económico si empieza por alguno de estos prefijos.
const PATRONES = [
  /^coste/i,                        // coste, coste_medio, coste_neto, coste_estimado, coste_total, coste_por_litro, coste_produccion_hoy, coste_mermas_hoy, coste_materia, coste_laboral...
  /^precio_(compra|pactado|recomendado)/i, // precios de COSTE / recomendado (NO precio_venta)
  /^margen/i,                       // margen, margen_bruto, margen_euros, margen_medio_carta, margen_pct, margen_objetivo, margen_operativo_pct...
  /^food_cost/i,                    // food_cost, food_cost_pct, food_cost_medio, food_cost_objetivo
  /^valor_stock/i,                  // valor_stock_total, valor_stock_actual
  /^beneficio/i,                    // beneficio, beneficio_operativo, beneficio_neto_estimado
  /^ebitda/i,
  /^prime_cost/i,
  /^rentabilidad/i,
  /^escenarios$/i,                  // carta: escenarios de PVP por food-cost objetivo (estrategia de precio)
];

function esCampoEconomico(key) {
  return PATRONES.some((re) => re.test(key));
}

// Clona `valor` quitando (en profundidad) todo campo económico. No muta el original.
function stripEconomia(valor) {
  if (Array.isArray(valor)) return valor.map(stripEconomia);
  if (valor && typeof valor === "object") {
    // Date u otros objetos no planos: devolver tal cual.
    if (valor instanceof Date) return valor;
    const out = {};
    for (const k of Object.keys(valor)) {
      if (esCampoEconomico(k)) continue;
      out[k] = stripEconomia(valor[k]);
    }
    return out;
  }
  return valor;
}

// Middleware: para quien NO es admin, envuelve res.json para limpiar la respuesta.
// Para admin es transparente (coste cero de rendimiento y datos completos).
function filtrarRespuestas(req, res, next) {
  if (req.user && req.user.rol !== "admin") {
    const original = res.json.bind(res);
    res.json = (body) => original(stripEconomia(body));
  }
  next();
}

module.exports = { stripEconomia, esCampoEconomico, filtrarRespuestas, PATRONES };
