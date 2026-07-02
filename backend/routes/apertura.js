const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Checklist de apertura del local, un documento por día (id = fecha). Compartido
// entre el equipo: si Lara marca "luces", Jon lo ve marcado.

function hoyStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Documento por día y por rutina. "apertura" mantiene id=fecha (compatibilidad);
// "cierre" y otras usan "<rutina>-<fecha>".
function docId(rutina, fecha) {
  return rutina === "apertura" ? fecha : `${rutina}-${fecha}`;
}
function normRutina(r) {
  return r === "cierre" ? "cierre" : "apertura";
}
function getDoc(id, fecha) {
  return store.readAll("apertura").find((a) => a.id === id) || { id, fecha, pasos: {} };
}

router.get("/", (req, res) => {
  const rutina = normRutina(req.query.rutina);
  res.json(getDoc(docId(rutina, hoyStr()), hoyStr()));
});

// Marca / desmarca un paso del checklist de hoy (apertura o cierre).
router.post("/toggle", async (req, res) => {
  const { step, hecho, responsable } = req.body || {};
  if (!step) return res.status(400).json({ error: "Falta el paso" });
  const rutina = normRutina(req.body && req.body.rutina);
  const fecha = hoyStr();
  const id = docId(rutina, fecha);
  const doc = getDoc(id, fecha);
  doc.pasos = doc.pasos || {};
  if (hecho) doc.pasos[step] = { hecho: true, responsable: responsable || "", en: new Date().toISOString() };
  else delete doc.pasos[step];
  if (store.findById("apertura", id)) store.update("apertura", id, doc);
  else store.insert("apertura", doc);
  await store.flush();
  res.json(doc);
});

module.exports = router;
