// TURNOS · calendario del equipo por fecha. Lectura para el equipo (ven su turno,
// sin dinero); alta/edición/baja solo dirección (admin).

const express = require("express");
const store = require("../data-store");
const turnos = require("../turnos");
const auditoria = require("../auditoria");

const router = express.Router();

function esAdmin(req) { return req.user && req.user.rol === "admin"; }
function soloAdmin(req, res) { if (!esAdmin(req)) { res.status(403).json({ error: "Solo dirección puede editar los turnos." }); return false; } return true; }

const FUNCIONES = ["Apertura", "Cierre", "Apoyo", "Vuelta", "Barra / Café", "Cocina", "Sala", "Caja", "Limpieza", "Brunch", "Office"];
const esYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

function limpiar(b) {
  return {
    persona: String(b.persona || "").trim().slice(0, 40),
    fecha: String(b.fecha || "").slice(0, 10),
    inicio: String(b.inicio || "").trim().slice(0, 5),
    fin: String(b.fin || "").trim().slice(0, 5),
    funcion: String(b.funcion || "").trim().slice(0, 40),
    local_id: String(b.local_id || "principal").trim().slice(0, 20),
    notas: String(b.notas || "").trim().slice(0, 200),
  };
}

// ── SEMANA (cualquier usuario con sesión) ────────────────────────────────────
// ?semana=YYYY-MM-DD (cualquier día de esa semana). Por defecto, la semana actual.
router.get("/", (req, res) => {
  const lista = store.readAll("turnos");
  const ref = esYmd(req.query.semana) ? req.query.semana : new Date().toISOString().slice(0, 10);
  const cuad = turnos.cuadranteSemana(lista, ref);
  res.json({
    ...cuad,
    turno_def: turnos.TURNO_DEF,
    funciones: FUNCIONES,
    total_turnos: lista.length,
    puede_editar: esAdmin(req),
  });
});

// ── CREAR (admin) ────────────────────────────────────────────────────────────
router.post("/", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const t = limpiar(req.body || {});
  if (!t.persona) return res.status(400).json({ error: "Falta la persona." });
  if (!esYmd(t.fecha)) return res.status(400).json({ error: "Falta la fecha (AAAA-MM-DD)." });
  if (turnos.aMin(t.inicio) == null || turnos.aMin(t.fin) == null) return res.status(400).json({ error: "Horario no válido (usa HH:MM)." });
  const row = { id: store.nextId("tur", "turnos"), ...t, creado_en: new Date().toISOString() };
  store.insert("turnos", row);
  auditoria.registrar(req, { accion: "turno_crear", entidad: "turnos", entidad_id: row.id, resumen: `${t.persona} · ${t.fecha} ${t.inicio}-${t.fin} · ${t.funcion || "sin función"}` });
  await store.flush();
  res.status(201).json(row);
});

// ── EDITAR (admin) ───────────────────────────────────────────────────────────
router.put("/:id", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const ex = store.findById("turnos", req.params.id);
  if (!ex) return res.status(404).json({ error: "Turno no encontrado." });
  const t = limpiar({ ...ex, ...req.body });
  if (!esYmd(t.fecha)) return res.status(400).json({ error: "Fecha no válida." });
  if (turnos.aMin(t.inicio) == null || turnos.aMin(t.fin) == null) return res.status(400).json({ error: "Horario no válido (usa HH:MM)." });
  const row = store.update("turnos", req.params.id, t);
  auditoria.registrar(req, { accion: "turno_editar", entidad: "turnos", entidad_id: req.params.id, resumen: `${t.persona} · ${t.fecha} ${t.inicio}-${t.fin}` });
  await store.flush();
  res.json(row);
});

// ── BORRAR (admin) ───────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const ex = store.findById("turnos", req.params.id);
  if (!ex) return res.status(404).json({ error: "Turno no encontrado." });
  store.remove("turnos", req.params.id);
  auditoria.registrar(req, { accion: "turno_borrar", entidad: "turnos", entidad_id: req.params.id, resumen: `${ex.persona} · ${ex.fecha || ""} turno eliminado` });
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
module.exports.FUNCIONES = FUNCIONES;
