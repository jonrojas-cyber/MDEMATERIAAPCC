// CUENTA DE RESULTADOS · P&L mensual (solo admin).
const express = require("express");
const store = require("../data-store");
const cr = require("../cuenta-resultados");

const router = express.Router();

function soloAdmin(req, res) {
  if (!req.user || req.user.rol !== "admin") { res.status(403).json({ error: "Solo dirección ve la cuenta de resultados." }); return false; }
  return true;
}
const esMes = (s) => /^\d{4}-\d{2}$/.test(String(s || ""));

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    res.json(cr.calcular({ mes: req.query.mes, ventas: req.query.ventas }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Guardar (o borrar) el CIERRE de ventas netas de un mes, para que la cuenta
// cuadre con Ágora sin depender del conector. ventas vacío/0 → borra el cierre.
router.post("/cierre", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const mes = String((req.body && req.body.mes) || "");
  if (!esMes(mes)) return res.status(400).json({ error: "Mes no válido (formato AAAA-MM)." });
  const id = `ventas_mes_${mes}`;
  const val = Number(req.body && req.body.ventas);
  try {
    if (Number.isFinite(val) && val > 0) {
      if (store.findById("config", id)) store.update("config", id, { valor: val, actualizado_en: new Date().toISOString() });
      else store.insert("config", { id, valor: val, creado_en: new Date().toISOString() });
    } else if (store.findById("config", id)) {
      store.remove("config", id); // vaciar = volver a las ventas de la app
    }
    await store.flush();
    res.json(cr.calcular({ mes }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
