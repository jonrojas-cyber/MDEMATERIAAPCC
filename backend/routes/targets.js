const express = require("express");
const store = require("../data-store");
const targetsMod = require("../targets");
const executive = require("../executive-dashboard");
const { soloAdmin } = require("./_guard");

const router = express.Router();

function camposDe(body) {
  const c = {};
  if (body.tipo != null) c.tipo = targetsMod.TIPOS.includes(body.tipo) ? body.tipo : "ventas";
  if (body.label != null) c.label = String(body.label).trim();
  if (body.periodo != null) c.periodo = String(body.periodo);
  if (body.valor != null && body.valor !== "") c.valor = Number(body.valor) || 0;
  if (body.unidad != null) c.unidad = String(body.unidad);
  if (body.activo != null) c.activo = !!body.activo;
  return c;
}

router.get("/meta", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json({ tipos: targetsMod.TIPOS, menor_mejor: [...targetsMod.MENOR_MEJOR] });
});

// Devuelve objetivos evaluados contra sus valores reales.
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const actuales = executive.actualesObjetivos(Date.now());
    res.json({ objetivos: targetsMod.evaluar(actuales), crudos: store.readAll("business_targets") });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const d = camposDe(req.body || {});
  if (!d.tipo) return res.status(400).json({ error: "Indica el tipo de objetivo." });
  const objetivo = {
    id: store.nextId("tgt", "business_targets"),
    tipo: d.tipo, label: d.label || d.tipo, periodo: d.periodo || "mes",
    valor: d.valor || 0, unidad: d.unidad || "eur", activo: d.activo !== false,
    creado_en: new Date().toISOString(),
  };
  store.insert("business_targets", objetivo);
  await store.flush();
  res.status(201).json(objetivo);
});

router.put("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("business_targets", req.params.id)) return res.status(404).json({ error: "Objetivo no encontrado" });
  const actualizado = store.update("business_targets", req.params.id, camposDe(req.body || {}));
  await store.flush();
  res.json(actualizado);
});

router.delete("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("business_targets", req.params.id)) return res.status(404).json({ error: "Objetivo no encontrado" });
  store.remove("business_targets", req.params.id);
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
