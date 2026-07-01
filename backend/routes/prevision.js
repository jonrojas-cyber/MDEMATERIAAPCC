const express = require("express");
const prevision = require("../prevision");

const router = express.Router();

// GET /api/prevision?weekday=0..6  (por defecto, hoy)
router.get("/", (req, res) => {
  let wd = req.query.weekday != null ? Number(req.query.weekday) : new Date().getDay();
  if (!Number.isInteger(wd) || wd < 0 || wd > 6) wd = new Date().getDay();
  try {
    res.json(prevision.planDia(wd));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
