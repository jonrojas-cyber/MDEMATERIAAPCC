const express = require("express");
const auth = require("../auth");
const store = require("../data-store");

const router = express.Router();

// POST /api/auth/login  { usuario, pin }  -> { token, usuario }
router.post("/login", async (req, res) => {
  const { usuario, pin } = req.body || {};
  if (!usuario || !pin) return res.status(400).json({ error: "Indica usuario y PIN" });
  const sesion = auth.login(usuario, pin);
  await store.flush(); // confirmar intentos/bloqueo antes de responder
  if (sesion.token) return res.json(sesion);
  // Bloqueo por intentos -> 429; credenciales incorrectas -> 401.
  const code = sesion.bloqueado ? 429 : 401;
  return res.status(code).json(sesion);
});

// POST /api/auth/cambiar-pin  { pin_actual, pin_nuevo }  (sesión requerida)
router.post("/cambiar-pin", async (req, res) => {
  const user = auth.verificar(auth.tokenDe(req));
  if (!user) return res.status(401).json({ error: "Sesión no válida" });
  const { pin_actual, pin_nuevo } = req.body || {};
  const r = auth.cambiarPin(user.key, pin_actual, pin_nuevo);
  if (r.error) return res.status(400).json(r);
  await store.flush(); // confirmar el nuevo hash antes de responder
  res.json(r);
});

// GET /api/auth/me  -> datos de la sesión actual (valida el token)
router.get("/me", (req, res) => {
  const user = auth.verificar(auth.tokenDe(req));
  if (!user) return res.status(401).json({ error: "Sesión no válida" });
  res.json({ usuario: { key: user.key, nombre: user.nombre, rol: user.rol, local_id: user.local_id || "principal" } });
});

module.exports = router;
