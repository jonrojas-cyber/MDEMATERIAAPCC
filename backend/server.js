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
      cantidad: lote.cantidad_inicial != null ? `${lote.cantidad_inicial} ${receta ? receta.unidad || "" : ""}`.trim() : "",
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

// Etiqueta de PRODUCCIÓN genérica (pública, sin lote guardado). Sirve para
// datar CUALQUIER cosa que preparas —óleo, base de matcha, cordial…— con su
// hora de elaboración y la vida útil que elijas. No persiste nada: los datos
// viajan en el QR y la ficha (/p) calcula el tiempo que lleva en vivo.
function prepDatos(q) {
  const nombre = String(q.n || "producción").slice(0, 60);
  const cantidad = q.c ? String(q.c).slice(0, 40) : "";
  const vidaH = Math.max(0, Number(q.v) || 0);
  const prodRaw = q.p ? new Date(q.p) : new Date();
  const producido = isNaN(prodRaw.getTime()) ? new Date() : prodRaw;
  const caduca = vidaH > 0 ? new Date(producido.getTime() + vidaH * 3600000) : null;
  const ini = (nombre.replace(/[^a-zA-ZñÑ]/g, "").slice(0, 3).toUpperCase()) || "PRD";
  // Código: el que venga (lote real, ej. CB-260720-QCO) o uno generado en hora
  // de Málaga (no UTC del servidor) para que coincida con la hora mostrada.
  const pm = require("./tz").partes(producido);
  const code = q.code ? String(q.code).slice(0, 40) : `${ini}-${pm.day}${pm.month}-${pm.hour}${pm.minute}`;
  const estado = q.est ? String(q.est).slice(0, 40) : ""; // estado de prueba/I+D (Prueba, Por testear…)
  return { nombre, cantidad, vidaH, producidoISO: producido.toISOString(), caducaISO: caduca ? caduca.toISOString() : null, code, estado };
}

