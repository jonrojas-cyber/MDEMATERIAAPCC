const express = require("express");
const decisiones = require("../decisiones");

const router = express.Router();

// Centro de decisiones: acciones priorizadas, riesgos y oportunidades.
router.get("/", (req, res) => {
  try {
    res.json(decisiones.construir());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
