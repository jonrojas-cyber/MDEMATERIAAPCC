const express = require("express");
const auth = require("../auth");

const router = express.Router();

// POST /api/auth/login  { usuario, pin }  -> { token, usuario }
router.post("/login", (req, res) => {
  const { usuario, pin } = req.body || {};
  if (!usuario || !pin) return res.status(400).json({ error: "Indica usuario y PIN" });
  const sesion = auth.login(usuario, pin);
  if (!sesion) return res.status(401).json({ error: "Usuario o PIN incorrecto" });
  res.json(sesion);
});

// GET /api/auth/me  -> datos de la sesión actual (valida el token)
router.get("/me", (req, res) => {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const user = token ? auth.verificar(token) : null;
  if (!user) return res.status(401).json({ error: "Sesión no válida" });
  res.json({ usuario: { key: user.key, nombre: user.nombre, rol: user.rol } });
});

module.exports = router;
