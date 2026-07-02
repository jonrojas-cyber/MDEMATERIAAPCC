const express = require("express");
const store = require("../data-store");
const assetsMod = require("../assets");
const { soloAdmin } = require("./_guard");

const router = express.Router();

function camposDe(body) {
  const c = {};
  if (body.name != null) c.name = String(body.name).trim();
  if (body.category != null) c.category = String(body.category).trim();
  if (body.purchase_date != null) c.purchase_date = body.purchase_date ? String(body.purchase_date) : null;
  if (body.purchase_price != null && body.purchase_price !== "") c.purchase_price = Number(body.purchase_price) || 0;
  if (body.current_value != null && body.current_value !== "") c.current_value = Number(body.current_value) || 0;
  if (body.depreciation_method != null) c.depreciation_method = String(body.depreciation_method);
  if (body.useful_life_years != null && body.useful_life_years !== "") c.useful_life_years = Number(body.useful_life_years) || 0;
  if (body.warranty_end_date != null) c.warranty_end_date = body.warranty_end_date ? String(body.warranty_end_date) : null;
  if (body.provider != null) c.provider = String(body.provider);
  if (body.maintenance_frequency != null) c.maintenance_frequency = String(body.maintenance_frequency);
  if (body.critical != null) c.critical = !!body.critical;
  if (body.notes != null) c.notes = String(body.notes);
  if (body.active != null) c.active = !!body.active;
  return c;
}

router.get("/meta", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json({ categorias: assetsMod.CATEGORIAS });
});

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json(assetsMod.resumen());
});

router.post("/", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const d = camposDe(req.body || {});
  if (!d.name) return res.status(400).json({ error: "Indica el nombre del activo." });
  const activo = {
    id: store.nextId("ast", "assets"),
    name: d.name, category: d.category || "Otros", purchase_date: d.purchase_date || null,
    purchase_price: d.purchase_price || 0, current_value: d.current_value != null ? d.current_value : null,
    depreciation_method: d.depreciation_method || "", useful_life_years: d.useful_life_years || 0,
    warranty_end_date: d.warranty_end_date || null, provider: d.provider || "",
    maintenance_frequency: d.maintenance_frequency || "", critical: d.critical || false,
    notes: d.notes || "", active: d.active !== false, creado_en: new Date().toISOString(),
  };
  store.insert("assets", activo);
  await store.flush();
  res.status(201).json(assetsMod.decorar(activo));
});

router.put("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("assets", req.params.id)) return res.status(404).json({ error: "Activo no encontrado" });
  const actualizado = store.update("assets", req.params.id, camposDe(req.body || {}));
  await store.flush();
  res.json(assetsMod.decorar(actualizado));
});

router.delete("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("assets", req.params.id)) return res.status(404).json({ error: "Activo no encontrado" });
  store.remove("assets", req.params.id);
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
