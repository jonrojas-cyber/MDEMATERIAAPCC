const express = require("express");
const noti = require("../notificaciones");

const router = express.Router();

// Solo admin puede cambiar la configuración o forzar un envío.
function soloAdmin(req, res, next) {
  if (req.user && req.user.rol === "admin") return next();
  res.status(403).json({ error: "Solo administradores pueden gestionar los avisos." });
}

// Resumen vivo para la campana (lo ve todo el mundo con sesión).
router.get("/", (req, res) => {
  res.json(noti.resumen());
});

router.get("/config", (req, res) => {
  res.json(noti.obtenerConfig());
});

router.patch("/config", soloAdmin, (req, res) => {
  res.json(noti.guardarConfig(req.body || {}));
});

// Envía el aviso ahora mismo (botón "probar" / "enviar ya").
router.post("/enviar", soloAdmin, async (req, res) => {
  try {
    const r = await noti.enviarAlertaDiaria({ motivo: "manual" });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code || null });
  }
});

module.exports = router;
