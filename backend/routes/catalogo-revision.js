// REVISIÓN BIMESTRAL DEL CATÁLOGO DE COMPRA (solo admin/dirección).
const express = require("express");
const rev = require("../catalogo-revision");

const router = express.Router();

function soloAdmin(req, res) {
  if (!req.user || req.user.rol !== "admin") { res.status(403).json({ error: "Solo dirección revisa el catálogo." }); return false; }
  return true;
}

// GET /  → estado de la revisión: due, candidatos a archivar, ya archivados.
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try { res.json(rev.estado()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /archivar { ids:[...] }  → archiva (recuperable) los productos indicados.
router.post("/archivar", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const n = await rev.archivar((req.body && req.body.ids) || []);
    res.json({ archivados: n, estado: rev.estado() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /recuperar { ids:[...] }  → recupera (desarchiva) los productos indicados.
router.post("/recuperar", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const n = await rev.recuperar((req.body && req.body.ids) || []);
    res.json({ recuperados: n, estado: rev.estado() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /hecha  → marca la revisión como realizada (reinicia el contador de 2 meses).
router.post("/hecha", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  try { const iso = await rev.marcarRevisada(); res.json({ ok: true, ultima_revision: iso }); } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
