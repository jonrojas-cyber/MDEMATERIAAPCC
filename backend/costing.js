const store = require("./data-store");

// Coste por unidad de resultado (ej. coste por gramo de producto terminado)
function costePorUnidad(receta) {
  const materias = store.readAll("materias");
  const costeTotal = receta.ingredientes.reduce((sum, ing) => {
    const materia = materias.find((m) => m.id === ing.materia_id);
    const coste = materia ? materia.coste_medio : 0;
    return sum + ing.cantidad * coste;
  }, 0);
  return costeTotal / receta.resultado_base;
}

// Tamaños de lote fijos por receta. Valores de partida — se ajustan en una
// fase posterior según el ritmo real de servicio de cada referencia.
function tamanosLote(receta) {
  if (receta.tamanos_lote && receta.tamanos_lote.length) return receta.tamanos_lote;
  const base = receta.resultado_base;
  return [Math.round(base / 2), base];
}

module.exports = { costePorUnidad, tamanosLote };
