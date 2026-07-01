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

// POST /api/ventas/agora-import  { docs: [...] }  (export de Ágora vía puente)
// Mapea producto→escandallo, descuenta stock y es IDEMPOTENTE por doc.id.
// Responde con los ids procesados para que el frontend confirme a Ágora
// (POST /api/doc/processed) y deje de reexportarlos.
router.post("/agora-import", express.json({ limit: "8mb" }), async (req, res) => {
  const docs = (req.body && (req.body.docs || req.body.documents || req.body)) || [];
  try {
    const r = agora.importarDocs(docs);
    require("../auditoria").registrar(req, {
      accion: "ventas_agora",
      entidad: "ventas",
      resumen: `Ágora: ${r.procesados} doc(s), ${r.unidades_vendidas} uds, ${r.importe_total} €${r.omitidos_ya_procesados ? ` · ${r.omitidos_ya_procesados} ya procesados` : ""}`,
      meta: { procesados: r.procesados, omitidos: r.omitidos_ya_procesados, no_reconocidos: r.productos_no_reconocidos },
    });
    await store.flush(); // stock + ventas + docs procesados confirmados antes de responder
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: "No se pudo importar de Ágora: " + e.message });
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
