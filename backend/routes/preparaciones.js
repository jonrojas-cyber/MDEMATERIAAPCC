const express = require("express");
const store = require("../data-store");
const { costePorUnidad, tamanosLote } = require("../costing");

const router = express.Router();

const PREFIJOS = {
  "Aguacate M": "AGM",
  "Tomate trabajado M": "TTM",
  "Matcha base": "MAT",
  "Cold brew": "CB",
};

function prefijoPara(nombre) {
  if (PREFIJOS[nombre]) return PREFIJOS[nombre];
  return nombre
    .split(" ")
    .filter((w) => w.toLowerCase() !== "m")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);
}

function generarCodigoLote(nombreReceta) {
  const ahora = new Date();
  const dd = String(ahora.getDate()).padStart(2, "0");
  const mm = String(ahora.getMonth() + 1).padStart(2, "0");
  const yy = String(ahora.getFullYear()).slice(-2);
  const fecha = `${dd}${mm}${yy}`;
  const prefijo = prefijoPara(nombreReceta);
  const lotesHoy = store.readAll("lotes").filter((l) => l.codigo.startsWith(`${prefijo}-${fecha}`));
  const letra = String.fromCharCode(65 + lotesHoy.length);
  return `${prefijo}-${fecha}-${letra}`;
}

function escalarIngredientes(receta, cantidadObjetivo) {
  const factor = cantidadObjetivo / receta.resultado_base;
  const materias = store.readAll("materias");
  return receta.ingredientes.map((ing) => {
    const materia = materias.find((m) => m.id === ing.materia_id);
    const cantidadNecesaria = Math.round(ing.cantidad * factor * 100) / 100;
    return {
      materia_id: ing.materia_id,
      nombre: materia ? materia.nombre : ing.materia_id,
      unidad: materia ? materia.unidad : "",
      cantidad_necesaria: cantidadNecesaria,
      disponibilidad_actual: materia ? materia.disponibilidad_actual : null,
      suficiente: materia ? materia.disponibilidad_actual >= cantidadNecesaria : null,
    };
  });
}

router.get("/", (req, res) => {
  const preparaciones = store.readAll("preparaciones");
  const recetas = store.readAll("recetas");
  let resultado = preparaciones.map((p) => ({
    ...p,
    nombre_receta: (recetas.find((r) => r.id === p.receta_id) || {}).nombre || p.receta_id,
  }));
  if (req.query.estado) {
    resultado = resultado.filter((p) => p.estado === req.query.estado);
  }
  res.json(resultado);
});

router.post("/calcular", (req, res) => {
  const { receta_id, cantidad_objetivo } = req.body;
  const receta = store.findById("recetas", receta_id);
  if (!receta) return res.status(404).json({ error: "Receta no encontrada" });

  const opciones = tamanosLote(receta);
  if (!opciones.includes(Number(cantidad_objetivo))) {
    return res.status(400).json({
      error: "Esa cantidad no es un tamaño de lote definido para esta receta",
      tamanos_disponibles: opciones,
    });
  }

  const ingredientes = escalarIngredientes(receta, cantidad_objetivo);
  const coste = Math.round(costePorUnidad(receta) * cantidad_objetivo * 100) / 100;

  res.json({
    receta_id,
    nombre_receta: receta.nombre,
    cantidad_objetivo,
    unidad: receta.unidad,
    vida_util_horas: receta.vida_util_horas,
    ingredientes,
    coste_estimado: coste,
    viable: ingredientes.every((i) => i.suficiente !== false),
  });
});

router.post("/", (req, res) => {
  const { receta_id, cantidad_objetivo, responsable } = req.body;
  const receta = store.findById("recetas", receta_id);
  if (!receta) return res.status(404).json({ error: "Receta no encontrada" });

  const opciones = tamanosLote(receta);
  if (!opciones.includes(Number(cantidad_objetivo))) {
    return res.status(400).json({
      error: "Esa cantidad no es un tamaño de lote definido para esta receta",
      tamanos_disponibles: opciones,
    });
  }

  const id = store.nextId("prep", "preparaciones");
  const preparacion = {
    id,
    receta_id,
    cantidad_objetivo,
    estado: "En curso",
    responsable: responsable || "Sin asignar",
    creada_en: new Date().toISOString(),
    finalizada_en: null,
    lote_id: null,
  };
  store.insert("preparaciones", preparacion);
  res.status(201).json(preparacion);
});

router.post("/:id/finalizar", (req, res) => {
  const preparacion = store.findById("preparaciones", req.params.id);
  if (!preparacion) return res.status(404).json({ error: "Preparación no encontrada" });
  if (preparacion.estado === "Finalizada") {
    return res.status(400).json({ error: "Esta preparación ya está finalizada" });
  }

  const receta = store.findById("recetas", preparacion.receta_id);
  const ingredientes = escalarIngredientes(receta, preparacion.cantidad_objetivo);

  const materias = store.readAll("materias");
  ingredientes.forEach((ing) => {
    const materia = materias.find((m) => m.id === ing.materia_id);
    if (materia) {
      materia.disponibilidad_actual = Math.max(
        0,
        Math.round((materia.disponibilidad_actual - ing.cantidad_necesaria) * 100) / 100
      );
    }
  });
  store.writeAll("materias", materias);

  const ahora = new Date();
  const caducaEn = new Date(ahora.getTime() + receta.vida_util_horas * 60 * 60 * 1000);
  const lote = {
    id: store.nextId("lote", "lotes"),
    receta_id: receta.id,
    codigo: generarCodigoLote(receta.nombre),
    cantidad_inicial: preparacion.cantidad_objetivo,
    cantidad_restante: preparacion.cantidad_objetivo,
    producido_en: ahora.toISOString(),
    caduca_en: caducaEn.toISOString(),
    estado: "Correcto",
    ubicacion: "Pendiente de ubicar",
  };
  store.insert("lotes", lote);

  const preparacionActualizada = store.update("preparaciones", preparacion.id, {
    estado: "Finalizada",
    finalizada_en: ahora.toISOString(),
    lote_id: lote.id,
  });

  res.json({ preparacion: preparacionActualizada, lote, ingredientes_consumidos: ingredientes });
});

module.exports = router;
