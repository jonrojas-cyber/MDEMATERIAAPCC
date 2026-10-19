// FIABILIDAD DE LOS DATOS · ¿cuánto de lo que dicen los números es REAL y cuánto
// todavía es una estimación sembrada? (Fase C · "cuadrar a cero").
// ─────────────────────────────────────────────────────────────────────────────
// No recalcula dinero ni inventa nada: LEE las fuentes únicas ya existentes
// (conciliacion de almacén, libro de stock, tesorería, personal, activos, fijos) y
// clasifica cada área en real / parcial / pendiente, con la ACCIÓN concreta para
// llevarla a real. El dato real entra por los caminos que ya existen:
//   · recepción/factura → coste real de materia (food cost)
//   · escandallo del producto → coste de venta real
//   · recuento físico → stock real (y el libro deja de tener faltantes)
//   · conciliar cuenta con el extracto → saldo real
//   · staff_finance → coste laboral real (en vez de la estimación de fijos)
//   · activos cargados → amortización real · confirmar fijos → gasto fijo real
// A medida que Mónica carga lo real, la estimación sembrada queda sustituida y el
// medidor sube solo hacia el 100 % (cero estimaciones, cero descuadres).

const store = require("./data-store");
const conciliacion = require("./conciliacion");
const ledger = require("./stock-ledger");
const treasury = require("./treasury");

function mesDe(now) { return new Date(now).toISOString().slice(0, 7); }
function finMes(m) { const [y, mm] = m.split("-").map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); }

// estado: "real" (área respaldada por datos reales) | "parcial" | "pendiente".
function dominio(clave, label, estado, pendientes, accion, detalle) {
  return { clave, label, estado, pendientes: pendientes || 0, accion, detalle: detalle || "" };
}

function informe(now = Date.now()) {
  const mes = mesDe(now);

  // 1) Coste de materias (base del food cost).
  const resumen = conciliacion.resumenAlmacen(store);
  const nMat = resumen.n_materias || 0;
  const sinCoste = resumen.n_sin_coste || 0;
  const foodCost = dominio(
    "food_cost", "Coste de materias (food cost)",
    nMat === 0 ? "pendiente" : (sinCoste === 0 ? "real" : "parcial"), sinCoste,
    sinCoste ? `Carga el coste real de ${sinCoste} materia(s) con una recepción/factura.` : "Todas las materias tienen coste real.",
  );

  // 2) Escandallos de venta (productos que venden pero no descuentan stock/coste).
  const sinEsc = conciliacion.productosSinEscandallo(store, mes + "-01", finMes(mes)).n || 0;
  const escandallos = dominio(
    "escandallos", "Escandallos de venta",
    sinEsc === 0 ? "real" : "parcial", sinEsc,
    sinEsc ? `Define el escandallo de ${sinEsc} producto(s) que se venden sin coste.` : "Los productos vendidos tienen coste.",
  );

  // 3) Inventario: recuento físico + faltantes del libro.
  const desv = conciliacion.desviacionUltimoInventario(store);
  const rec = ledger.reconciliar(store);
  const inventario = dominio(
    "inventario", "Inventario (recuento + libro)",
    !desv ? "pendiente" : (rec.con_faltante === 0 ? "real" : "parcial"), rec.con_faltante,
    !desv ? "Haz un recuento físico para fijar el stock real." : (rec.con_faltante ? `${rec.con_faltante} materia(s) con stock teórico negativo: revisa entradas/mermas.` : "Stock contado y libro sin faltantes."),
  );

  // 4) Tesorería: cuentas conciliadas con el extracto.
  const conc = treasury.conciliacion();
  const nCuentas = conc.cuentas.length + (conc.sin_conciliar || 0);
  const tesoreria = dominio(
    "tesoreria", "Tesorería (saldos conciliados)",
    nCuentas === 0 ? "pendiente" : (conc.sin_conciliar === 0 && Math.abs(conc.total_descuadre || 0) < 0.01 ? "real" : "parcial"),
    conc.sin_conciliar || 0,
    nCuentas === 0 ? "Añade tus cuentas (caja/banco) y concílialas con el extracto." : (conc.sin_conciliar ? `${conc.sin_conciliar} cuenta(s) sin conciliar con el extracto.` : (Math.abs(conc.total_descuadre || 0) >= 0.01 ? `Descuadre de ${conc.total_descuadre} € con el banco.` : "Cuentas conciliadas con el banco.")),
  );

  // 5) Personal: coste laboral real (staff_finance) vs estimación de fijos.
  const hayStaff = (store.readAll("staff_finance") || []).some((s) => s && s.activo !== false);
  const personal = dominio(
    "personal", "Coste laboral (nóminas)",
    hayStaff ? "real" : "pendiente", hayStaff ? 0 : 1,
    hayStaff ? "Personal desde nóminas reales (pagas + SS)." : "Carga el personal real (bruto, nº pagas, SS) para sustituir la estimación.",
  );

  // 6) Activos: amortización real.
  const nActivos = (store.readAll("assets") || []).length;
  const activos = dominio(
    "activos", "Activos (amortización)",
    nActivos > 0 ? "real" : "pendiente", nActivos > 0 ? 0 : 1,
    nActivos > 0 ? "Amortización sobre activos reales." : "Carga tus activos (cafetera, mobiliario…) para la amortización real.",
  );

  // 7) Gastos fijos: declarados y confirmados.
  const fijos = (store.readAll("fixed_costs") || []).filter((f) => f.active !== false);
  const porConfirmar = fijos.filter((f) => !f.confirmado_en && f.fuente !== "real").length;
  const gastosFijos = dominio(
    "gastos_fijos", "Gastos fijos",
    fijos.length === 0 ? "pendiente" : (porConfirmar === 0 ? "real" : "parcial"), porConfirmar,
    fijos.length === 0 ? "Declara tus gastos fijos (alquiler, suministros…)." : (porConfirmar ? `${porConfirmar} gasto(s) fijo(s) por confirmar con su factura/importe real.` : "Gastos fijos confirmados."),
  );

  const dominios = [foodCost, escandallos, inventario, tesoreria, personal, activos, gastosFijos];
  const reales = dominios.filter((d) => d.estado === "real").length;
  const parciales = dominios.filter((d) => d.estado === "parcial").length;
  const fiabilidad_pct = Math.round((100 * (reales + 0.5 * parciales)) / dominios.length);
  const veredicto = fiabilidad_pct >= 100 ? "fiable" : (fiabilidad_pct >= 70 ? "casi" : "en_construccion");

  const checklist = dominios
    .filter((d) => d.estado !== "real")
    .sort((a, b) => (a.estado === "pendiente" ? 0 : 1) - (b.estado === "pendiente" ? 0 : 1))
    .map((d) => ({ clave: d.clave, label: d.label, estado: d.estado, accion: d.accion }));

  return {
    generado_en: new Date(now).toISOString(),
    fiabilidad_pct, veredicto,
    areas_reales: reales, areas_parciales: parciales, areas_total: dominios.length,
    dominios, checklist,
  };
}

module.exports = { informe };
