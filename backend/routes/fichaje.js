// FICHAJE · reloj del equipo (tablet fija). Cada persona ficha con su PIN.
// Lectura/fichar: cualquier sesión (la tablet del local). El resumen real-vs-plan
// es solo dirección (lleva comparativa de horas). No expone PINs ni dinero.

const express = require("express");
const store = require("../data-store");
const fichaje = require("../fichaje");
const auth = require("../auth");
const auditoria = require("../auditoria");

const router = express.Router();
function esAdmin(req) { return req.user && req.user.rol === "admin"; }
const hoyYmd = () => new Date().toISOString().slice(0, 10);

// Personas que pueden fichar: cuentas de usuario + quien tenga turno hoy.
function personasFichables(fecha) {
  const us = store.readAll("usuarios").map((u) => ({ key: u.key || u.id, nombre: u.nombre || u.key, rol: u.rol || "equipo" }));
  const nombres = new Set(us.map((u) => (u.nombre || "").toLowerCase()));
  store.readAll("turnos").filter((t) => String(t.fecha).slice(0, 10) === fecha).forEach((t) => {
    if (t.persona && !nombres.has(t.persona.toLowerCase())) { us.push({ key: t.persona, nombre: t.persona, rol: "equipo" }); nombres.add(t.persona.toLowerCase()); }
  });
  return us;
}

// Turno planificado de una persona (por nombre) en una fecha.
function turnoDe(persona, fecha) {
  return store.readAll("turnos").find((t) => String(t.fecha).slice(0, 10) === fecha && String(t.persona || "").toLowerCase() === String(persona || "").toLowerCase()) || null;
}

// ── ESTADO DEL RELOJ (para la tablet) ────────────────────────────────────────
router.get("/", (req, res) => {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.query.fecha) ? req.query.fecha : hoyYmd();
  const now = Date.now();
  const fichajes = store.readAll("fichajes");
  const gente = personasFichables(fecha).map((u) => {
    const evs = fichaje.eventosDe(fichajes, u.nombre, fecha);
    const j = fichaje.jornada(evs, now);
    const turno = turnoDe(u.nombre, fecha);
    return { key: u.key, nombre: u.nombre, rol: u.rol, jornada: j, turno: fichaje.contraTurno(j, turno) };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json({ fecha, servidor_ts: new Date(now).toISOString(), gente, tipos: fichaje.TIPOS });
});

// ── FICHAR (verifica el PIN de la persona) ───────────────────────────────────
router.post("/fichar", express.json(), async (req, res) => {
  const { usuario, pin, tipo } = req.body || {};
  const persona = auth.verificarPin(usuario, pin);
  // 422 (no 401): un PIN de fichaje equivocado NO es una sesión caducada. Con 401
  // el front cerraría la sesión de la tablet y volvería al inicio; con 422 solo
  // avisa en el propio reloj y se puede reintentar.
  if (!persona) return res.status(422).json({ error: "PIN incorrecto. Inténtalo de nuevo." });
  const fecha = hoyYmd();
  const now = Date.now();
  const evs = fichaje.eventosDe(store.readAll("fichajes"), persona.nombre, fecha);
  const j = fichaje.jornada(evs, now);
  // Deriva el tipo si no viene; valida la transición.
  const permitidos = j.permitidos;
  const t = tipo && fichaje.TIPOS.includes(tipo) ? tipo : (permitidos[0] || null);
  if (!t) return res.status(409).json({ error: "No hay acción posible ahora.", estado: j.estado });
  if (!permitidos.includes(t)) return res.status(409).json({ error: `No puedes fichar "${t}" estando "${j.estado}".`, estado: j.estado, permitidos });
  const row = {
    id: store.nextId("fic", "fichajes"),
    persona: persona.nombre, key: persona.key, fecha, tipo: t,
    ts: new Date(now).toISOString(), local_id: persona.local_id || "principal",
    origen: (req.user && req.user.nombre) ? `tablet:${req.user.nombre}` : "tablet",
  };
  store.insert("fichajes", row);
  auditoria.registrar(req, { accion: "fichaje", entidad: "fichajes", entidad_id: row.id, resumen: `${persona.nombre} · ${t} · ${row.ts.slice(11, 16)}` });
  await store.flush();
  const j2 = fichaje.jornada(fichaje.eventosDe(store.readAll("fichajes"), persona.nombre, fecha), Date.now());
  res.status(201).json({ ok: true, persona: persona.nombre, tipo: t, hora: row.ts.slice(11, 16), jornada: j2, turno: fichaje.contraTurno(j2, turnoDe(persona.nombre, fecha)) });
});

// ── RESUMEN real vs plan (solo admin) ────────────────────────────────────────
router.get("/resumen", (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo dirección ve el resumen de horas." });
  const hasta = /^\d{4}-\d{2}-\d{2}$/.test(req.query.hasta) ? req.query.hasta : hoyYmd();
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(req.query.desde) ? req.query.desde : new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  res.json({ desde, hasta, resumen: fichaje.resumen(store.readAll("fichajes"), store.readAll("turnos"), desde, hasta) });
});

module.exports = router;
