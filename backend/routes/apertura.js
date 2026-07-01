const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Checklist de apertura del local, un documento por día (id = fecha). Compartido
// entre el equipo: si Lara marca "luces", Jon lo ve marcado.

function hoyStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getDia(fecha) {
  return store.readAll("apertura").find((a) => a.id === fecha) || { id: fecha, fecha, pasos: {} };
}

router.get("/", (req, res) => {
  res.json(getDia(hoyStr()));
});

// Marca / desmarca un paso del checklist de hoy.
router.post("/toggle", async (req, res) => {
  const { step, hecho, responsable } = req.body || {};
  if (!step) return res.status(400).json({ error: "Falta el paso" });
  const fecha = hoyStr();
  const doc = getDia(fecha);
  doc.pasos = doc.pasos || {};
  if (hecho) doc.pasos[step] = { hecho: true, responsable: responsable || "", en: new Date().toISOString() };
  else delete doc.pasos[step];
  if (store.findById("apertura", fecha)) store.update("apertura", fecha, doc);
  else store.insert("apertura", doc);
  await store.flush();
  res.json(doc);
});

module.exports = router;
