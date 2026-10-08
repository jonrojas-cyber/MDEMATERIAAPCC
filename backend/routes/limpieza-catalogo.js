// LIMPIEZA DEL CATÁLOGO · archivar productos/producciones no vinculados (admin).
const express = require("express");
const store = require("../data-store");
const { soloAdmin } = require("./_guard");
const limpieza = require("../limpieza-catalogo");

const router = express.Router();

// GET / → previsualización: qué se archivaría + lo ya archivado por esta limpieza.
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try { res.json(limpieza.estado(store)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /aplicar → archiva (reversible) los candidatos.
router.post("/aplicar", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const sel = req.body && (req.body.productos || req.body.recetas) ? { productos: req.body.productos, recetas: req.body.recetas } : null;
    const r = await limpieza.aplicar(store, sel);
    res.json({ archivado: r, estado: limpieza.estado(store) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /recuperar { ids:[...], tipo:"productos"|"recetas" } → reactiva.
router.post("/recuperar", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const n = await limpieza.recuperar(store, (req.body && req.body.ids) || [], (req.body && req.body.tipo) || "productos");
    res.json({ recuperados: n, estado: limpieza.estado(store) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