app.get("/etiqueta/prep", async (req, res) => {
  const labelService = require("./label-service");
  try {
    const d = prepDatos(req.query);
    const lote = { id: "prep", codigo: d.code, receta_id: d.nombre, producido_en: d.producidoISO, caduca_en: d.caducaISO, prueba: d.estado };
    const html = await labelService.renderEtiquetaHTML(req, {
      lote,
      receta: null,
      responsable: req.query.r || "—",
      autoprint: req.query.print === "1",
      autoprintWin: req.query.print === "win",   // imprime por el driver de Windows (cable/USB)
      qrUrl: labelService.urlFichaPrep(req, req.query),
      venceLabel: req.query.et ? String(req.query.et).slice(0, 24) : null,
      cantidad: d.cantidad,
    });
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (e) {
    res.status(400).send("No se pudo generar la etiqueta: " + e.message);
  }
});

// Etiquetas por LOTES: varias etiquetas en una sola impresión. El cliente manda
// `d` = base64url(JSON([{n,c,v,est,r,p}...])) ya expandido por copias.
app.get("/etiqueta/lote", async (req, res) => {
  const labelService = require("./label-service");
  try {
    let especs = [];
    if (req.query.d) {
      const json = Buffer.from(String(req.query.d), "base64").toString("utf-8");
      especs = JSON.parse(json);
    }
    if (!Array.isArray(especs) || !especs.length) return res.status(400).send("Lote vacío.");
    const html = await labelService.renderEtiquetasLoteHTML(req, especs, { autoprintWin: req.query.print === "win" });
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (e) {
    res.status(400).send("No se pudo generar el lote: " + e.message);
  }
});

app.get("/p", (req, res) => {
  const labelService = require("./label-service");
  try {
    const d = prepDatos(req.query);
    const lote = {
      id: "prep", codigo: d.code, receta_id: d.nombre,
      producido_en: d.producidoISO, caduca_en: d.caducaISO,
      cantidad_inicial: d.cantidad || "", estado: "Correcto",
      responsable: req.query.r || null, prueba: d.estado,
    };
    // et: etiqueta del campo de vencimiento (p. ej. "Maceración lista" en cold
    // brew, en vez de "Consumir antes"). El contador de tiempo es el mismo.
    const venceLabel = req.query.et ? String(req.query.et).slice(0, 40) : null;
    const html = labelService.renderFichaLoteHTML({ lote, receta: null, materias: [], responsable: req.query.r || null, venceLabel });
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (e) {
    res.status(400).send("No se pudo abrir la ficha: " + e.message);
  }
});

// QR genérico como PNG (mismo generador que el etiquetado de lotes: qrcode).
// Lo usan las etiquetas del frontend con <img src="/qr?d=...">, para no meter
// una segunda librería de QR en el sistema. Público: las etiquetas se imprimen
// en ventanas/impresión sin sesión.
app.get("/qr", async (req, res) => {
  const QRCode = require("qrcode");
  const texto = String(req.query.d || "").slice(0, 1200);
  if (!texto) return res.status(400).send("Falta el parámetro d");
  try {
    const buf = await QRCode.toBuffer(texto, { margin: 1, width: Math.min(600, Math.max(64, parseInt(req.query.w, 10) || 220)), errorCorrectionLevel: "M" });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (e) {
    res.status(500).send("No se pudo generar el QR: " + e.message);
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
          `<body style="font-family:'Courier New','Courier Prime',monospace;background:#F0EBE0;color:#9C5A2E;padding:30px;text-align:center;">` +
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

// ── CONECTOR TPV (Ágora) ──────────────────────────────────────────────────────
// Un pequeño agente en el local lee las ventas del TPV y las EMPUJA aquí por HTTPS
// saliente (cero puertos entrantes, cero IP fija). Autentica con la CLAVE del
// conector (cabecera X-Connector-Token), no con sesión de usuario. La clave se
// gestiona DENTRO de la app (Ajustes → Conector TPV); también se acepta la antigua
// variable de entorno AGORA_CONNECTOR_TOKEN. Rutas públicas (sin sesión):
//   POST /tpv/ingest   → ingiere ventas (array o { docs:[...] }); idempotente.
//   GET  /tpv/ping      → prueba de conexión + clave (para "Probar conexión").
//   POST /agora/ingest  → alias histórico, mismo comportamiento.
const tpvConn = require("./tpv-connector");
function tpvAutoriza(req, res) {
  if (!tpvConn.claveActual(store)) {
    res.status(503).json({ error: "Conector sin configurar: genera la clave en Ajustes → Conector TPV." });
    return false;
  }
  if (!tpvConn.verificar(store, tpvConn.tokenDePeticion(req))) {
    res.status(401).json({ error: "Clave del conector inválida." });
    return false;
  }
  return true;
}
async function tpvIngesta(req, res) {
  if (!tpvAutoriza(req, res)) return;
  try {
    const r = tpvConn.ingerir(store, req.body, { usuario: { nombre: "Conector TPV" } });
    await store.flush(); // stock + ventas + docs confirmados antes de responder
    res.json(r); // incluye procesados_ref → el agente confirma a Ágora
  } catch (e) {
    res.status(e.code === "SIN_DOCS" ? 400 : 500).json({ error: "No se pudo ingerir del TPV: " + e.message });
  }
}
app.post("/tpv/ingest", express.json({ limit: "12mb" }), tpvIngesta);
app.post("/agora/ingest", express.json({ limit: "12mb" }), tpvIngesta);
app.get("/tpv/ping", (req, res) => {
  if (!tpvAutoriza(req, res)) return;
  res.json({
    ok: true,
    servicio: "Control M · Conector TPV",
    hora: new Date().toISOString(),
    persistencia: db.isActive() ? "persistente" : "efimera",
  });
});

// Ingesta de FACTURAS por correo (público con token compartido). La fundadora
// reenvía las facturas de sus proveedores a un buzón; un servicio de correo
// entrante (Resend Inbound, Zapier/Make…) las reenvía aquí por HTTPS. Autentica
// con un token en cabecera, no con sesión de usuario. Cada adjunto PDF/imagen se
// lee con el mismo OCR del albarán y se crea una recepción "Pendiente de
// confirmar" (origen "email") para que se valide en Compras. Nada se paga solo.
app.post("/facturas/ingesta", express.json({ limit: "25mb" }), async (req, res) => {
  const token = process.env.FACTURAS_INGESTA_TOKEN;
  if (!token) return res.status(503).json({ error: "FACTURAS_INGESTA_TOKEN no configurado en el servidor" });
  const got = req.headers["x-ingesta-token"] || (req.query && req.query.token);
  if (got !== token) return res.status(401).json({ error: "Token de ingesta inválido" });
  try {
    // Resend Inbound manda solo metadatos: hay que descargar los adjuntos aparte.
    // Otros reenviadores (Zapier/Make) mandan el contenido en el propio cuerpo.
    const resendInbound = require("./resend-inbound");
    const payload = resendInbound.esEventoInbound(req.body)
      ? await resendInbound.aPayload(req.body)
      : req.body;
    // ¿Es el export de VENTAS de Ágora (CSV/Excel) y no una factura? Se importa solo
    // con el mismo motor que la subida manual (reemplaza el mes). No necesita OCR.
    const ventasEmail = require("./ventas-email");
    if (ventasEmail.esCorreoDeVentas(payload)) {
      const rv = await ventasEmail.ingestar(store, payload);
      return res.json({ tipo: "ventas", ...rv });
    }
    // Si no, es una factura: cada adjunto PDF/imagen se lee con OCR.
    const ocr = require("./ocr");
    if (!ocr.disponible()) return res.status(503).json({ error: "OCR no configurado (define ANTHROPIC_API_KEY)" });
    const r = await require("./facturas-email").ingestar(payload, { ocrFn: ocr.extraerDesdeAdjunto });
    try { require("./factura-procesar").programar(store); } catch (e) {} // lee las facturas recién entradas (automático)
    res.json({ tipo: "factura", ...r });
  } catch (e) {
    res.status(500).json({ error: "No se pudo ingerir el correo: " + e.message });
  }
});

// ── CARTA DIGITAL PÚBLICA (la que abre el cliente por QR en la mesa) ──────────
// Pública, sin sesión, con la identidad de marca. Solo muestra nombre,
// descripción y precio de venta (nunca coste ni margen). /carta = la carta;
// /carta/qr = cartelito imprimible con el QR hacia la carta.
app.get("/carta", (req, res) => {
  try {
    const html = require("./menu-service").renderCartaPublicaHTML();
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (e) {
    res.status(500).send("No se pudo abrir la carta: " + e.message);
  }
});
app.get("/carta/qr", (req, res) => {
  try {
    const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
    const urlCarta = `${proto}://${req.get("host")}/carta`;
    const qrSrc = `/qr?d=${encodeURIComponent(urlCarta)}&w=520`;
    const html = require("./menu-service").renderQRCarterHTML(urlCarta, qrSrc);
    res.set("Content-Type", "text/html; charset=utf-8").send(html);
  } catch (e) {
    res.status(500).send("No se pudo generar el QR de la carta: " + e.message);
  }
});

// ── A partir de aquí, todo /api/* exige sesión válida (y respeta el rol) ───────
app.use("/api", auth.requerido);

app.use("/api/inicio", require("./routes/inicio"));
app.use("/api/decisiones", require("./routes/decisiones"));
app.use("/api/buscar", require("./routes/buscar"));
app.use("/api/auditoria", require("./routes/auditoria"));
app.use("/api/materias", require("./routes/materias"));
app.use("/api/recetas", require("./routes/recetas"));
app.use("/api/lotes", require("./routes/lotes"));
app.use("/api/lotes-produccion", require("./routes/lotes-produccion"));
app.use("/api/calendario", require("./routes/calendario"));
app.use("/api/preparaciones", require("./routes/preparaciones"));
app.use("/api/revisiones", require("./routes/revisiones"));
app.use("/api/recetario-cafe", require("./routes/recetario-cafe"));
app.use("/api/apertura", require("./routes/apertura"));
app.use("/api/prevision", require("./routes/prevision"));
app.use("/api/analitica", require("./routes/analitica"));
app.use("/api/ajustes", require("./routes/ajustes"));
app.use("/api/inventario", require("./routes/inventario"));
app.use("/api/proveedores", require("./routes/proveedores"));
app.use("/api/compras-productos", require("./routes/compras-productos"));
app.use("/api/compras-informe", require("./routes/compras-informe"));
app.use("/api/recepciones", require("./routes/recepciones"));
app.use("/api/pedidos", require("./routes/pedidos"));
app.use("/api/pagos", require("./routes/pagos"));
app.use("/api/etiquetas", require("./routes/etiquetas"));
app.use("/api/mermas", require("./routes/mermas")); // mermas: registro rápido por producto (escribe en `ajustes`, única fuente)
app.use("/api/carta", require("./routes/carta"));
app.use("/api/reportes", require("./routes/reportes"));
app.use("/api/ventas", require("./routes/ventas"));
app.use("/api/cierre-caja", require("./routes/cierre-caja"));
app.use("/api/avisos", require("./routes/avisos"));
app.use("/api/mbds", require("./routes/mbds")); // laboratorio de bebidas (MBDS)
app.use("/api/turnos", require("./routes/turnos")); // cuadrante de turnos del equipo (lectura equipo, edición admin)
app.use("/api/fichaje", require("./routes/fichaje")); // reloj de fichaje (tablet); resumen real-vs-plan es admin
app.use("/api/equipo", require("./routes/equipo")); // hub de Equipo (une turnos/fichaje/ausencias/tablón/incidencias)
app.use("/api/ausencias", require("./routes/ausencias")); // vacaciones/bajas/permisos (equipo pide, admin aprueba)
app.use("/api/tablon", require("./routes/tablon")); // comunicación interna (admin publica, equipo lee)
app.use("/api/incidencias", require("./routes/incidencias")); // partes del equipo (equipo abre, admin resuelve)

// ── Centro de Control · capa financiera / negocio (solo admin) ─────────────────
// Todos estos segmentos quedan FUERA de EQUIPO_ALLOWED en auth.js, por lo que el
// middleware `requerido` ya bloquea a los no-admin; cada ruta lo reafirma además.
app.use("/api/executive-dashboard", require("./routes/executive-dashboard"));
app.use("/api/dashboard", require("./routes/dashboard")); // centro de mando de la portada (CEO)
app.use("/api/cierre-mes", require("./routes/cierre-mes")); // informe de cierre mensual (admin)
app.use("/api/financials", require("./routes/financials"));
app.use("/api/ebitda", require("./routes/ebitda"));
app.use("/api/fixed-costs", require("./routes/fixed-costs"));
app.use("/api/debts", require("./routes/debts"));
app.use("/api/assets", require("./routes/assets"));
app.use("/api/treasury", require("./routes/treasury"));
app.use("/api/targets", require("./routes/targets"));
app.use("/api/business-health", require("./routes/business-health"));
app.use("/api/business-calendar", require("./routes/business-calendar"));
app.use("/api/business-time-machine", require("./routes/business-time-machine"));
app.use("/api/analisis-diario", require("./routes/analisis-diario")); // rayos X del día (admin)
app.use("/api/dossier", require("./routes/dossier")); // dossier para asesoría con Claude (admin)
app.use("/api/cuenta-resultados", require("./routes/cuenta-resultados")); // P&L mensual (admin)
app.use("/api/financiero", require("./routes/financiero")); // resumen día·mes·año con cascada EBITDA (admin)
app.use("/api/catalogo-revision", require("./routes/catalogo-revision")); // revisión bimestral del catálogo de compra (admin)
app.use("/api/limpieza-catalogo", require("./routes/limpieza-catalogo")); // archivar productos/producciones no vinculados (admin)
app.use("/api/analisis-mes", require("./routes/analisis-mes")); // panel de análisis mensual de ventas (admin)
app.use("/api/integraciones", require("./routes/integraciones")); // conector TPV (Ágora): clave, estado, prueba (admin)

// Sirve el frontend estático (single-file app).
// El HTML va con "no-cache" para que el navegador SIEMPRE cargue la última
// versión (evita que móviles como Samsung/Chrome sirvan una copia vieja).
// Las fuentes se cachean a largo plazo (no cambian).
app.use(
  express.static(path.join(__dirname, "..", "frontend"), {
    etag: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".webmanifest")) {
        // Manifest de la PWA: content-type correcto y sin caché agresiva para
        // que los cambios (tema, iconos) lleguen al reinstalar.
        res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
      } else if (filePath.endsWith(".html") || filePath.endsWith("sw.js")) {
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
  .then(async () => {
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
    // Siembra idempotente de la carta de café (cafés Inefable + leches). Inserta
    // en el almacén real (Postgres o JSON) si faltan; se ejecuta una sola vez.
    require("./seed-cafe").seedCafe().catch(() => {});
    // Siembra idempotente del negocio: gastos fijos + préstamos (Costes fijos / Deuda).
    require("./seed-negocio").seedNegocio().catch(() => {});
    // Objetivos de referencia (food cost, personal, prime cost, fijos, EBITDA) para
    // el semáforo del resumen financiero. Idempotente por tipo (no pisa los tuyos).
    require("./seed-objetivos").seedObjetivos().catch(() => {});
    require("./seed-turnos").seedTurnos().catch(() => {}); // rotación de turnos (7 sep–15 nov 2026)
    require("./seed-fit").seedFit().catch(() => {}); // línea fit: Ice Latte proteico + Matcha colágeno (lata)
    require("./seed-analisis-mes").seedAnalisisMes().catch(() => {}); // snapshot de análisis del mes (sept 2026)
    require("./seed-etiquetas").seedEtiquetas().catch(() => {}); // catálogo de etiquetas de producción (buscador)
    // Siembra idempotente de proveedores reales (Frutería y siguientes) y, después,
    // los productos por proveedor extraídos de las facturas del 3T 2026 (catálogo de
    // compra para el buscador de Pedidos). El segundo depende de que existan los
    // proveedores, por eso se encadena.
    require("./seed-proveedores").seedProveedores()
      .then(() => { try { require("./seed-productos-facturas").aplicar(store); } catch (e) {} })
      .catch(() => {});
    // Siembra idempotente de los productos de venta de Ágora que Control M no
    // tenía (para que el conector deje de bloquear tickets por "no vinculado").
    require("./seed-productos-agora").seedProductosAgora().catch(() => {});
    // Siembra idempotente de usuarios (cambios de PIN / altas pedidos por la fundadora).
    require("./seed-usuarios").seedUsuarios().catch(() => {});
    // Siembra idempotente de la carta de cocina (Crunch, Tostas, Croissants + elaboraciones).
    require("./seed-cocina").seedCocina().catch(() => {});
    // Rellena las recetas del TPV (café 17 g + leche/té/iced matcha) para que la
    // venta descuente stock. Idempotente; nunca pisa una receta ya puesta.
    require("./seed-escandallos-tpv").seedEscandallosTpv().catch(() => {});
    // Limonadas (Burbujas) + Zumo materia: escandallo por vaso (200 ml) enlazado.
    require("./seed-escandallos-limonadas").seedEscandallosLimonadas().catch(() => {});
    // Limpia ventas duplicadas heredadas (import antiguo por CSV sin doc_clave) que
    // inflaban los ingresos del mes en el P&L. Conservadora e idempotente.
    require("./migracion-ventas-dup").migrarVentasDup(store).catch(() => {});
    // Vuelca el precio de Compras al coste de cada materia pendiente (food cost vivo).
    require("./coste-desde-compras").seedCosteDesdeCompras().catch(() => {});
    // Limpieza ÚNICA de los datos de PRUEBA de la semilla original (proveedores,
    // materias, recetas, lotes y productos de ejemplo). Solo en producción
    // (Postgres) y una sola vez (flag en config); en dev/tests (JSON) no corre,
    // para no vaciar los fixtures que usan las pruebas.
    try {
      if (store.isUsingDb && store.isUsingDb()) {
        const hecho = (store.readAll("config") || []).some((c) => c && c.id === "limpieza_demo_v1");
        if (!hecho) {
          const n = require("./limpieza-demo").limpiarDemo(store);
          store.insert("config", { id: "limpieza_demo_v1", hecho: true, retirados: n, fecha: new Date().toISOString() });
          await store.flush();
          console.log(`Limpieza de datos de prueba · ${n} registros retirados.`);
        }
      }
    } catch (e) { console.error("No se pudo limpiar los datos de prueba:", e.message); }
    // Limpieza de PRODUCCIÓN: da de baja (reversible) materias y recetas que no
    // componen ningún producto vendido. Solo en producción (Postgres) y una vez
    // (flag); en dev/tests (JSON) no corre para no desactivar los fixtures.
    try {
      if (store.isUsingDb && store.isUsingDb()) {
        const r = require("./limpieza-produccion").aplicar(store);
        if (r.ranAny) { await store.flush(); console.log(`Limpieza de producción · ${r.materias} materias y ${r.recetas} recetas dadas de baja (reversible).`); }
      }
    } catch (e) { console.error("No se pudo limpiar la producción:", e.message); }
    // Reprograma los temporizadores de producción pendientes (avisos push).
    try { require("./sv-timers").init(); } catch (e) {}

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
