// Fuente ÚNICA del IVA de venta y del neteo (dinero.8).
// Antes el 0,10 estaba duplicado en financials.js, costing.js, cuenta-resultados.js
// y analisis-mes.js, cada uno con su propia constante que podía divergir. Aquí vive
// una sola vez y todos la consumen.
//
// Convención del dinero en Control M:
//   · El TITULAR de ventas se muestra en BRUTO (con IVA), para cuadrar con Ágora/TPV.
//   · El P&L (beneficio, food cost, margen) se calcula sobre la base SIN IVA: el IVA
//     repercutido no es ingreso.

const IVA_VENTA = 0.10; // hostelería (España)

function ivaValido(v) {
  return v != null && v !== "" && Number(v) >= 0 && Number(v) < 1;
}

// IVA de venta a aplicar. DECISIÓN DE LA FUNDADORA (Mónica, 2026-10): el IVA de venta de
// m de materia es el 10% para TODOS los productos; NO se aplica ningún otro tipo (ni 21%)
// en el lado de ventas. Por eso devuelve SIEMPRE IVA_VENTA e ignora cualquier tipo por
// línea/producto. Si algún día hubiera varios tipos de venta, este es el ÚNICO punto a tocar.
function ivaDeVenta(_v) {
  return IVA_VENTA;
}

// Base imponible (sin IVA) de un importe bruto.
function neto(bruto, iva) {
  return (Number(bruto) || 0) / (1 + ivaDeVenta(iva));
}

module.exports = { IVA_VENTA, ivaValido, ivaDeVenta, neto };
