// CUENTA DE RESULTADOS · P&L mensual, en vivo y con datos reales.
// Fuente única del dinero: financials (ventas + coste de materia por escandallo),
// fixed-costs (personal + otros fijos) y debts (cuota de préstamos). No inventa:
// el coste de materia sale de los escandallos cargados; si no hay, va a null.
//
// Permite un override de "ventas netas del mes" (por si el conector de Ágora va
// atrasado): entonces el coste de materia se estima con el MISMO food cost real
// de la carta, para que la cuenta cuadre con el cierre de Ágora.
//
// `componer(datos)` es puro (test). `calcular(opts)` reúne del store + motores.

const store = require("./data-store");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function pct1(n) { return n == null ? null : Math.round(n * 1000) / 10; }
const MES = 365 / 12;

// Rango de un mes "YYYY-MM" (o el mes en curso). hasta = min(fin de mes, ahora).
function rangoMes(mes, now = Date.now()) {
  let y, m;
  if (mes && /^\d{4}-\d{2}$/.test(mes)) { y = Number(mes.slice(0, 4)); m = Number(mes.slice(5, 7)) - 1; }
  else { const d = new Date(now); y = d.getFullYear(); m = d.getMonth(); }
  const desde = new Date(y, m, 1).getTime();
  const finMes = new Date(y, m + 1, 1).getTime();
  const hasta = Math.min(now, finMes);
  const diasMes = Math.round((finMes - desde) / 86400000);
  const diasTranscurridos = Math.max(1, Math.round((hasta - desde) / 86400000));
  const enCurso = now < finMes;
  return { desde, hasta, finMes, diasMes, diasTranscurridos, enCurso, etiqueta: `${y}-${String(m + 1).padStart(2, "0")}` };
}

// ── COMPONER (puro) ─────────────────────────────────────────────────────────
// Recibe las magnitudes ya calculadas y arma la cuenta + la proyección a mes.
function componer(d) {
  const {
    etiqueta, diasMes, diasTranscurridos, enCurso,
    ventas, coste_materia, personal, otros_fijos, variables,
    cuota_creditos, food_cost_pct, ventas_origen = "produccion",
  } = d;

  const tieneMateria = coste_materia != null;
  const margen_bruto = tieneMateria ? eur(ventas - coste_materia) : null;
  const ebitda = tieneMateria ? eur(margen_bruto - personal - otros_fijos - variables) : null;
  const resultado_caja = ebitda != null ? eur(ebitda - cuota_creditos) : null;

  const cuenta = {
    ingresos: eur(ventas),
    coste_materia: tieneMateria ? eur(coste_materia) : null,
    food_cost_pct: food_cost_pct != null ? Math.round(food_cost_pct * 100) : null,
    margen_bruto,
    personal: eur(personal),
    otros_fijos: eur(otros_fijos),
    variables: eur(variables),
    ebitda,
    margen_ebitda_pct: ebitda != null && ventas > 0 ? Math.round((ebitda / ventas) * 100) : null,
    cuota_creditos: eur(cuota_creditos),
    resultado_caja,
    ventas_origen,
  };

  // Proyección a mes completo (lineal por días transcurridos), solo si el mes
  // está en curso. Escala ventas/materia/variables; fijos y créditos a mes entero.
  let proyeccion = null;
  if (enCurso && diasTranscurridos > 0 && diasTranscurridos < diasMes) {
    const factor = diasMes / diasTranscurridos;
    const ventasP = ventas * factor;
    const materiaP = tieneMateria ? coste_materia * factor : null;
    const variablesP = variables * factor;
    // Fijos y créditos: a mes completo (los que ya tenemos son del periodo transcurrido).
    const personalMes = personal * (diasMes / diasTranscurridos);
    const otrosMes = otros_fijos * (diasMes / diasTranscurridos);
    const creditoMes = cuota_creditos * (diasMes / diasTranscurridos);
    const mbP = materiaP != null ? ventasP - materiaP : null;
    const ebitdaP = mbP != null ? mbP - personalMes - otrosMes - variablesP : null;
    proyeccion = {
      ingresos: eur(ventasP),
      coste_materia: materiaP != null ? eur(materiaP) : null,
      margen_bruto: mbP != null ? eur(mbP) : null,
      personal: eur(personalMes), otros_fijos: eur(otrosMes), variables: eur(variablesP),
      ebitda: ebitdaP != null ? eur(ebitdaP) : null,
      cuota_creditos: eur(creditoMes),
      resultado_caja: ebitdaP != null ? eur(ebitdaP - creditoMes) : null,
    };
  }

  // Punto de equilibrio del mes con el food cost real (si lo hay).
  let equilibrio_mes = null;
  if (food_cost_pct != null && food_cost_pct < 1) {
    const contrib = 1 - food_cost_pct;
    const fijosMes = enCurso ? (personal + otros_fijos) * (diasMes / diasTranscurridos) : personal + otros_fijos;
    const credMes = enCurso ? cuota_creditos * (diasMes / diasTranscurridos) : cuota_creditos;
    equilibrio_mes = eur((fijosMes + credMes) / contrib);
  }

  return { mes: etiqueta, dias_mes: diasMes, dias_transcurridos: diasTranscurridos, en_curso: enCurso, cuenta, proyeccion, equilibrio_mes };
}

