const express = require("express");
const store = require("../data-store");
const debtsMod = require("../debts");
const { soloAdmin } = require("./_guard");

const router = express.Router();

function camposDe(body) {
  const c = {};
  if (body.name != null) c.name = String(body.name).trim();
  if (body.lender != null) c.lender = String(body.lender).trim();
  if (body.type != null) c.type = debtsMod.TIPOS.includes(body.type) ? body.type : "loan";
  if (body.initial_amount != null && body.initial_amount !== "") c.initial_amount = Number(body.initial_amount) || 0;
  if (body.outstanding_amount != null && body.outstanding_amount !== "") c.outstanding_amount = Number(body.outstanding_amount) || 0;
  if (body.interest_rate != null && body.interest_rate !== "") c.interest_rate = Number(body.interest_rate) || 0;
  if (body.monthly_payment != null && body.monthly_payment !== "") c.monthly_payment = Number(body.monthly_payment) || 0;
  if (body.start_date != null) c.start_date = body.start_date ? String(body.start_date) : null;
  if (body.end_date != null) c.end_date = body.end_date ? String(body.end_date) : null;
  if (body.payment_day != null && body.payment_day !== "") c.payment_day = Number(body.payment_day) || null;
  if (body.status != null) c.status = String(body.status);
  if (body.notes != null) c.notes = String(body.notes);
  return c;
}

router.get("/meta", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json({ tipos: debtsMod.TIPOS.map((t) => ({ value: t, label: debtsMod.TIPO_LABEL[t] })) });
});

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const resumen = debtsMod.resumen();
  // Incluimos también las inactivas (pagadas) para el histórico.
  const todas = store.readAll("debts").map((d) => debtsMod.decorar(d));
  res.json({ ...resumen, todas });
});

router.post("/", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const d = camposDe(req.body || {});
  if (!d.name) return res.status(400).json({ error: "Indica el nombre de la deuda." });
  const deuda = {
    id: store.nextId("debt", "debts"),
    name: d.name, lender: d.lender || "", type: d.type || "loan",
    initial_amount: d.initial_amount || 0, outstanding_amount: d.outstanding_amount != null ? d.outstanding_amount : (d.initial_amount || 0),
    interest_rate: d.interest_rate || 0, monthly_payment: d.monthly_payment || 0,
    start_date: d.start_date || new Date().toISOString().slice(0, 10), end_date: d.end_date || null,
    payment_day: d.payment_day || null, status: d.status || "activa", notes: d.notes || "",
    creado_en: new Date().toISOString(),
  };
  store.insert("debts", deuda);
  await store.flush();
  res.status(201).json(debtsMod.decorar(deuda));
});

router.put("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("debts", req.params.id)) return res.status(404).json({ error: "Deuda no encontrada" });
  const actualizado = store.update("debts", req.params.id, camposDe(req.body || {}));
  await store.flush();
  res.json(debtsMod.decorar(actualizado));
});

router.delete("/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("debts", req.params.id)) return res.status(404).json({ error: "Deuda no encontrada" });
  store.remove("debts", req.params.id);
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
