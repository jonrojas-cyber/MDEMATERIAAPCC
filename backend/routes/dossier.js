// DOSSIER PARA ASESORÍA · descarga de todo el negocio para analizar con Claude.
// Solo admin (lleva coste, margen y estructura financiera).

const express = require("express");
const dossier = require("../dossier");

const router = express.Router();

router.get("/", (req, res) => {
  if (!req.user || req.user.rol !== "admin") {
    return res.status(403).json({ error: "Solo dirección puede generar el dossier." });
  }
  const opts = {};
  if (req.query.dias) opts.dias = req.query.dias;
  if (req.query.desde) opts.desde = req.query.desde;
  if (req.query.hasta) opts.hasta = req.query.hasta;
  try {
    const { dossier: d, markdown } = dossier.generar(opts);
    if (String(req.query.format) === "md") {
      res.set("Content-Type", "text/markdown; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="Dossier_m_de_materia.md"`);
      return res.send(markdown);
    }
    res.json({ dossier: d, markdown });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
