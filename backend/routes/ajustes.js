const express = require("express");
const store = require("../data-store");
const { costePorUnidad } = require("../costing");

const router = express.Router();

const MOTIVOS = [
  "maduración avanzada",
  "fuera de vida útil",
  "caída / rotura",
  "preparación incorrecta",
  "prueba I+D",
  "devolución",
];

router.get("/motivos", (req, res) => {
  res.json(MOTIVOS);
});

router.get("/", (req, res) => {
  res.json(store.readAll("ajustes").slice().reverse());
});

router.post("/", (req, res) => {
  const { tipo_objetivo, objetivo_id, cantidad, motivo, observacion, responsable } = req.body;

  if (!tipo_objetivo || !objetivo_id || !cantidad || !motivo) {
    return res.status(400).json({ error: "Indica materia o lote, cantidad y motivo del ajuste" });
  }
  if (!MOTIVOS.includes(motivo)) {
    return res.status(400).json({ error: "Motivo no reconocido", motivos_disponibles: MOTIVOS });
  }

  let costeEstimado = 0;
  let nombreObjetivo = objetivo_id;

  if (tipo_objetivo === "materia") {
    const materias = store.readAll("materias");
    const materia = materias.find((m) => m.id === objetivo_id);
    if (!materia) return res.status(404).json({ error: "Materia no encontrada" });
    costeEstimado = Math.round(materia.coste_medio * cantidad * 100) / 100;
    nombreObjetivo = materia.nombre;
    materia.disponibilidad_actual = Math.max(0, Math.round((materia.disponibilidad_actual - cantidad) * 100) / 100);
    store.writeAll("materias", materias);
  } else if (tipo_objetivo === "lote") {
    const lotes = store.readAll("lotes");
    const lote = lotes.find((l) => l.id === objetivo_id);
    if (!lote) return res.status(404).json({ error: "Lote no encontrado" });
    const receta = store.findById("recetas", lote.receta_id);
    costeEstimado = receta ? Math.round(costePorUnidad(receta) * cantidad * 100) / 100 : 0;
    nombreObjetivo = lote.codigo;
    lote.cantidad_restante = Math.max(0, Math.round((lote.cantidad_restante - cantidad) * 100) / 100);
    if (lote.cantidad_restante === 0) lote.estado = "Fuera de servicio";
    store.writeAll("lotes", lotes);
  } else {
    return res.status(400).json({ error: "tipo_objetivo debe ser 'materia' o 'lote'" });
  }

  const ajuste = {
    id: store.nextId("aju", "ajustes"),
    tipo_objetivo,
    objetivo_id,
    objetivo_nombre: nombreObjetivo,
    cantidad,
    motivo,
    coste_estimado: costeEstimado,
    responsable: responsable || "Sin asignar",
    observacion: observacion || "",
    fecha: new Date().toISOString(),
  };
  store.insert("ajustes", ajuste);
  res.status(201).json(ajuste);
});

module.exports = router;
