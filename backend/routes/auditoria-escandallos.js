// AUDITORÍA DE ESCANDALLOS por producto (solo dirección/admin).
// GET /api/auditoria-escandallos  → cada escandallo, ingrediente a ingrediente, con
// el origen del coste (enlazado a compra / estimado / sin precio / …).
const express = require("express");
const auditoria = require("../auditoria-escandallos");

const router = express.Router();

function soloAdmin(req, res) {
  if (!req.user || req.user.rol !== "admin") {
    res.status(403).json({ error: "Solo dirección ve la auditoría de escandallos." });
    return false;
  }
  return true;
}

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    res.json(auditoria.auditar());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
