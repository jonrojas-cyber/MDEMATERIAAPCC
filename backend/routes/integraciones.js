// INTEGRACIONES · Conector TPV (Ágora) — administración (solo admin).
// Gestiona la clave del conector, muestra la URL exacta a configurar en el agente
// y el estado de la sincronización (última sync, tickets bloqueados, productos sin
// vincular). La ingesta de ventas NO vive aquí: entra por las rutas públicas
// /tpv/ingest y /tpv/ping con la clave en cabecera.
const express = require("express");
const store = require("../data-store");
const tpv = require("../tpv-connector");
const { soloAdmin } = require("./_guard");

const router = express.Router();

function baseUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0];
  return `${proto}://${req.get("host")}`;
}

// GET /api/integraciones/tpv  — estado + datos de configuración del agente.
router.get("/tpv", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const base = baseUrl(req);
  res.json({
    ...tpv.estado(store),
    url_ingest: base + "/tpv/ingest",
    url_ping: base + "/tpv/ping",
    cabecera: tpv.CABECERA,
    // Vía fácil (sin instalar nada): reenviar el export de ventas al buzón de correo.
    email_ingesta: {
      configurada: !!process.env.FACTURAS_INGESTA_TOKEN,
      direccion: process.env.INGESTA_EMAIL || null, // si no está, es "el mismo buzón de las facturas"
    },
  });
});

// POST /api/integraciones/tpv/clave  — genera/rota la clave. Devuelve la clave
// COMPLETA una sola vez (luego solo se muestra enmascarada).
router.post("/tpv/clave", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const r = tpv.generarClave(store, req.user);
  try {
    require("../auditoria").registrar(req, {
      accion: "tpv_clave_generada", entidad: "config",
      resumen: "Nueva clave del conector TPV generada",
    });
  } catch (e) {}
  await store.flush();
  res.json({ ...r, aviso: "Guárdala ahora: por seguridad no se vuelve a mostrar completa." });
});

// POST /api/integraciones/tpv/revocar  — invalida la clave (corta el conector).
router.post("/tpv/revocar", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  tpv.revocar(store);
  try {
    require("../auditoria").registrar(req, {
      accion: "tpv_clave_revocada", entidad: "config",
      resumen: "Clave del conector TPV revocada",
    });
  } catch (e) {}
  await store.flush();
  res.json({ ok: true });
});

// POST /api/integraciones/tpv/probar  — valida el FORMATO de un envío de ejemplo
// sin escribir nada (dry-run): cuántos documentos se detectarían.
router.post("/tpv/probar", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const muestra = req.body && req.body.muestra != null ? req.body.muestra : req.body;
    const docs = tpv.extraerDocs(muestra);
    res.json({ ok: true, documentos_detectados: docs.length });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
