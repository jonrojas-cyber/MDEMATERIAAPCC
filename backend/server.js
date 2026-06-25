const express = require("express");
const cors = require("cors");
const path = require("path");
const store = require("./data-store");
const auth = require("./auth");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
app.use(express.json());

// ── Rutas públicas (sin token) ────────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));

app.get("/api/salud", (req, res) => {
  res.json({
    estado: "Control M · Producción en marcha",
    almacen: db.isActive() ? "postgres" : "json",
    hora: new Date().toISOString(),
  });
});

// Página de impresión de etiqueta (pública: se abre en ventana nueva / sistema
// de impresión, donde no viaja la cabecera Authorization). 62x40mm Phomemo.
app.get("/etiqueta/lote/:loteId", async (req, res) => {
  const labelService = require("./label-service");
  const lote = store.findById("lotes", req.params.loteId);
  if (!lote) return res.status(404).send("Lote no encontrado");
  const receta = store.findById("recetas", lote.receta_id);
  try {
    const html = await labelService.renderEtiquetaHTML(req, {
      lote,
      receta,
      responsable: req.query.responsable || "—",
      autoprint: req.query.print === "1",
    });
    labelService.guardarHistorial({
      lote_id: lote.id,
      usuario: req.query.usuario || "Sin asignar",
      impresora: "Phomemo D520BT",
    });
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (e) {
    res.status(500).send("No se pudo generar la etiqueta: " + e.message);
  }
});

// ── A partir de aquí, todo /api/* exige sesión válida (y respeta el rol) ───────
app.use("/api", auth.requerido);

app.use("/api/inicio", require("./routes/inicio"));
app.use("/api/materias", require("./routes/materias"));
app.use("/api/recetas", require("./routes/recetas"));
app.use("/api/lotes", require("./routes/lotes"));
app.use("/api/preparaciones", require("./routes/preparaciones"));
app.use("/api/revisiones", require("./routes/revisiones"));
app.use("/api/ajustes", require("./routes/ajustes"));
app.use("/api/proveedores", require("./routes/proveedores"));
app.use("/api/recepciones", require("./routes/recepciones"));
app.use("/api/pedidos", require("./routes/pedidos"));
app.use("/api/pagos", require("./routes/pagos"));
app.use("/api/etiquetas", require("./routes/etiquetas"));
app.use("/api/carta", require("./routes/carta"));
app.use("/api/reportes", require("./routes/reportes"));
app.use("/api/ventas", require("./routes/ventas"));

// Sirve el frontend estático (single-file app)
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Arranca solo cuando el almacén está listo (hidratado desde PostgreSQL o JSON).
store
  .init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Control M · Producción escuchando en http://localhost:${PORT}`);
    });
    // Cron horario de importación de ventas de Ágora (si AGORA_CSV_PATH está configurado).
    const agora = require("./agora");
    setInterval(() => agora.cronImport(), 60 * 60 * 1000).unref();
    agora.cronImport(); // intento inicial al arrancar
  })
  .catch((e) => {
    console.error("Fallo al inicializar el almacén de datos:", e);
    process.exit(1);
  });
