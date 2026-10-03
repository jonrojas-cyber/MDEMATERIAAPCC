// Cálculo de tarifas de los artículos de compra (precio con IVA, unitario real,
// coste base) y evaluación de si al artículo le falta tarifa. Extraído a su
// propio módulo para que lo use tanto la ruta de compras-productos como la ficha
// de proveedor — una sola fuente del cálculo de precio.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const round = (n, d = 4) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);

// Precio con IVA y precio unitario real a partir de los datos base.
function calcular(p) {
  const sinIva = num(p.precio_sin_iva);
  const iva = num(p.iva);
  const cant = num(p.cantidad_formato);
  const conIva = round(sinIva * (1 + iva / 100), 4);
  const unitario = cant > 0 ? round(conIva / cant, 4) : conIva;
  const cb = num(p.contenido_base);
  const costeBase = cb > 0 ? round(conIva / cb, 6) : null;
  return { ...p, precio_con_iva: conIva, precio_unitario_real: unitario, coste_base: costeBase };
}

// ¿Le falta tarifa para poder usarse? No inventa nada: si falta precio, formato
// o contenido, queda «Pendiente de completar» y se listan los campos que faltan.
function evaluarEstado(p) {
  const faltan = [];
  if (num(p.precio_sin_iva) <= 0) faltan.push("precio");
  if (p.iva == null) faltan.push("IVA");
  if (!p.formato) faltan.push("formato");
  if (num(p.cantidad_formato) <= 0) faltan.push("contenido");
  const pendiente = faltan.length > 0;
  return { ...p, faltan, pendiente, estado: pendiente ? "Pendiente de completar" : "Completo" };
}

module.exports = { num, round, calcular, evaluarEstado };
