// Cálculo de consumo real y producción JIT (just-in-time).
//
// A partir del registro de consumos (cada uso real de un lote con timestamp)
// estimamos la velocidad de consumo por receta y cuántas horas de stock quedan
// al ritmo actual. Si no hay histórico, el llamador cae al umbral fijo.

const VENTANA_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// Velocidad de consumo de una receta en unidades/hora (últimos 7 días).
// Devuelve null si no hay histórico suficiente.
function velocidadConsumo(recetaId, consumos, ahora = Date.now()) {
  const desde = ahora - VENTANA_MS;
  const recientes = consumos.filter((c) => {
    if (c.receta_id !== recetaId) return false;
    const t = new Date(c.timestamp).getTime();
    return Number.isFinite(t) && t >= desde && t <= ahora;
  });
  if (recientes.length < 2) return null; // con un solo punto no hay ritmo fiable

  const total = recientes.reduce((s, c) => s + (c.cantidad || 0), 0);
  if (total <= 0) return null;

  const primero = Math.min(...recientes.map((c) => new Date(c.timestamp).getTime()));
  const horas = Math.max(0.5, (ahora - primero) / 3600000); // mínimo media hora para no disparar la velocidad
  return total / horas; // unidades por hora
}

// Horas de stock restantes al ritmo actual. null si no se puede estimar.
function horasDeStock(cantidadRestante, velocidad) {
  if (!velocidad || velocidad <= 0) return null;
  return cantidadRestante / velocidad;
}

module.exports = { velocidadConsumo, horasDeStock, VENTANA_MS };
