const express = require("express");
const avisos = require("../avisos");
const push = require("../push");

const router = express.Router();

// Estado: configuración + vista previa + datos de push (clave pública, nº de dispositivos).
router.get("/", (req, res) => {
  res.json({
    config: avisos.getConfig(),
    resumen: avisos.construirResumen(),
    push: { vapid_public_key: push.getPublicKey(), dispositivos: push.listSubs().length },
  });
});

// Actualiza la configuración (hora, plazo de caducidad, activo).
router.put("/", (req, res) => {
  const { activo, hora, caducidad_horas } = req.body || {};
  const patch = {};
  if (activo != null) patch.activo = !!activo;
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

// Registra el dispositivo (suscripción del navegador) para recibir avisos push.
router.post("/suscribir", (req, res) => {
  try {
    const sub = (req.body && req.body.subscription) || req.body;
    res.json({ ok: true, ...push.guardarSub(sub) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Da de baja este dispositivo.
router.post("/desuscribir", (req, res) => {
  const ep = (req.body && (req.body.endpoint || (req.body.subscription && req.body.subscription.endpoint))) || "";
  res.json({ ok: true, ...push.borrarSub(ep) });
});

// Envía un aviso de prueba ahora a los dispositivos suscritos.
router.post("/probar", async (req, res) => {
  try {
    const r = await avisos.enviarAviso({ force: true });
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(e.code === "PUSH_NO_SUBS" ? 400 : 500).json({ error: e.message, code: e.code });
  }
});

module.exports = router;
