const express = require("express");
const store = require("../data-store");
const { soloAdmin } = require("./_guard");

const router = express.Router();

// Configuración FISCAL del negocio: régimen (autónoma/sociedad) y tipo de impuesto
// sobre el beneficio (IRPF efectivo si autónoma, Impuesto de Sociedades si SL). Es la
// pieza que faltaba: el motor ya LEÍA config.impuesto_beneficio_pct (por defecto 15%),
// pero no había forma de cambiarlo desde la app → quedaba clavado en 15%. Admin-only.

function leerPct() {
  const c = store.findById("config", "impuesto_beneficio_pct");
  const v = c ? Number(c.valor) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : 15;
}
function leerRegimen() {
  const c = store.findById("config", "regimen_fiscal");
  return c && c.valor === "sociedad" ? "sociedad" : "autonoma";
}
function upsert(id, valor) {
  if (store.findById("config", id)) store.update("config", id, { valor });
  else store.insert("config", { id, valor });
}

router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json({ impuesto_pct: leerPct(), regimen: leerRegimen() });
});

router.put("/", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const b = req.body || {};
  if (b.impuesto_pct != null && b.impuesto_pct !== "") {
    const v = Number(b.impuesto_pct);
    if (!Number.isFinite(v) || v < 0 || v > 60) return res.status(400).json({ error: "Indica un porcentaje de impuesto entre 0 y 60." });
    upsert("impuesto_beneficio_pct", Math.round(v * 100) / 100);
  }
  if (b.regimen != null) upsert("regimen_fiscal", String(b.regimen) === "sociedad" ? "sociedad" : "autonoma");
  await store.flush();
  try {
    require("../auditoria").registrar(req, {
      accion: "config_fiscal", entidad: "config",
      resumen: `Fiscal: impuesto ${leerPct()}% · régimen ${leerRegimen()}`,
      meta: { impuesto_pct: leerPct(), regimen: leerRegimen() },
    });
  } catch (e) {}
  res.json({ impuesto_pct: leerPct(), regimen: leerRegimen() });
});

module.exports = router;
