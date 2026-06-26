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
  const persistente = db.isActive();
  res.json({
    estado: "Control M · Producción en marcha",
    almacen: persistente ? "postgres" : "json",
    // "persistente": los datos sobreviven a reinicios (Postgres).
    // "efimera": modo ficheros JSON; en Render el disco es efímero -> riesgo
    // de pérdida de datos al reiniciar. El frontend avisa si es efímera.
    persistencia: persistente ? "persistente" : "efimera",
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

// Descarga del PDF del justificante (pública por id, para enlazar en email/WhatsApp).
app.get("/justificante/:id/pdf", async (req, res) => {
  const j = store.readAll("justificantes").find((x) => x.id === req.params.id);
  if (!j) return res.status(404).send("Justificante no encontrado");
  try {
    const buf = await require("./pdf").justificanteBuffer(j);
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="justificante-${j.codigo}.pdf"`);
    res.send(buf);
  } catch (e) {
    res.status(500).send("No se pudo generar el PDF: " + e.message);
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
app.use("/api/avisos", require("./routes/avisos"));

// Sirve el frontend estático (single-file app).
// El HTML va con "no-cache" para que el navegador SIEMPRE cargue la última
// versión (evita que móviles como Samsung/Chrome sirvan una copia vieja).
// Las fuentes se cachean a largo plazo (no cambian).
app.use(
  express.static(path.join(__dirname, "..", "frontend"), {
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      } else if (/\.(woff2|ttf|png|jpe?g|svg|ico)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  })
);

// Arranca solo cuando el almacén está listo (hidratado desde PostgreSQL o JSON).
store
  .init()
  .then(() => {
    // ── Blindaje de persistencia ──────────────────────────────────────────
    // En producción sin Postgres, los datos viven en ficheros JSON sobre un
    // disco efímero (Render) y se PIERDEN al reiniciar. Avisamos fuerte; y con
    // REQUIRE_DB=1 el arranque se aborta para impedir la pérdida silenciosa.
    if (!db.isActive()) {
      const enProd = process.env.NODE_ENV === "production";
      console.warn(
        "\n⚠️  PERSISTENCIA EFÍMERA: sin DATABASE_URL, los datos se guardan en\n" +
        "   ficheros JSON locales. En un disco efímero (Render) se PERDERÁN al\n" +
        "   reiniciar. Configura DATABASE_URL (PostgreSQL) para conservarlos.\n"
      );
      if (enProd && process.env.REQUIRE_DB === "1") {
        console.error("REQUIRE_DB=1 y sin DATABASE_URL en producción: arranque abortado.");
        process.exit(1);
      }
    }
    app.listen(PORT, () => {
      console.log(`Control M · Producción escuchando en http://localhost:${PORT}`);
    });
    // Cron horario de importación de ventas de Ágora (si AGORA_CSV_PATH está configurado).
    const agora = require("./agora");
    setInterval(() => agora.cronImport(), 60 * 60 * 1000).unref();
    agora.cronImport(); // intento inicial al arrancar

    // Avisos por email (recordatorio de pedidos a una hora + lotes por caducar).
    // Se comprueba cada 5 min y envía una sola vez al día al llegar la hora fijada.
    const avisos = require("./avisos");
    setInterval(() => avisos.cronTick(), 5 * 60 * 1000).unref();
    avisos.cronTick(); // comprobación inicial al arrancar
  })
  .catch((e) => {
    console.error("Fallo al inicializar el almacén de datos:", e);
    process.exit(1);
  });
