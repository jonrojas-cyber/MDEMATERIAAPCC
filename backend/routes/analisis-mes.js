const express = require("express");
const store = require("../data-store");
const am = require("../analisis-mes");
const cr = require("../cuenta-resultados");

const router = express.Router();

function soloAdmin(req, res) {
  if (!req.user || req.user.rol !== "admin") { res.status(403).json({ error: "Solo un administrador puede ver el análisis del mes." }); return false; }
  return true;
}

// GET /api/analisis-mes?mes=YYYY-MM — snapshot + P&L del mes + punto de equilibrio.
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  const meses = am.listarMeses();
  const mes = req.query.mes || meses[0] || new Date().toISOString().slice(0, 7);
  const snap = am.obtener(mes);
  let pl = null;
  try { pl = cr.calcular({}, new Date(mes + "-15T12:00:00Z")); } catch (e) { pl = null; }
  res.json({ mes, meses, snapshot: snap, cuenta: pl });
});

// POST /api/analisis-mes/importar  (texto CSV del export "Análisis de Ventas")
// Body: CSV plano (text/plain o text/csv). Opcional ?mes=YYYY-MM para forzarlo.
router.post("/importar", express.raw({ type: ["text/*", "application/csv", "application/octet-stream", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"], limit: "25mb" }), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    // req.body es un Buffer: parseExportBuffer detecta xlsx (ZIP) o CSV.
    const snap = am.parseExportBuffer(req.body || Buffer.alloc(0), req.query.mes);
    am.guardar(snap);
    // Además fija el cierre de ventas netas del mes para la Cuenta de Resultados.
    const id = `ventas_mes_${snap.mes}`;
    if (store.findById("config", id)) store.update("config", id, { valor: snap.neto });
    else store.insert("config", { id, valor: snap.neto });
    try {
      require("../auditoria").registrar(req, {
        accion: "analisis_mes_import", entidad: "analisis_mes", entidad_id: snap.id,
        resumen: `Análisis del mes ${snap.mes}: ${snap.neto} € netos, ${snap.tickets} tickets`,
        meta: { mes: snap.mes, neto: snap.neto, tickets: snap.tickets },
      });
    } catch (e) {}
    // Además del snapshot (agregados), se vuelca el CONSUMO por producto: cada
    // ticket del export descuenta stock según su escandallo. Así el mismo archivo
    // cruza ventas con compras y cuadra el almacén. No bloquea la respuesta si falla.
    //
    // REEMPLAZO POR MES: antes de volcar, se BORRAN las ventas y los docs de Ágora
    // de los meses que trae el fichero. Así re-importar SUSTITUYE (no acumula): se
    // eliminan duplicados de importaciones anteriores (por otro método) y las
    // ventas se reconstruyen limpias y con el neto. Idempotente por reconstrucción.
    let consumo = null;
    try {
      const ve = require("../ventas-export");
      const docs = ve.parseDocs(ve.aFilas(req.body || Buffer.alloc(0)));
      const meses = new Set(docs.map((d) => String(d.Date || "").slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)));
      if (meses.size) {
        const enMes = (f) => meses.has(String(f || "").slice(0, 7));
        store.writeAll("ventas", (store.readAll("ventas") || []).filter((v) => !enMes(v.fecha)));
        // Los docs_agora se guardan por ticket; se limpian los de esos meses para
        // que importarDocs los reprocese (si no, la idempotencia los saltaría).
        store.writeAll("docs_agora", (store.readAll("docs_agora") || []).filter((d) => !enMes(d.fecha)));
      }
      consumo = ve.importar(req.body || Buffer.alloc(0));
    } catch (e) { consumo = { error: e.message }; }
    await store.flush();
    res.json({ ok: true, snapshot: snap, consumo });
  } catch (e) {
    res.status(400).json({ error: e.message || "No se pudo importar el fichero." });
  }
});

// POST /api/analisis-mes/desde-ventas?mes=YYYY-MM — recalcula desde el conector.
router.post("/desde-ventas", express.json(), async (req, res) => {
  if (!soloAdmin(req, res)) return;
  const mes = (req.query.mes || (req.body && req.body.mes) || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(mes)) return res.status(400).json({ error: "Indica el mes YYYY-MM." });
  const snap = am.agregarDesdeVentas(mes);
  am.guardar(snap);
  await store.flush();
  res.json({ ok: true, snapshot: snap });
});

module.exports = router;
