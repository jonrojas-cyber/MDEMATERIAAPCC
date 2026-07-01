// Umbral de stock compartido — un solo "cerebro" para decidir qué reponer.
//
// Lo usan tanto el Centro de decisiones/Tareas (decisiones.js) como la portada
// (inicio.js), para que el "por pedir" nunca diga una cosa en un sitio y otra
// en otro.

// Punto de pedido: nivel al que conviene reponer. Si la materia lo trae fijado
// se respeta; si no, un 30% por encima del mínimo.
function puntoPedido(m) {
  if (m.punto_pedido != null && m.punto_pedido !== "") return Number(m.punto_pedido);
  return Math.round((Number(m.stock_minimo) || 0) * 1.3);
}

// Estado de una materia: "critico" (≤ mínimo), "por_pedir" (≤ punto de pedido)
// o "correcto".
function estadoStock(m) {
  const disp = Number(m.disponibilidad_actual) || 0;
  const min = Number(m.stock_minimo) || 0;
  if (disp <= min) return "critico";
  if (disp <= puntoPedido(m)) return "por_pedir";
  return "correcto";
}

// Cantidad a pedir para volver al nivel objetivo (óptimo/ideal, o el doble del
// mínimo/punto de pedido). Redondeada y nunca negativa.
function cantidadSugerida(m) {
  const disp = Number(m.disponibilidad_actual) || 0;
  const objetivo = m.stock_optimo != null ? Number(m.stock_optimo)
    : m.stock_ideal != null ? Number(m.stock_ideal)
    : Math.max(Number(m.stock_minimo) || 0, puntoPedido(m)) * 2;
  const s = Math.round((objetivo - disp) * 100) / 100;
  return s > 0 ? s : 0;
}

module.exports = { puntoPedido, estadoStock, cantidadSugerida };
