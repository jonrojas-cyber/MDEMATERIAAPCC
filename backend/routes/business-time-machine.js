const express = require("express");
const timeMachine = require("../time-machine");
const { soloAdmin } = require("./_guard");

const router = express.Router();

// GET /api/business-time-machine?date=YYYY-MM-DD
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: "Indica una fecha (?date=YYYY-MM-DD)." });
  try {
    const out = timeMachine.reconstruir(date);
    if (out.error) return res.status(400).json(out);
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
