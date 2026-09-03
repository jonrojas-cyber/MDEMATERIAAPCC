const express = require("express");
const cierreMes = require("../cierre-mes");
const { soloAdmin } = require("./_guard");

const router = express.Router();

// GET /api/cierre-mes?mes=YYYY-MM  → informe completo (macro + micro) del mes.
// Sin ?mes, el mes en curso. Solo admin (dinero/margen).
router.get("/", (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    res.json(cierreMes.informe(req.query.mes || ""));
  } catch (e) {
    res.status(500).json({ error: "No se pudo generar el cierre: " + e.message });
  }
});

// GET /api/cierre-mes/historial → cierres congelados (más recientes primero).
router.get("/historial", (req, res) => {
  if (!soloAdmin(req, res)) return;
  res.json(cierreMes.historial());
});

// POST /api/cierre-mes/cerrar  { mes: "YYYY-MM" } → congela el cierre del mes.
router.post("/cerrar", express.json(), (req, res) => {
  if (!soloAdmin(req, res)) return;
  const mes = (req.body && req.body.mes) || "";
  try {
    const registro = cierreMes.cerrar(mes, Date.now(), req.user);
    require("../auditoria").registrar(req, {
      accion: "cierre_mes",
      entidad: "cierres_mes",
      resumen: `Cierre de ${registro.mes}: ventas ${registro.informe.macro.pyl.ventas} €, EBITDA ${registro.informe.macro.pyl.ebitda} €`,
      meta: { mes: registro.mes },
    });
    res.json(registro);
  } catch (e) {
    res.status(500).json({ error: "No se pudo cerrar el mes: " + e.message });
  }
});

module.exports = router;
