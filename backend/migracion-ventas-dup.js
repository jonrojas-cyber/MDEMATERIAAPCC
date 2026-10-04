// MIGRACIÓN: limpia VENTAS DUPLICADAS heredadas
// ─────────────────────────────────────────────────────────────────────────────
// Durante un tiempo convivieron dos formas de meter ventas:
//   · El consumo de Ágora (conector / export "Análisis de Ventas") → cada venta
//     lleva `doc_clave` (ticket), es idempotente y trae el neto. Fuente de verdad.
//   · Una importación antigua por CSV → ventas SIN `doc_clave`, sin dedupe.
// Si ambas cargaron el mismo mes, las ventas sin doc_clave quedan DUPLICADAS sobre
// las del consumo e inflan los ingresos del P&L (no el %, pero sí el € del mes).
//
// Esta migración borra, SOLO en los meses que ya tienen ventas con doc_clave (es
// decir, con el consumo cargado), las ventas SIN doc_clave. Conservadora: nunca
// toca un mes que solo tenga ventas antiguas (ahí son el único dato) y es
// idempotente (correrla otra vez no borra nada más). A partir de ahora, re-importar
// un mes lo REEMPLAZA (ver routes/analisis-mes), así que esto no se vuelve a dar.

function mes(v) { return String((v && v.fecha) || "").slice(0, 7); }
function tieneClave(v) { return !!(v && (v.doc_clave || (v.doc_serie != null && v.doc_number != null))); }

function aplicar(st) {
  const ventas = st.readAll("ventas") || [];
  if (!ventas.length) return { eliminadas: 0, meses: [] };

  // Meses que ya tienen consumo (al menos una venta con doc_clave).
  const mesesConClave = new Set();
  ventas.forEach((v) => { if (tieneClave(v) && /^\d{4}-\d{2}$/.test(mes(v))) mesesConClave.add(mes(v)); });
  if (!mesesConClave.size) return { eliminadas: 0, meses: [] };

  const quedan = ventas.filter((v) => tieneClave(v) || !mesesConClave.has(mes(v)));
  const eliminadas = ventas.length - quedan.length;
  if (eliminadas > 0) st.writeAll("ventas", quedan);
  return { eliminadas, meses: [...mesesConClave] };
}

async function migrarVentasDup(store) {
  try {
    const { eliminadas } = aplicar(store);
    if (eliminadas > 0) { await store.flush(); console.log(`Migración ventas · ${eliminadas} venta(s) duplicada(s) heredada(s) eliminadas.`); }
  } catch (e) {
    console.error("No se pudo limpiar ventas duplicadas:", e.message);
  }
}

module.exports = { migrarVentasDup, aplicar };
