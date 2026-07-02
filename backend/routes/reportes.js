const express = require("express");
const store = require("../data-store");
const { costePorUnidad } = require("../costing");

const router = express.Router();

const DIA_MS = 24 * 60 * 60 * 1000;

function r2(n) {
  return Math.round(n * 100) / 100;
}

function fechaClave(d) {
  return new Date(d).toISOString().slice(0, 10); // YYYY-MM-DD
}

// Uso de materias (en unidades de cada materia) a partir de las preparaciones
// finalizadas en un rango. Escala los ingredientes de la receta.
function usoMaterias(preparaciones, recetas, desde, hasta) {
  const uso = {};
  preparaciones.forEach((p) => {
    if (p.estado !== "Finalizada" || !p.finalizada_en) return;
    const t = new Date(p.finalizada_en).getTime();
    if (t < desde || t > hasta) return;
    const receta = recetas.find((r) => r.id === p.receta_id);
    if (!receta || !receta.resultado_base) return;
    const escala = p.cantidad_objetivo / receta.resultado_base;
    (receta.ingredientes || []).forEach((ing) => {
      uso[ing.materia_id] = (uso[ing.materia_id] || 0) + ing.cantidad * escala;
    });
  });
  return uso;
}

// El antiguo GET /reportes/dia se eliminó: su cálculo de coste/merma duplicaba
// el motor único (costing.js) y el panel del propietario (analitica.js). El
// resumen diario vive ahora en el panel y en el centro de decisiones.

// GET /api/reportes/semana  (últimos 7 días)
router.get("/semana", (req, res) => {
  const recetas = store.readAll("recetas");
  const materias = store.readAll("materias");
  const preparaciones = store.readAll("preparaciones");
  const ajustes = store.readAll("ajustes");

  const ahora = Date.now();
  const desde = ahora - 7 * DIA_MS;

  // Evolución diaria de los últimos 7 días.
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const clave = fechaClave(ahora - i * DIA_MS);
    const prep = preparaciones.filter(
      (p) => p.estado === "Finalizada" && p.finalizada_en && fechaClave(p.finalizada_en) === clave
    );
    const costeProd = prep.reduce((s, p) => {
      const receta = recetas.find((r) => r.id === p.receta_id);
      return s + (receta ? costePorUnidad(receta) * p.cantidad_objetivo : 0);
    }, 0);
    const merm = ajustes.filter((a) => a.fecha && fechaClave(a.fecha) === clave);
    const costeMerm = merm.reduce((s, a) => s + (a.coste_estimado || 0), 0);
    dias.push({
      fecha: clave,
      preparaciones: prep.length,
      coste_produccion: r2(costeProd),
      mermas: merm.length,
      coste_mermas: r2(costeMerm),
    });
  }

  // Materias más usadas en la semana (por coste).
  const uso = usoMaterias(preparaciones, recetas, desde, ahora);
  const materiasMasUsadas = Object.entries(uso)
    .map(([id, cantidad]) => {
      const m = materias.find((x) => x.id === id);
      return {
        materia_id: id,
        nombre: m ? m.nombre : id,
        cantidad: r2(cantidad),
        unidad: m ? m.unidad : "",
        coste: m ? r2(cantidad * m.coste_medio) : 0,
      };
    })
    .sort((a, b) => b.coste - a.coste)
    .slice(0, 8);

  res.json({
    desde: fechaClave(desde),
    hasta: fechaClave(ahora),
    dias,
    totales: {
      preparaciones: dias.reduce((s, d) => s + d.preparaciones, 0),
      coste_produccion: r2(dias.reduce((s, d) => s + d.coste_produccion, 0)),
      coste_mermas: r2(dias.reduce((s, d) => s + d.coste_mermas, 0)),
    },
    materias_mas_usadas: materiasMasUsadas,
  });
});

// GET /api/reportes/stock  (valor y proyección de días restantes por materia)
router.get("/stock", (req, res) => {
  const recetas = store.readAll("recetas");
  const materias = store.readAll("materias");
  const preparaciones = store.readAll("preparaciones");

  const ahora = Date.now();
  const uso = usoMaterias(preparaciones, recetas, ahora - 7 * DIA_MS, ahora);

  const items = materias.map((m) => {
    const usoSemana = uso[m.id] || 0;
    const usoDiario = usoSemana / 7;
    const diasRestantes = usoDiario > 0 ? Math.round((m.disponibilidad_actual / usoDiario) * 10) / 10 : null;
    return {
      materia_id: m.id,
      nombre: m.nombre,
      disponibilidad_actual: m.disponibilidad_actual,
      unidad: m.unidad,
      stock_minimo: m.stock_minimo,
      valor_stock: r2(m.disponibilidad_actual * m.coste_medio),
      uso_diario_estimado: r2(usoDiario),
      dias_restantes: diasRestantes,
      bajo_minimo: m.disponibilidad_actual <= m.stock_minimo,
    };
  });

  res.json({
    valor_stock_total: r2(items.reduce((s, i) => s + i.valor_stock, 0)),
    materias: items.sort((a, b) => {
      if (a.dias_restantes == null) return 1;
      if (b.dias_restantes == null) return -1;
      return a.dias_restantes - b.dias_restantes;
    }),
  });
});

module.exports = router;
