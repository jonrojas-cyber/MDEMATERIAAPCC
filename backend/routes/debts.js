const express = require("express");
const store = require("../data-store");
const debtsMod = require("../debts");
const debtOS = require("../debt-os");
const debtSimulation = require("../debt-simulation");
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
  // PRD 006: ficha completa del instrumento de financiación.
  if (body.interest_type != null) c.interest_type = body.interest_type === "variable" ? "variable" : "fixed";
  if (body.amortization_system != null) c.amortization_system = debtsMod.SISTEMAS.includes(body.amortization_system) ? body.amortization_system : "french";
  if (body.payment_frequency != null) c.payment_frequency = String(body.payment_frequency);
  if (body.institution != null) c.institution = String(body.institution);
  if (body.collateral != null) c.collateral = String(body.collateral);
  return c;
}

router.get("/meta", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json({
    tipos: debtsMod.TIPOS.map((t) => ({ value: t, label: debtsMod.TIPO_LABEL[t] })),
    sistemas: debtsMod.SISTEMAS.map((s) => ({ value: s, label: debtsMod.SISTEMA_LABEL[s] })),
  });
});

// Debt & Financing Operating System: dashboard, ratios, capacidad, forecast,
// analítica IA, distribución y calendario. Una sola llamada (admin-only).
router.get("/os", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const localId = (req.user && req.user.local_id) || "principal";
  try {
    res.json(debtOS.sistemaOperativo(Date.now(), localId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cuadro de amortización de una deuda concreta.
router.get("/:id/amortizacion", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const d = store.findById("debts", req.params.id);
  if (!d) return res.status(404).json({ error: "Deuda no encontrada" });
  const opts = {};
  if (req.query.sistema) opts.sistema = String(req.query.sistema);
  res.json(debtsMod.amortizacion(d, Date.now(), opts));
});

// Simulador: amortizar hoy / en N meses / subir cuota / refinanciar / consolidar.
router.post("/simular", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    res.json(debtSimulation.simular(req.body || {}));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
    interest_type: d.interest_type || "fixed", amortization_system: d.amortization_system || "french",
    payment_frequency: d.payment_frequency || "monthly", institution: d.institution || "", collateral: d.collateral || "",
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
