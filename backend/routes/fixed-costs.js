const express = require("express");
const store = require("../data-store");
const fixedCosts = require("../fixed-costs");
const { soloAdmin } = require("./_guard");

const router = express.Router();

const CATEGORIAS = [
  "Alquiler", "Personal", "Luz", "Agua", "Gas", "Internet", "Teléfono", "Gestoría",
  "Software", "Seguros", "Autónomos", "Seguridad Social", "Prevención", "Control de plagas",
  "Limpieza", "Alarma", "TPV", "Comisiones bancarias", "Renting", "Leasing", "Créditos",
  "Mantenimiento", "Marketing", "Otros",
];

function camposDe(body) {
  const c = {};
  if (body.name != null) c.name = String(body.name).trim();
  if (body.category != null) c.category = String(body.category).trim();
  if (body.amount != null && body.amount !== "") c.amount = Number(body.amount) || 0;
  if (body.vat != null && body.vat !== "") c.vat = Number(body.vat) || 0;
  if (body.periodicity != null) c.periodicity = fixedCosts.PERIODICIDADES.includes(body.periodicity) ? body.periodicity : "monthly";
  if (body.start_date != null) c.start_date = String(body.start_date) || null;
  if (body.end_date != null) c.end_date = body.end_date ? String(body.end_date) : null;
  if (body.payment_day != null && body.payment_day !== "") c.payment_day = Number(body.payment_day) || null;
  if (body.provider != null) c.provider = String(body.provider);
  if (body.payment_method != null) c.payment_method = String(body.payment_method);
  if (body.bank_account != null) c.bank_account = String(body.bank_account);
  if (body.is_direct_debit != null) c.is_direct_debit = !!body.is_direct_debit;
  if (body.notes != null) c.notes = String(body.notes);
  if (body.active != null) c.active = !!body.active;
  return c;
}

router.get("/meta", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json({ categorias: CATEGORIAS, periodicidades: fixedCosts.PERIODICIDADES });
});

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const lista = store.readAll("fixed_costs").map((f) => ({ ...f, prorrateo: fixedCosts.prorrateo(f) }));
  res.json({ costes: lista, totales: fixedCosts.totales(), por_categoria: fixedCosts.porCategoria() });
});

router.post("/", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const d = camposDe(req.body || {});
  if (!d.name) return res.status(400).json({ error: "Indica el nombre del coste." });
  const coste = {
    id: store.nextId("fc", "fixed_costs"),
    name: d.name, category: d.category || "Otros", amount: d.amount || 0, vat: d.vat || 0,
    periodicity: d.periodicity || "monthly", start_date: d.start_date || new Date().toISOString().slice(0, 10),
    end_date: d.end_date || null, payment_day: d.payment_day || null, provider: d.provider || "",
    payment_method: d.payment_method || "", bank_account: d.bank_account || "",
    is_direct_debit: d.is_direct_debit || false, notes: d.notes || "", active: d.active !== false,
    creado_en: new Date().toISOString(),
  };
  store.insert("fixed_costs", coste);
  await store.flush();
  res.status(201).json({ ...coste, prorrateo: fixedCosts.prorrateo(coste) });
});

router.put("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("fixed_costs", req.params.id)) return res.status(404).json({ error: "Coste no encontrado" });
  const actualizado = store.update("fixed_costs", req.params.id, camposDe(req.body || {}));
  await store.flush();
  res.json({ ...actualizado, prorrateo: fixedCosts.prorrateo(actualizado) });
});

router.delete("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("fixed_costs", req.params.id)) return res.status(404).json({ error: "Coste no encontrado" });
  store.remove("fixed_costs", req.params.id);
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