// ── CALCULAR (lee store + motores) ──────────────────────────────────────────
function calcular(opts = {}) {
  const now = opts.now || Date.now();
  const R = rangoMes(opts.mes, now);
  const rango = { desde: R.desde, hasta: R.hasta };

  const financials = require("./financials");
  const costing = require("./costing");
  const fixedCosts = require("./fixed-costs");
  const staff = require("./staff-finance");

  const idxMat = costing.indiceMaterias();
  const idxProd = financials.indicesProducto();
  const ventasProd = financials.ventasEnRango(rango);
  const materiaProd = financials.costeMateriaVendidaEnRango(rango, idxMat, idxProd);
  const foodCostProd = ventasProd > 0 ? materiaProd / ventasProd : null;

  // Override de ventas (cierre de Ágora): recalcula la materia con el food cost real.
  // Precedencia: parámetro explícito > cierre mensual GUARDADO > ventas de la app.
  // El cierre guardado vive en config con id `ventas_mes_<YYYY-MM>` (persistente),
  // para que la cuenta cuadre con Ágora aunque el conector vaya atrasado.
  let ventas = ventasProd, coste_materia = materiaProd, ventas_origen = "produccion";
  const ov = Number(opts.ventas);
  const guardado = (store.readAll("config") || []).find((c) => c && c.id === `ventas_mes_${R.etiqueta}`);
  const ovGuardado = guardado ? Number(guardado.valor) : NaN;
  if (Number.isFinite(ov) && ov > 0) {
    ventas = ov; ventas_origen = "manual_agora";
    coste_materia = foodCostProd != null ? ov * foodCostProd : null;
  } else if (Number.isFinite(ovGuardado) && ovGuardado > 0) {
    ventas = ovGuardado; ventas_origen = "cierre_guardado";
    coste_materia = foodCostProd != null ? ovGuardado * foodCostProd : null;
  } else if (ventasProd <= 0) {
    coste_materia = null; // sin ventas registradas no afirmamos coste
  }

  // Personal vs otros fijos, prorrateados al periodo transcurrido.
  const dias = Math.max(1, (rango.hasta - rango.desde) / 86400000);
  let personalFijos = 0, otrosFijos = 0;
  (store.readAll("fixed_costs") || []).forEach((fc) => {
    if (!fixedCosts.activoEn(fc, now)) return;
    if (fc.periodicity === "one_time") return;
    const dia = fixedCosts.costeDiario(fc) * dias;
    if ((fc.category || "").toLowerCase() === "personal") personalFijos += dia;
    else otrosFijos += dia;
  });
  const personal = personalFijos + staff.costeEnRango(rango); // staff-module por si se usa
  const variables = financials.variablesEnRango(rango) + financials.mermaEnRango(rango);
  const cuotaMes = require("./debts").resumen(now).cuota_mensual_total || 0;
  const cuota_creditos = cuotaMes * (dias / MES);

  return componer({
    etiqueta: R.etiqueta, diasMes: R.diasMes, diasTranscurridos: R.diasTranscurridos, enCurso: R.enCurso,
    ventas, coste_materia, personal, otros_fijos: otrosFijos, variables,
    cuota_creditos, food_cost_pct: foodCostProd, ventas_origen,
  });
}

module.exports = { calcular, componer, rangoMes, eur };
