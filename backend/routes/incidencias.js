// INCIDENCIAS · partes del equipo (avería, falta de stock, algo roto…). El equipo
// las abre; dirección las ve y las resuelve.

const express = require("express");
const store = require("../data-store");
const auditoria = require("../auditoria");

const router = express.Router();
const jsonGrande = express.json({ limit: "12mb" }); // por si adjunta foto en base64
const esAdmin = (req) => req.user && req.user.rol === "admin";
const CATEGORIAS = ["avería", "stock", "limpieza", "equipo", "cliente", "otro"];
const PRIORIDADES = ["baja", "media", "alta"];

function orden(items) {
  const rank = { abierta: 0, resuelta: 1 };
  const pr = { alta: 0, media: 1, baja: 2 };
  return items.slice().sort((a, b) =>
    (rank[a.estado] ?? 0) - (rank[b.estado] ?? 0) ||
    (pr[a.prioridad] ?? 1) - (pr[b.prioridad] ?? 1) ||
    String(b.fecha || "").localeCompare(String(a.fecha || "")));
}

router.get("/", (req, res) => {
  const items = orden(store.readAll("incidencias"));
  res.json({
    incidencias: items,
    abiertas: items.filter((i) => i.estado === "abierta").length,
    categorias: CATEGORIAS, prioridades: PRIORIDADES,
    puede_resolver: esAdmin(req),
  });
});

router.post("/", jsonGrande, async (req, res) => {
  const b = req.body || {};
  const titulo = String(b.titulo || "").trim().slice(0, 120);
  if (!titulo) return res.status(400).json({ error: "Escribe qué pasa (título)." });
  const row = {
    id: store.nextId("inc", "incidencias"),
    titulo,
    descripcion: String(b.descripcion || "").trim().slice(0, 2000),
    categoria: CATEGORIAS.includes(b.categoria) ? b.categoria : "otro",
    prioridad: PRIORIDADES.includes(b.prioridad) ? b.prioridad : "media",
    persona: (req.user && req.user.nombre) || String(b.persona || "").slice(0, 40) || "—",
    estado: "abierta", foto: b.foto ? String(b.foto).slice(0, 8_000_000) : null,
    fecha: new Date().toISOString(),
  };
  store.insert("incidencias", row);
  auditoria.registrar(req, { accion: "incidencia_crear", entidad: "incidencias", entidad_id: row.id, resumen: `${row.categoria} · ${titulo}` });
  await store.flush();
  res.status(201).json(row);
});

async function cambiarEstado(req, res, estado) {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo dirección resuelve incidencias." });
  const i = store.findById("incidencias", req.params.id);
  if (!i) return res.status(404).json({ error: "Incidencia no encontrada." });
  const patch = { estado };
  if (estado === "resuelta") { patch.resuelto_por = req.user.nombre; patch.resuelto_en = new Date().toISOString(); }
  const upd = store.update("incidencias", i.id, patch);
  auditoria.registrar(req, { accion: "incidencia_" + estado, entidad: "incidencias", entidad_id: i.id, resumen: `${i.titulo} · ${estado}` });
  await store.flush();
  res.json(upd);
}
router.post("/:id/resolver", (req, res) => cambiarEstado(req, res, "resuelta"));
router.post("/:id/reabrir", (req, res) => cambiarEstado(req, res, "abierta"));

router.delete("/:id", async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo dirección borra incidencias." });
  const i = store.findById("incidencias", req.params.id);
  if (!i) return res.status(404).json({ error: "Incidencia no encontrada." });
  store.remove("incidencias", i.id);
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
module.exports.orden = orden;
module.exports.CATEGORIAS = CATEGORIAS;
