const express = require("express");
const store = require("../data-store");
const { costePorUnidad, tamanosLote } = require("../costing");
const labelService = require("../label-service");

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

// Material de trabajo que debe estar listo ANTES de empezar. Si la receta define
// el suyo (receta.materiales), se usa ese; si no, una base estándar de RTD para
// que la pantalla de preparación nunca salga vacía.
const MATERIALES_BASE = [
  "Boles / recipientes limpios",
  "Espátula",
  "GN limpio y rotulado",
  "Film",
  "Etiquetas + impresora",
  "Termómetro",
];
function materialesDe(receta) {
  const propios = Array.isArray(receta.materiales) ? receta.materiales.filter((x) => x && String(x).trim()) : [];
  return propios.length ? propios.map((x) => String(x).trim()) : MATERIALES_BASE;
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

// Construye la lista de pasos: uno por ingrediente (pesar/añadir X cantidad),
// luego los pasos de proceso propios de la receta (mezclar, pasar a GN...).
function generarPasos(receta, cantidadObjetivo) {
  const ingredientes = escalarIngredientes(receta, cantidadObjetivo);
  const pasosIngrediente = ingredientes.map((ing, i) => ({
    tipo: "ingrediente",
    texto: i === 0 ? `Pesar ${ing.nombre.toLowerCase()}` : `Añadir ${ing.nombre.toLowerCase()}`,
    cantidad: ing.cantidad_necesaria,
    unidad: ing.unidad,
    confirmado: false,
    confirmado_en: null,
  }));
  const pasosProceso = (receta.pasos_proceso || []).map((texto) => ({
    tipo: "proceso",
    texto,
    confirmado: false,
    confirmado_en: null,
  }));
  return [...pasosIngrediente, ...pasosProceso];
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
    materiales: materialesDe(receta),
    coste_estimado: coste,
    viable: ingredientes.every((i) => i.suficiente !== false),
  });
});

// Inicia una preparación: genera la lista de pasos completa, pendiente de confirmar uno a uno
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
    pasos: generarPasos(receta, cantidad_objetivo),
    paso_actual: 0,
  };
  store.insert("preparaciones", preparacion);
  res.status(201).json(preparacion);
});

// Confirma el paso actual (con OK) y avanza al siguiente. No permite saltar pasos.
router.post("/:id/confirmar-paso", (req, res) => {
  const preparacion = store.findById("preparaciones", req.params.id);
  if (!preparacion) return res.status(404).json({ error: "Preparación no encontrada" });
  if (preparacion.estado === "Finalizada") {
    return res.status(400).json({ error: "Esta preparación ya está finalizada" });
  }
  if (preparacion.paso_actual >= preparacion.pasos.length) {
    return res.status(400).json({ error: "Todos los pasos ya están confirmados" });
  }

  preparacion.pasos[preparacion.paso_actual].confirmado = true;
  preparacion.pasos[preparacion.paso_actual].confirmado_en = new Date().toISOString();
  preparacion.paso_actual += 1;

  const actualizada = store.update("preparaciones", preparacion.id, {
    pasos: preparacion.pasos,
    paso_actual: preparacion.paso_actual,
  });
  res.json(actualizada);
});

// Finaliza: exige todos los pasos confirmados. Descuenta materias, crea lote y etiqueta.
router.post("/:id/finalizar", async (req, res) => {
  const preparacion = store.findById("preparaciones", req.params.id);
  if (!preparacion) return res.status(404).json({ error: "Preparación no encontrada" });
  if (preparacion.estado === "Finalizada") {
    return res.status(400).json({ error: "Esta preparación ya está finalizada" });
  }
  if (preparacion.paso_actual < preparacion.pasos.length) {
    return res.status(400).json({ error: "Quedan pasos sin confirmar antes de finalizar" });
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

  const etiqueta = await labelService.createLabel(req, {
    lote,
    receta,
    responsable: preparacion.responsable,
  });

  res.json({
    preparacion: preparacionActualizada,
    lote,
    etiqueta,
    ingredientes_consumidos: ingredientes,
  });
});

module.exports = router;
