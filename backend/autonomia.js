// AUTONOMÍA DE STOCK · "¿cuántos días me queda?" — más útil que el stock absoluto.
//
// Consumo medio diario de cada materia, derivado de:
//   1) consumo_diario_estimado (si el admin lo fija a mano) — útil desde el día 1.
//   2) histórico real: velocidad de consumo de las recetas que la usan × su
//      cantidad por unidad de salida (se llena solo cuando hay ventas/consumos).
//
// Autonomía (días) = stock actual / consumo diario.

const { velocidadConsumo } = require("./consumo");

// Mapa materia_id → unidades/día consumidas, a partir del histórico de recetas.
function consumoDiarioPorMateria(store, ahora = Date.now()) {
  const recetas = store.readAll("recetas");
  const consumos = store.readAll("consumos");
  const mapa = {};
  recetas.forEach((r) => {
    const vel = velocidadConsumo(r.id, consumos, ahora); // unidades/hora de salida de la receta
    if (!vel || vel <= 0) return;
    const base = r.resultado_base || 1;
    (r.ingredientes || []).forEach((ing) => {
      const porSalida = (ing.cantidad || 0) / base; // materia por unidad producida
      mapa[ing.materia_id] = (mapa[ing.materia_id] || 0) + vel * porSalida * 24; // /día
    });
  });
  return mapa;
}

// Autonomía de una materia concreta. fuente: "estimado" | "historico" | null.
function autonomiaDe(materia, mapaConsumo) {
  let diario = null, fuente = null;
  if (materia.consumo_diario_estimado != null && materia.consumo_diario_estimado !== "") {
    diario = Number(materia.consumo_diario_estimado);
    fuente = "estimado";
  } else if (mapaConsumo && mapaConsumo[materia.id] > 0) {
    diario = mapaConsumo[materia.id];
    fuente = "historico";
  }
  if (!diario || diario <= 0) return { consumo_diario: null, autonomia_dias: null, fuente: null };
  const disp = Number(materia.disponibilidad_actual) || 0;
  return {
    consumo_diario: Math.round(diario * 100) / 100,
    autonomia_dias: Math.round((disp / diario) * 10) / 10,
    fuente,
  };
}

module.exports = { consumoDiarioPorMateria, autonomiaDe };
