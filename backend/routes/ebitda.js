const express = require("express");
const router = express.Router();

// EBITDA en vivo (solo admin). Reutiliza financials.beneficio() — la misma cuenta
// de resultados que ya alimenta el Centro de Control — y la contribución de la
// carta del break-even. EBITDA = ventas − coste de producto − variables − fijos
// − laboral (SIN intereses de préstamos: esos van por debajo del EBITDA).
router.get("/", (req, res) => {
  if (req.user && req.user.rol !== "admin") return res.status(403).json({ error: "Solo admin puede ver el EBITDA." });
  try {
    const financials = require("../financials");
    const periods = require("../periods");
    const be = require("../break-even");
    const now = Date.now();
    const mes = financials.beneficio(periods.rango("mes", now), now);
    const anio = financials.beneficio(periods.rango("anio", now), now);
    const contrib = be.contribucion();
    const cuota = require("../debts").resumen(now).cuota_mensual_total || 0;
    const extras = financials.extrasFinancieros(now);
    const pe = be.puntoEquilibrio(now, { contribucion: contrib });
    res.json({
      contribucion_pct: contrib.ratio_contribucion_pct,
      fijos_operativos_mes: extras.monthly_burn,          // fijos + laboral (sin materia ni deuda)
      cuota_creditos_mes: Math.round(cuota * 100) / 100,
      equilibrio_mes: pe.ingreso_equilibrio_mes,
      equilibrio_con_creditos_mes: pe.ingreso_equilibrio_con_creditos_mes,
      mes: {
        ventas: mes.ventas, coste_producto: mes.coste_materia, coste_laboral: mes.coste_laboral,
        gastos_fijos: mes.gastos_fijos, gastos_variables: mes.gastos_variables,
        ebitda: mes.beneficio_operativo, margen_pct: mes.margen_operativo_pct,
      },
      anio: { ventas: anio.ventas, ebitda: anio.beneficio_operativo, margen_pct: anio.margen_operativo_pct },
      sin_ventas: (mes.ventas || 0) <= 0 && (anio.ventas || 0) <= 0,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
