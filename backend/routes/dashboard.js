// DASHBOARD CEO · centro de mando de la portada (solo dirección).
// Una sola llamada con todo lo que la portada necesita (dashboard-ceo.calcular).
const express = require("express");
const { soloAdmin } = require("./_guard");
const dashboard = require("../dashboard-ceo");

const router = express.Router();

// Caché de respuesta de CORTA duración (rendimiento.2). La portada recorre el array
// de ventas decenas de veces por llamada y el front la refresca cada 3 min; un TTL
// pequeño evita recomputar en refrescos seguidos sin mostrar datos rancios (≤20 s).
// El dashboard es solo admin (soloAdmin), así que una sola entrada basta (sin rol).
// ?fresh=1 fuerza recálculo (botón de recargar).
let _cache = null; // { ts, data }
const TTL_MS = 20000;

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const ahora = Date.now();
    if (_cache && ahora - _cache.ts < TTL_MS && req.query.fresh !== "1") {
      res.set("X-Cache", "hit");
      return res.json(_cache.data);
    }
    const data = dashboard.calcular({ now: ahora });
    _cache = { ts: ahora, data };
    res.set("Cache-Control", "private, max-age=20");
    res.set("X-Cache", "miss");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
