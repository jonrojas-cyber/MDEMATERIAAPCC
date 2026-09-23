// TURNOS · cuadrante del equipo. Lectura para el equipo (ven su horario, sin
// dinero); alta/edición/baja solo dirección (admin).

const express = require("express");
const store = require("../data-store");
const turnos = require("../turnos");
const auditoria = require("../auditoria");

const router = express.Router();

function esAdmin(req) { return req.user && req.user.rol === "admin"; }
function soloAdmin(req, res) { if (!esAdmin(req)) { res.status(403).json({ error: "Solo dirección puede editar los turnos." }); return false; } return true; }

const FUNCIONES = ["Barra / Café", "Cocina", "Sala", "Caja", "Apertura", "Cierre", "Limpieza", "Brunch", "Office"];

function limpiar(b) {
  return {
    persona: String(b.persona || "").trim().slice(0, 40),
    dia: Math.min(7, Math.max(1, Number(b.dia) || 1)),
    inicio: String(b.inicio || "").trim().slice(0, 5),
    fin: String(b.fin || "").trim().slice(0, 5),
    funcion: String(b.funcion || "").trim().slice(0, 40),
    local_id: String(b.local_id || "principal").trim().slice(0, 20),
    notas: String(b.notas || "").trim().slice(0, 200),
  };
}

// ── LISTADO + CUADRANTE + RESUMEN (cualquier usuario con sesión) ─────────────
router.get("/", (req, res) => {
  const lista = store.readAll("turnos").slice().sort((a, b) => (a.dia - b.dia) || String(a.inicio).localeCompare(String(b.inicio)));
  res.json({
    turnos: lista,
    cuadrante: turnos.cuadrante(lista),
    resumen: turnos.resumenPorPersona(lista),
    solapes: turnos.solapesDe(lista),
    dias: turnos.DIAS,
    funciones: FUNCIONES,
    puede_editar: esAdmin(req),
  });
});

// ── CREAR (admin) ────────────────────────────────────────────────────────────
router.post("/", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const t = limpiar(req.body || {});
  if (!t.persona) return res.status(400).json({ error: "Falta la persona." });
  if (turnos.aMin(t.inicio) == null || turnos.aMin(t.fin) == null) return res.status(400).json({ error: "Horario no válido (usa HH:MM)." });
  const row = { id: store.nextId("tur", "turnos"), ...t, creado_en: new Date().toISOString() };
  store.insert("turnos", row);
  auditoria.registrar(req, { accion: "turno_crear", entidad: "turnos", entidad_id: row.id, resumen: `${t.persona} · ${turnos.DIAS[t.dia - 1]} ${t.inicio}-${t.fin} · ${t.funcion || "sin función"}` });
  await store.flush();
  res.status(201).json(row);
});

// ── EDITAR (admin) ───────────────────────────────────────────────────────────
router.put("/:id", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const ex = store.findById("turnos", req.params.id);
  if (!ex) return res.status(404).json({ error: "Turno no encontrado." });
  const t = limpiar({ ...ex, ...req.body });
  if (turnos.aMin(t.inicio) == null || turnos.aMin(t.fin) == null) return res.status(400).json({ error: "Horario no válido (usa HH:MM)." });
  const row = store.update("turnos", req.params.id, t);
  auditoria.registrar(req, { accion: "turno_editar", entidad: "turnos", entidad_id: req.params.id, resumen: `${t.persona} · ${turnos.DIAS[t.dia - 1]} ${t.inicio}-${t.fin}` });
  await store.flush();
  res.json(row);
});

// ── BORRAR (admin) ───────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const ex = store.findById("turnos", req.params.id);
  if (!ex) return res.status(404).json({ error: "Turno no encontrado." });
  store.remove("turnos", req.params.id);
  auditoria.registrar(req, { accion: "turno_borrar", entidad: "turnos", entidad_id: req.params.id, resumen: `${ex.persona} · turno eliminado` });
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
module.exports.FUNCIONES = FUNCIONES;
