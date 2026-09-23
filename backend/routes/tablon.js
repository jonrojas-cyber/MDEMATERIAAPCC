// TABLÓN · comunicación interna. Dirección publica avisos/novedades; el equipo
// los ve al abrir la app (turnos del finde, brunch del domingo, normas…).

const express = require("express");
const store = require("../data-store");
const auditoria = require("../auditoria");

const router = express.Router();
const esAdmin = (req) => req.user && req.user.rol === "admin";

function orden(items) {
  return items.slice().sort((a, b) => (Number(b.fijado || 0) - Number(a.fijado || 0)) || String(b.fecha || "").localeCompare(String(a.fecha || "")));
}

router.get("/", (req, res) => {
  res.json({ avisos: orden(store.readAll("tablon")), puede_publicar: esAdmin(req) });
});

router.post("/", express.json(), async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo dirección publica en el tablón." });
  const b = req.body || {};
  const titulo = String(b.titulo || "").trim().slice(0, 120);
  const cuerpo = String(b.cuerpo || "").trim().slice(0, 2000);
  if (!titulo && !cuerpo) return res.status(400).json({ error: "Escribe al menos un título o un mensaje." });
  const row = {
    id: store.nextId("tab", "tablon"),
    titulo, cuerpo, autor: (req.user && req.user.nombre) || "Dirección",
    fecha: new Date().toISOString(), fijado: !!b.fijado,
  };
  store.insert("tablon", row);
  auditoria.registrar(req, { accion: "tablon_publicar", entidad: "tablon", entidad_id: row.id, resumen: titulo || cuerpo.slice(0, 40) });
  await store.flush();
  res.status(201).json(row);
});

router.put("/:id", express.json(), async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo dirección edita el tablón." });
  const ex = store.findById("tablon", req.params.id);
  if (!ex) return res.status(404).json({ error: "Aviso no encontrado." });
  const b = req.body || {};
  const patch = {};
  if (b.titulo !== undefined) patch.titulo = String(b.titulo).trim().slice(0, 120);
  if (b.cuerpo !== undefined) patch.cuerpo = String(b.cuerpo).trim().slice(0, 2000);
  if (b.fijado !== undefined) patch.fijado = !!b.fijado;
  const upd = store.update("tablon", ex.id, patch);
  await store.flush();
  res.json(upd);
});

router.delete("/:id", async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo dirección borra del tablón." });
  const ex = store.findById("tablon", req.params.id);
  if (!ex) return res.status(404).json({ error: "Aviso no encontrado." });
  store.remove("tablon", ex.id);
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
module.exports.orden = orden;
