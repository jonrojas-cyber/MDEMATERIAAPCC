const express = require("express");
const store = require("../data-store");
const treasuryMod = require("../treasury");
const treasuryOS = require("../treasury-os");
const financials = require("../financials");
const { soloAdmin } = require("./_guard");

const router = express.Router();

// Resumen de tesorería (liquidez, pendientes, runway, próximos).
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const costeDiario = financials.costeMedioDiario();
  res.json({ ...treasuryMod.resumen(Date.now(), costeDiario), cuentas: store.readAll("financial_accounts") });
});

// Treasury Operating System: dashboard + cash flow + liquidez + valor de empresa +
// obligaciones + monitor de emergencia + forecast. Una sola llamada (admin-only).
router.get("/os", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const localId = (req.user && req.user.local_id) || "principal";
  try {
    res.json({ ...treasuryOS.sistemaOperativo(Date.now(), localId), cuentas: store.readAll("financial_accounts") });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cuentas de dinero (caja / banco) ───────────────────────────────────────
router.post("/cuenta", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) return res.status(400).json({ error: "Indica el nombre de la cuenta." });
  const cuenta = {
    id: store.nextId("acc", "financial_accounts"),
    name, type: b.type === "caja" ? "caja" : "banco",
    balance: Number(b.balance) || 0, notes: String(b.notes || ""), active: true,
    creado_en: new Date().toISOString(),
  };
  store.insert("financial_accounts", cuenta);
  await store.flush();
  res.status(201).json(cuenta);
});

router.put("/cuenta/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("financial_accounts", req.params.id)) return res.status(404).json({ error: "Cuenta no encontrada" });
  const b = req.body || {};
  const patch = {};
  if (b.name != null) patch.name = String(b.name).trim();
  if (b.type != null) patch.type = b.type === "caja" ? "caja" : "banco";
  if (b.balance != null && b.balance !== "") patch.balance = Number(b.balance) || 0;
  if (b.notes != null) patch.notes = String(b.notes);
  if (b.active != null) patch.active = !!b.active;
  const actualizado = store.update("financial_accounts", req.params.id, patch);
  await store.flush();
  res.json(actualizado);
});

router.delete("/cuenta/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("financial_accounts", req.params.id)) return res.status(404).json({ error: "Cuenta no encontrada" });
  store.remove("financial_accounts", req.params.id);
  await store.flush();
  res.json({ ok: true });
});

// ── Movimientos de tesorería (cobros / pagos previstos o hechos) ────────────
router.post("/movimiento", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const b = req.body || {};
  const importe = Number(b.importe) || 0;
  if (!(importe > 0)) return res.status(400).json({ error: "Indica un importe válido." });
  const mov = {
    id: store.nextId("trm", "treasury_movements"),
    tipo: b.tipo === "cobro" ? "cobro" : "pago",
    concepto: String(b.concepto || "").trim(),
    categoria: String(b.categoria || ""),
    importe, fecha: b.fecha ? String(b.fecha) : new Date().toISOString(),
    estado: b.estado === "hecho" ? "hecho" : "previsto",
    creado_en: new Date().toISOString(),
  };
  store.insert("treasury_movements", mov);
  await store.flush();
  res.status(201).json(mov);
});

router.delete("/movimiento/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  if (!store.findById("treasury_movements", req.params.id)) return res.status(404).json({ error: "Movimiento no encontrado" });
  store.remove("treasury_movements", req.params.id);
  await store.flush();
  res.json({ ok: true });
});

module.exports = router;
