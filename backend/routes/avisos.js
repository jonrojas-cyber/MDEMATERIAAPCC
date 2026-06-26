const express = require("express");
const avisos = require("../avisos");
const mailer = require("../mailer");

const router = express.Router();

// Estado: configuración actual + vista previa de lo que se enviaría ahora.
router.get("/", (req, res) => {
  res.json({
    config: avisos.getConfig(),
    resumen: avisos.construirResumen(),
    mailer_ok: mailer.disponible(),
  });
});

// Actualiza la configuración (hora, email, plazo de caducidad, activo).
router.put("/", (req, res) => {
  const { activo, email, hora, caducidad_horas } = req.body || {};
  const patch = {};
  if (activo != null) patch.activo = !!activo;
  if (email != null) patch.email = String(email).trim();
  if (hora != null) {
    const h = Number(hora);
    if (!Number.isInteger(h) || h < 0 || h > 23) return res.status(400).json({ error: "Hora inválida (0–23)." });
    patch.hora = h;
  }
  if (caducidad_horas != null) {
    const c = Number(caducidad_horas);
    if (!(c > 0)) return res.status(400).json({ error: "Plazo de caducidad inválido." });
    patch.caducidad_horas = Math.floor(c);
  }
  res.json(avisos.setConfig(patch));
});

// Envía un email de prueba ahora con el estado actual.
router.post("/probar", async (req, res) => {
  try {
    const r = await avisos.enviarResumen({ force: true });
    res.json({ ok: true, ...r });
  } catch (e) {
    const code = e.code === "AVISOS_NO_EMAIL" || e.code === "EMAIL_NO_CONFIG" ? 400 : 500;
    res.status(code).json({ error: e.message, code: e.code });
  }
});

module.exports = router;
