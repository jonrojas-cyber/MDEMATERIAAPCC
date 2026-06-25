const express = require("express");
const store = require("../data-store");
const ocr = require("../ocr");

const router = express.Router();

// Cuerpo grande para la imagen del albarán (base64).
const jsonGrande = express.json({ limit: "12mb" });

router.get("/", (req, res) => {
  res.json(store.readAll("recepciones"));
});

router.get("/ocr-estado", (req, res) => {
  res.json({ disponible: ocr.disponible() });
});

// Escanea un albarán: recibe la imagen y devuelve los datos extraídos (sin guardar).
// El usuario los confirma y luego llama a POST / para registrar la recepción.
router.post("/escanear", jsonGrande, async (req, res) => {
  const { imagen, media_type } = req.body || {};
  if (!imagen) return res.status(400).json({ error: "Envía la imagen del albarán (base64)" });
  const base64 = String(imagen).replace(/^data:[^,]+,/, ""); // admite data URL

  try {
    const datos = await ocr.extraerAlbaran(base64, media_type);

    // Intentar emparejar el proveedor por nombre con los existentes.
    const proveedores = store.readAll("proveedores");
    const norm = (s) => String(s || "").toLowerCase().trim();
    const match = proveedores.find((p) => norm(p.nombre) && norm(datos.proveedor).includes(norm(p.nombre)));

    res.json({ ...datos, proveedor_id: match ? match.id : null });
  } catch (e) {
    if (e.code === "OCR_NO_CONFIG") {
      return res.status(503).json({ error: "OCR no configurado. Adjunta la foto y rellena a mano.", code: "OCR_NO_CONFIG" });
    }
    res.status(500).json({ error: "No se pudo leer el albarán: " + e.message });
  }
});

// Entrada de recepción (manual o tras escanear). Admite foto y líneas opcionales.
router.post("/", jsonGrande, (req, res) => {
  const { proveedor_id, importe_total, foto_albaran, lineas } = req.body;
  if (!proveedor_id) return res.status(400).json({ error: "Indica el proveedor de la recepción" });
  const recepcion = {
    id: store.nextId("rcp", "recepciones"),
    proveedor_id,
    fecha: new Date().toISOString(),
    foto_albaran_url: foto_albaran || null,
    lineas: Array.isArray(lineas) ? lineas : [],
    estado: "Pendiente de confirmar",
    importe_total: importe_total || 0,
    pendiente_pago: importe_total || 0,
  };
  store.insert("recepciones", recepcion);
  res.status(201).json(recepcion);
});

router.post("/:id/confirmar", (req, res) => {
  const recepcion = store.update("recepciones", req.params.id, { estado: "Confirmada" });
  if (!recepcion) return res.status(404).json({ error: "Recepción no encontrada" });
  res.json(recepcion);
});

module.exports = router;
