const express = require("express");
const auditoria = require("../auditoria");

const router = express.Router();

// GET /api/auditoria  -> registro de acciones críticas (admin).
// Filtros opcionales: ?accion= &entidad= &local_id= &desde= &hasta= &q= &limit=
router.get("/", (req, res) => {
  const eventos = auditoria.listar(req.query || {});
  // Acciones disponibles (para los filtros del frontend).
  const acciones = [...new Set(eventos.map((e) => e.accion))];
  res.json({ total: eventos.length, acciones, eventos });
});

module.exports = router;
