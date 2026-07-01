const express = require("express");
const store = require("../data-store");

const router = express.Router();

// Recetario de café: la receta de calibración de cada café (dosis, molienda,
// tiempo de extracción, salida). Lo usa la rutina de apertura para calibrar.

router.get("/", (req, res) => {
  const items = store.readAll("recetario_cafe").filter((c) => c.activo !== false);
  res.json(items);
});

function soloAdmin(req, res) {
  if (!req.user || req.user.rol !== "admin") {
    res.status(403).json({ error: "Solo un administrador puede editar el recetario de café." });
    return false;
  }
  return true;
}

const CAMPOS = ["nombre", "origen", "lado", "molienda", "temperatura", "notas"];
const NUM = ["tiempo_extraccion_seg", "dosis_g", "salida_g"];
function campos(body) {
  const c = {};
  CAMPOS.forEach((k) => { if (body[k] != null) c[k] = String(body[k]).trim(); });
  NUM.forEach((k) => { if (body[k] != null && body[k] !== "") { const n = Number(String(body[k]).replace(",", ".")); if (Number.isFinite(n)) c[k] = n; } });
  if (body.activo != null) c.activo = !!body.activo;
  return c;
}

router.post("/", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const c = campos(req.body || {});
  if (!c.nombre) return res.status(400).json({ error: "Indica el nombre del café." });
  const item = { id: store.nextId("cafe", "recetario_cafe"), activo: true, ...c, creado_en: new Date().toISOString() };
  store.insert("recetario_cafe", item);
  await store.flush();
  res.status(201).json(item);
});

router.put("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("recetario_cafe", req.params.id)) return res.status(404).json({ error: "Café no encontrado" });
  const actualizado = store.update("recetario_cafe", req.params.id, campos(req.body || {}));
  await store.flush();
  res.json(actualizado);
});

router.delete("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("recetario_cafe", req.params.id)) return res.status(404).json({ error: "Café no encontrado" });
  store.update("recetario_cafe", req.params.id, { activo: false });
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
