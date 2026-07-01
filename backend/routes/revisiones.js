const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Tipos de revisión del día. Los de tipo "temperatura" exigen un número y el
// sistema decide si está dentro de rango. Los de tipo "limpieza" solo
// necesitan confirmación de que se ha hecho.
const TIPOS_REVISION = [
  // Neveras y congeladores del local (APPCC · rango en °C).
  { tipo: "Nevera sistema on tap", clase: "temperatura", min: 0, max: 5, unidad: "°C" },
  { tipo: "Nevera cocina", clase: "temperatura", min: 0, max: 5, unidad: "°C" },
  { tipo: "Congelador cocina", clase: "temperatura", min: -25, max: -15, unidad: "°C" },
  { tipo: "Nevera almacén", clase: "temperatura", min: 0, max: 5, unidad: "°C" },
  { tipo: "Congelador almacén", clase: "temperatura", min: -25, max: -15, unidad: "°C" },
  // Limpieza de apertura.
  { tipo: "Suelo limpio", clase: "limpieza" },
  { tipo: "Mesas", clase: "limpieza" },
  { tipo: "Herramienta", clase: "limpieza" },
];

function accionCorrectivaPara(tipo) {
  if (tipo.toLowerCase().includes("congelador")) return "Revisar cierre y repetir medición en 30 min; vigilar producto congelado";
  if (tipo.toLowerCase().includes("nevera")) return "Revisar cierre de puerta y repetir medición en 30 min";
  return "Completar antes del próximo servicio";
}

router.get("/tipos", (req, res) => {
  res.json(TIPOS_REVISION);
});

router.get("/", (req, res) => {
  res.json(store.readAll("revisiones"));
});

// Registra una revisión de hoy. El estado lo calcula el sistema, no quien la registra.
router.post("/registrar", (req, res) => {
  const { tipo, valor, responsable } = req.body;
  const definicion = TIPOS_REVISION.find((t) => t.tipo === tipo);
  if (!definicion) return res.status(400).json({ error: "Tipo de revisión no reconocido" });

  let estado = "Correcto";
  let valorFinal = valor;
  let accionCorrectiva = "";

  if (definicion.clase === "temperatura") {
    const num = Number(valor);
    if (Number.isNaN(num)) return res.status(400).json({ error: "Introduce un valor numérico" });
    valorFinal = `${num}${definicion.unidad}`;
    if (num < definicion.min || num > definicion.max) {
      estado = "Fuera del rango esperado";
      accionCorrectiva = accionCorrectivaPara(tipo);
    }
  } else {
    valorFinal = "Realizada";
  }

  const revision = {
    id: store.nextId("rev", "revisiones"),
    tipo,
    valor: valorFinal,
    estado,
    accion_correctiva: accionCorrectiva,
    responsable: responsable || "Sin asignar",
    fecha: new Date().toISOString(),
  };
  store.insert("revisiones", revision);
  res.status(201).json(revision);
});

router.post("/:id/resolver", (req, res) => {
  const revision = store.findById("revisiones", req.params.id);
  if (!revision) return res.status(404).json({ error: "Revisión no encontrada" });
  const actualizada = store.update("revisiones", req.params.id, {
    estado: "Correcto",
    accion_correctiva: "",
    resuelta_en: new Date().toISOString(),
  });
  res.json(actualizada);
});

module.exports = router;
