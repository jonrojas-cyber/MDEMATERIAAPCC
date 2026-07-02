const express = require("express");
const calendar = require("../business-calendar");
const { soloAdmin } = require("./_guard");

const router = express.Router();

// GET /api/business-calendar?offset=0  (0 = semana actual, -1 anterior, +1 siguiente)
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const offset = Number(req.query.offset) || 0;
  try {
    res.json(calendar.semana(Date.now(), offset));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
