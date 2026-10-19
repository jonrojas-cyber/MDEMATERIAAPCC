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
    // movimientos: lista cruda (con id y estado) para operar desde la UI
    // (marcar hecho / borrar). Los previstos primero, por fecha.
    const movimientos = store.readAll("treasury_movements").slice().sort((a, b) => {
      if ((a.estado === "hecho") !== (b.estado === "hecho")) return a.estado === "hecho" ? 1 : -1;
      return String(a.fecha || "").localeCompare(String(b.fecha || ""));
    });
    res.json({ ...treasuryOS.sistemaOperativo(Date.now(), localId), cuentas: store.readAll("financial_accounts"), movimientos });
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
    cuenta_id: b.cuenta_id || null,
    creado_en: new Date().toISOString(),
  };
  store.insert("treasury_movements", mov);
  // Si nace ya "hecho" contra una cuenta, mueve el saldo real (un pago baja la caja/banco).
  if (mov.estado === "hecho" && mov.cuenta_id && store.findById("financial_accounts", mov.cuenta_id)) {
    aplicarAlSaldo(mov, req);
    store.update("treasury_movements", mov.id, { aplicado_al_saldo: true });
    mov.aplicado_al_saldo = true;
  }
  await store.flush();
  res.status(201).json(mov);
});

// Marcar un movimiento PREVISTO como HECHO contra una cuenta → mueve el saldo (idempotente).
router.post("/movimiento/:id/hecho", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const mov = store.findById("treasury_movements", req.params.id);
  if (!mov) return res.status(404).json({ error: "Movimiento no encontrado" });
  if (mov.aplicado_al_saldo) return res.json(mov); // ya movió el saldo: idempotente
  const cuentaId = (req.body && req.body.cuenta_id) || mov.cuenta_id;
  if (!cuentaId || !store.findById("financial_accounts", cuentaId)) return res.status(400).json({ error: "Indica una cuenta válida para mover el saldo." });
  const upd = store.update("treasury_movements", mov.id, { estado: "hecho", cuenta_id: cuentaId, hecho_en: new Date().toISOString(), aplicado_al_saldo: true });
  aplicarAlSaldo(upd, req);
  await store.flush();
  res.json(store.findById("treasury_movements", mov.id));
});

router.delete("/movimiento/:id", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const mov = store.findById("treasury_movements", req.params.id);
  if (!mov) return res.status(404).json({ error: "Movimiento no encontrado" });
  // Si ya había movido el saldo, se revierte (borrar un pago hecho devuelve el dinero a la cuenta).
  if (mov.aplicado_al_saldo && mov.cuenta_id) aplicarAlSaldo({ ...mov, tipo: mov.tipo === "cobro" ? "pago" : "cobro" }, req);
  store.remove("treasury_movements", mov.id);
  await store.flush();
  res.json({ ok: true });
});

// Conciliación bancaria: registra el saldo del EXTRACTO y expone el descuadre con el libro.
// ajustar:true pone el saldo del libro = extracto (para cuadrar), con rastro de auditoría.
router.post("/cuenta/:id/conciliar", async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const cuenta = store.findById("financial_accounts", req.params.id);
  if (!cuenta) return res.status(404).json({ error: "Cuenta no encontrada" });
  const b = req.body || {};
  const saldoExtracto = Number(b.saldo_extracto);
  if (!Number.isFinite(saldoExtracto)) return res.status(400).json({ error: "Indica el saldo del extracto." });
  const descuadre = Math.round(((Number(cuenta.balance) || 0) - saldoExtracto) * 100) / 100;
  const patch = { saldo_extracto: saldoExtracto, conciliado_en: new Date().toISOString() };
  if (b.ajustar === true) patch.balance = saldoExtracto; // cuadrar el libro con el banco
  store.update("financial_accounts", cuenta.id, patch);
  try {
    require("../auditoria").registrar(req, {
      accion: "tesoreria_conciliar", entidad: "financial_accounts", entidad_id: cuenta.id,
      resumen: `Conciliación ${cuenta.name}: extracto ${saldoExtracto} € · descuadre ${descuadre} €${b.ajustar ? " (ajustado al extracto)" : ""}`,
      meta: { saldo_extracto: saldoExtracto, descuadre, ajustado: !!b.ajustar },
    });
  } catch (e) {}
  await store.flush();
  res.json({ ...store.findById("financial_accounts", cuenta.id), descuadre: b.ajustar ? 0 : descuadre });
});

// Aplica un movimiento HECHO al saldo de su cuenta: un cobro lo sube, un pago lo baja.
// Deja rastro de auditoría (trazabilidad del dinero · A.4).
function aplicarAlSaldo(mov, req) {
  const cuenta = store.findById("financial_accounts", mov.cuenta_id);
  if (!cuenta) return;
  const delta = (mov.tipo === "cobro" ? 1 : -1) * (Number(mov.importe) || 0);
  store.update("financial_accounts", cuenta.id, { balance: Math.round(((Number(cuenta.balance) || 0) + delta) * 100) / 100 });
  try {
    require("../auditoria").registrar(req, {
      accion: "tesoreria_saldo", entidad: "financial_accounts", entidad_id: cuenta.id,
      resumen: `${mov.tipo} ${mov.importe} € en ${cuenta.name} (saldo ${delta >= 0 ? "+" : ""}${delta} €)`,
      meta: { mov_id: mov.id, delta },
    });
  } catch (e) {}
}

module.exports = router;
