const express = require("express");
const cors = require("cors");
const path = require("path");
const store = require("./data-store");
const auth = require("./auth");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 4001;

app.use(cors());
// Límite amplio: las peticiones con fotos (albaranes, productos, proveedores)
// llevan imágenes en base64. Con el límite por defecto (100 KB) cualquier foto
// algo grande daba error 413. Este parser global corre antes que los de cada
// ruta, así que aquí es donde hay que subir el tope.
app.use(express.json({ limit: "25mb" }));

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

// Ficha pública de un lote: es la página que abre el QR de la pegatina.
// Pública (el móvil que escanea no lleva sesión) y con toda la trazabilidad.
app.get("/lote/:id", async (req, res) => {
  const labelService = require("./label-service");
  const lote = store.findById("lotes", req.params.id);
  if (!lote) {
    return res
      .status(404)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<body style="font-family:sans-serif;background:#F0EBE0;color:#9C5A2E;padding:30px;text-align:center;">` +
          `<h2>Lote no encontrado</h2><p>Este código no corresponde a ningún lote registrado. ` +
          `Puede que se haya borrado o que la pegatina sea de otro sistema.</p></body>`
      );
  }
  const receta = store.findById("recetas", lote.receta_id);
  try {
    const html = labelService.renderFichaLoteHTML({
      lote,
      receta,
      materias: store.readAll("materias"),
      responsable: req.query.responsable || lote.responsable || null,
    });
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (e) {
    res.status(500).send("No se pudo abrir la ficha del lote: " + e.message);
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

// Disparador externo de avisos (lo llama un cron de GitHub Actions cada hora).
// Es público pero exige un token secreto. Clave: aunque Render esté "dormido",
// esta petición lo DESPIERTA y entonces envía el aviso → llega aunque no haya
// nada del usuario encendido. El propio servidor decide si toca enviar (hora
// local Europe/Madrid + una vez al día); con ?force=1 envía siempre (pruebas).
app.all("/avisos/cron", async (req, res) => {
  const token = process.env.AVISOS_CRON_TOKEN;
  if (!token) return res.status(503).json({ error: "AVISOS_CRON_TOKEN no configurado en el servidor" });
  const got = req.headers["x-cron-token"] || req.query.token;
  if (got !== token) return res.status(401).json({ error: "Token inválido" });
  try {
    const avisos = require("./avisos");
    const r = req.query.force === "1" ? await avisos.enviarAviso({ force: true }) : await avisos.cronTick();
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ingesta del CONECTOR local de Ágora (público con token compartido). Un pequeño
// programa en el local lee las ventas de Ágora y las EMPUJA aquí por HTTPS
// saliente (cero puertos entrantes, cero IP fija). Autentica con un token en
// cabecera, no con sesión de usuario (el token vive solo en variables de entorno).
app.post("/agora/ingest", express.json({ limit: "12mb" }), async (req, res) => {
  const token = process.env.AGORA_CONNECTOR_TOKEN;
  if (!token) return res.status(503).json({ error: "AGORA_CONNECTOR_TOKEN no configurado en el servidor" });
  const got = req.headers["x-connector-token"] || (req.query && req.query.token);
  if (got !== token) return res.status(401).json({ error: "Token del conector inválido" });
  try {
    const docs = (req.body && (req.body.docs || req.body.documents || req.body)) || [];
    const r = require("./agora").importarDocs(docs, { usuario: { nombre: "Conector Ágora" } });
    await store.flush();
    res.json(r); // incluye procesados_ref → el conector confirma a Ágora
  } catch (e) {
    res.status(500).json({ error: "No se pudo ingerir de Ágora: " + e.message });
  }
});

// ── A partir de aquí, todo /api/* exige sesión válida (y respeta el rol) ───────
app.use("/api", auth.requerido);

app.use("/api/inicio", require("./routes/inicio"));
app.use("/api/decisiones", require("./routes/decisiones"));
app.use("/api/auditoria", require("./routes/auditoria"));
app.use("/api/materias", require("./routes/materias"));
app.use("/api/recetas", require("./routes/recetas"));
app.use("/api/lotes", require("./routes/lotes"));
app.use("/api/calendario", require("./routes/calendario"));
app.use("/api/preparaciones", require("./routes/preparaciones"));
app.use("/api/revisiones", require("./routes/revisiones"));
app.use("/api/recetario-cafe", require("./routes/recetario-cafe"));
app.use("/api/apertura", require("./routes/apertura"));
app.use("/api/prevision", require("./routes/prevision"));
app.use("/api/ajustes", require("./routes/ajustes"));
app.use("/api/proveedores", require("./routes/proveedores"));
app.use("/api/compras-productos", require("./routes/compras-productos"));
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
      if (filePath.endsWith(".html") || filePath.endsWith("sw.js")) {
        // El service worker también sin caché, para que se actualice siempre.
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
