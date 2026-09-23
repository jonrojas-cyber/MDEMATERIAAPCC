// HUB DE EQUIPO · una sola pantalla que une el sistema de operaciones:
// quién está fichado AHORA, turnos de HOY, ausencias, tablón e incidencias.
// Componer, no recalcular: reutiliza fichaje, turnos, ausencias, tablón, incidencias.

const express = require("express");
const store = require("../data-store");
const fichaje = require("../fichaje");
const turnos = require("../turnos");
const ausenciasR = require("./ausencias");
const tablonR = require("./tablon");
const incidenciasR = require("./incidencias");

const router = express.Router();

router.get("/hub", (req, res) => {
  const now = Date.now();
  const hoy = new Date().toISOString().slice(0, 10);
  const esAdmin = req.user && req.user.rol === "admin";

  // AHORA: personas con jornada abierta hoy (trabajando / en pausa).
  const fichajes = store.readAll("fichajes");
  const personas = [...new Set(fichajes.filter((f) => String(f.fecha).slice(0, 10) === hoy).map((f) => f.persona))];
  const ahora = personas.map((p) => {
    const j = fichaje.jornada(fichaje.eventosDe(fichajes, p, hoy), now);
    return { nombre: p, estado: j.estado, entrada_hm: j.entrada_hm, horas: j.horas_trabajadas };
  }).filter((x) => x.estado !== "fuera").sort((a, b) => a.nombre.localeCompare(b.nombre));

  // HOY: turnos planificados de hoy.
  const hoyTurnos = store.readAll("turnos")
    .filter((t) => String(t.fecha).slice(0, 10) === hoy)
    .map((t) => ({ persona: t.persona, inicio: t.inicio, fin: t.fin, funcion: t.funcion }))
    .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));

  // AUSENCIAS: activas hoy + pendientes de aprobar.
  const aus = store.readAll("ausencias");
  const ausenciasHoy = aus.filter((a) => ausenciasR.activaEn(a, hoy)).map((a) => ({ persona: a.persona, tipo: a.tipo, hasta: a.hasta }));
  const ausenciasPendientes = aus.filter((a) => a.estado === "pendiente")
    .map((a) => ({ id: a.id, persona: a.persona, tipo: a.tipo, desde: a.desde, hasta: a.hasta, dias: ausenciasR.dias(a.desde, a.hasta) }));

  // TABLÓN: últimos avisos.
  const avisos = tablonR.orden(store.readAll("tablon")).slice(0, 4);

  // INCIDENCIAS abiertas.
  const incAll = incidenciasR.orden(store.readAll("incidencias"));
  const incidenciasAbiertas = incAll.filter((i) => i.estado === "abierta");

  res.json({
    fecha: hoy,
    puede_editar: !!esAdmin,
    ahora,
    turnos_hoy: hoyTurnos,
    ausencias_hoy: ausenciasHoy,
    ausencias_pendientes: ausenciasPendientes,
    avisos,
    incidencias_abiertas: incidenciasAbiertas.slice(0, 4),
    incidencias_abiertas_total: incidenciasAbiertas.length,
  });
});

module.exports = router;
