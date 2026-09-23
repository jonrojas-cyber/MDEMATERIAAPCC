// AUSENCIAS · vacaciones / bajas / permisos. El equipo solicita; dirección aprueba.
// Se refleja en el hub de Equipo y sirve para no planificar turnos esos días.

const express = require("express");
const store = require("../data-store");
const auditoria = require("../auditoria");

const router = express.Router();
const esAdmin = (req) => req.user && req.user.rol === "admin";
const esYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
const TIPOS = ["vacaciones", "baja", "permiso", "dia_libre"];

// Días naturales (inclusivos) entre dos fechas.
function dias(desde, hasta) {
  const a = new Date(desde + "T12:00:00Z").getTime(), b = new Date(hasta + "T12:00:00Z").getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}
// ¿La ausencia cubre la fecha dada? (para "quién está de baja hoy")
function activaEn(a, ymd) { return a.estado === "aprobada" && String(a.desde) <= ymd && ymd <= String(a.hasta); }

router.get("/", (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  const items = store.readAll("ausencias").slice()
    .sort((a, b) => String(b.desde).localeCompare(String(a.desde)))
    .map((a) => ({ ...a, dias: dias(a.desde, a.hasta), activa_hoy: activaEn(a, hoy) }));
  res.json({ ausencias: items, tipos: TIPOS, puede_aprobar: esAdmin(req) });
});

router.post("/", express.json(), async (req, res) => {
  const b = req.body || {};
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : "vacaciones";
  const desde = String(b.desde || "").slice(0, 10), hasta = String(b.hasta || desde).slice(0, 10);
  if (!esYmd(desde) || !esYmd(hasta)) return res.status(400).json({ error: "Fechas no válidas (AAAA-MM-DD)." });
  if (hasta < desde) return res.status(400).json({ error: "La fecha de fin es anterior a la de inicio." });
  // La persona es quien lo pide; el admin puede indicar otra.
  const persona = (esAdmin(req) && b.persona) ? String(b.persona).slice(0, 40) : ((req.user && req.user.nombre) || String(b.persona || "").slice(0, 40));
  if (!persona) return res.status(400).json({ error: "Falta la persona." });
  const row = {
    id: store.nextId("aus", "ausencias"),
    persona, tipo, desde, hasta, motivo: String(b.motivo || "").slice(0, 200),
    estado: esAdmin(req) ? "aprobada" : "pendiente", // si lo mete dirección, ya queda aprobada
    creado_por: (req.user && req.user.nombre) || persona, creado_en: new Date().toISOString(),
  };
  store.insert("ausencias", row);
  auditoria.registrar(req, { accion: "ausencia_crear", entidad: "ausencias", entidad_id: row.id, resumen: `${persona} · ${tipo} · ${desde}→${hasta}` });
  await store.flush();
  res.status(201).json(row);
});

async function resolver(req, res, estado) {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo dirección aprueba o rechaza ausencias." });
  const a = store.findById("ausencias", req.params.id);
  if (!a) return res.status(404).json({ error: "Ausencia no encontrada." });
  const upd = store.update("ausencias", a.id, { estado, resuelto_por: req.user.nombre, resuelto_en: new Date().toISOString() });
  auditoria.registrar(req, { accion: "ausencia_" + estado, entidad: "ausencias", entidad_id: a.id, resumen: `${a.persona} · ${a.tipo} · ${estado}` });
  await store.flush();
  res.json(upd);
}
router.post("/:id/aprobar", (req, res) => resolver(req, res, "aprobada"));
router.post("/:id/rechazar", (req, res) => resolver(req, res, "rechazada"));

router.delete("/:id", async (req, res) => {
  const a = store.findById("ausencias", req.params.id);
  if (!a) return res.status(404).json({ error: "Ausencia no encontrada." });
  // El admin borra cualquiera; una persona solo su propia solicitud pendiente.
  const propiaPendiente = a.estado === "pendiente" && req.user && a.persona === req.user.nombre;
  if (!esAdmin(req) && !propiaPendiente) return res.status(403).json({ error: "No puedes borrar esta ausencia." });
  store.remove("ausencias", a.id);
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
module.exports.dias = dias;
module.exports.activaEn = activaEn;
module.exports.TIPOS = TIPOS;
