const express = require("express");
const store = require("../data-store");
const agora = require("../agora");

const router = express.Router();

// Acepta el CSV como texto plano (text/csv, text/plain) o como JSON { csv }.
const textParser = express.text({ type: ["text/*", "application/csv"], limit: "4mb" });

// POST /api/ventas/importar  (cuerpo: CSV de Ágora, o { csv: "..." })
router.post("/importar", textParser, (req, res) => {
  const csv = typeof req.body === "string" ? req.body : (req.body && req.body.csv) || "";
  if (!csv || !csv.trim()) {
    return res.status(400).json({ error: "Envía el CSV de ventas de Ágora (texto o { csv })" });
  }
  try {
    const resumen = agora.importarVentas(csv, "manual");
    res.json(resumen);
  } catch (e) {
    res.status(500).json({ error: "No se pudo importar: " + e.message });
  }
});

// GET /api/ventas  — ventas importadas (más recientes primero)
router.get("/", (req, res) => {
  res.json(store.readAll("ventas").slice().reverse());
});

// GET /api/ventas/sincronizacion — estado de la última sync con Ágora
router.get("/sincronizacion", (req, res) => {
  res.json(agora.ultimaSync() || { cuando: null });
});

module.exports = router;
