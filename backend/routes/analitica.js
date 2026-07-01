const express = require("express");
const analitica = require("../analitica");

const router = express.Router();

// Panel del propietario (solo admin — se monta bajo /api que ya exige sesión;
// el rol se comprueba aquí para no exponer dinero al equipo).
router.get("/", (req, res) => {
  if (!req.user || req.user.rol !== "admin") {
    return res.status(403).json({ error: "Solo el propietario ve la analítica." });
  }
  const dias = Math.min(365, Math.max(7, Number(req.query.dias) || 30));
  try {
    res.json(analitica.panel(dias));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
