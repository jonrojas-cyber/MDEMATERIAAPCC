// MÁQUINA DEL TIEMPO · "¿cómo estaba mi empresa?" en una fecha pasada.
// Reconstruye el estado disponible a partir del histórico real. Donde el dato
// exacto no existe (p. ej. no guardábamos foto de stock a diario), devuelve la
// mejor estimación y lo marca internamente como estimado — sin exponer al usuario
// incertidumbre técnica innecesaria.

const store = require("./data-store");
const financials = require("./financials");
const fixedCosts = require("./fixed-costs");
const debtsMod = require("./debts");
const assetsMod = require("./assets");
const staff = require("./staff-finance");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function antesDe(fecha, t) { const x = new Date(fecha).getTime(); return Number.isFinite(x) && x <= t; }

function reconstruir(fechaStr, now = Date.now()) {
  const t = new Date(fechaStr).getTime();
  if (!Number.isFinite(t)) return { error: "Fecha no válida" };
  const hastaHoy = { desde: new Date(new Date(t).getFullYear(), 0, 1).getTime(), hasta: t };
  const rangoDesdeCero = { desde: 0, hasta: t };

  // Ventas acumuladas hasta la fecha (año en curso a esa fecha).
  const ventasAnio = eur(financials.ventasEnRango(hastaHoy));
  const ventasTotales = eur(financials.ventasEnRango(rangoDesdeCero));

  // Snapshot de stock: si existe una foto guardada <= fecha, se usa; si no, se
  // estima con el valor de stock actual (marcado como estimación).
  const snap = store.readAll("financial_snapshots")
    .filter((s) => s.fecha && new Date(s.fecha).getTime() <= t)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
  const valorAlmacen = snap && snap.valor_almacen != null ? { valor: eur(snap.valor_almacen), estimado: false } : { valor: financials.patrimonioNeto(now).valor_almacen, estimado: true };

  // Deudas activas en la fecha (según start_date / end_date).
  const deudasActivas = store.readAll("debts").filter((d) => {
    const ini = d.start_date ? new Date(d.start_date).getTime() : 0;
    const fin = d.end_date ? new Date(d.end_date).getTime() : Infinity;
    return ini <= t && fin >= t;
  });
  const deudaTotal = eur(deudasActivas.reduce((s, d) => s + (Number(d.outstanding_amount) || 0), 0));

  // Costes fijos activos en la fecha.
  const fijosActivos = store.readAll("fixed_costs").filter((f) => fixedCosts.activoEn(f, t));
  const costeFijoMensual = eur(fijosActivos.reduce((s, f) => s + fixedCosts.costeDiario(f) * (365 / 12), 0));

  // Activos existentes en la fecha (comprados antes de ella).
  const activosEn = store.readAll("assets").filter((a) => a.active !== false && (!a.purchase_date || antesDe(a.purchase_date, t)));
  const valorActivos = eur(activosEn.reduce((s, a) => s + assetsMod.valorActual(a, t), 0));

  // Equipo activo en la fecha (aproximado con el censo actual si no hay histórico).
  const equipo = staff.censo().equipo.length;

  // Movimientos de stock hasta la fecha.
  const movimientos = store.readAll("stock_movements").filter((m) => m.created_at && new Date(m.created_at).getTime() <= t).length;

  // Beneficio estimado del año hasta la fecha.
  const beneficio = financials.beneficio(hastaHoy, now);

  return {
    fecha: fechaStr,
    ventas_anio_hasta_fecha: ventasAnio,
    ventas_historicas_totales: ventasTotales,
    valor_almacen: valorAlmacen.valor,
    valor_almacen_estimado: valorAlmacen.estimado,
    deuda_activa: deudaTotal,
    num_deudas_activas: deudasActivas.length,
    coste_fijo_mensual: costeFijoMensual,
    num_costes_fijos: fijosActivos.length,
    valor_activos: valorActivos,
    num_activos: activosEn.length,
    empleados_activos: equipo,
    movimientos_stock: movimientos,
    beneficio_estimado_anio: beneficio.beneficio_operativo,
    nota: "Reconstrucción a partir del histórico disponible. Algunos valores son estimaciones.",
  };
}

module.exports = { reconstruir };
