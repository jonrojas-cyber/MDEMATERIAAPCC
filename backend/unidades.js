// Conversión de unidades para la carga de albaranes al almacén.
//
// El proveedor factura en su unidad (kg, L, cajas…) pero cada materia se guarda
// en su unidad de consumo (g, ml, ud). Si no se convierte, el stock descuadra
// (2 kg de lima sumarían "2" en vez de "2000 g"). Aquí se hace la conversión a
// la unidad de la materia, de forma transparente y revisable.

// Tablas por dimensión. El valor es cuántas unidades base equivale (masa→g,
// volumen→ml, conteo→ud).
const MASA = {
  mg: 0.001, g: 1, gr: 1, grs: 1, gramo: 1, gramos: 1,
  kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogramo: 1000, kilogramos: 1000,
};
const VOLUMEN = {
  ml: 1, mililitro: 1, mililitros: 1, cl: 10, centilitro: 10, centilitros: 10,
  dl: 100, l: 1000, lt: 1000, lts: 1000, litro: 1000, litros: 1000,
};
const CONTEO = {
  ud: 1, uds: 1, u: 1, un: 1, und: 1, unidad: 1, unidades: 1,
  pza: 1, pzas: 1, pieza: 1, piezas: 1, ubi: 1,
};

// Normaliza un texto de unidad: minúsculas, sin acentos, sin espacios ni puntos.
function norm(u) {
  return String(u || "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.\s]/g, "");
}

// Devuelve la tabla y la base a la que pertenece una unidad (o null si no la conoce).
function dimension(u) {
  const n = norm(u);
  if (n in MASA) return { tabla: MASA, base: "masa" };
  if (n in VOLUMEN) return { tabla: VOLUMEN, base: "volumen" };
  if (n in CONTEO) return { tabla: CONTEO, base: "conteo" };
  return null;
}

function redondear(n) {
  return Math.round(n * 1000) / 1000;
}

// Convierte `cantidad` en `unidadOrigen` a la unidad de consumo de `materia`.
// Devuelve { cantidad, unidad, ok, nota }:
//   · ok=true  → conversión segura (o no hacía falta).
//   · ok=false → no se pudo convertir sola; se deja la cantidad y se avisa.
function convertir(cantidad, unidadOrigen, materia) {
  const destino = (materia && (materia.unidad || materia.unidad_consumo)) || "";
  const cant = Number(cantidad);
  if (!Number.isFinite(cant)) {
    return { cantidad: 0, unidad: destino, ok: false, nota: "La cantidad no es un número." };
  }
  const o = norm(unidadOrigen);
  const d = norm(destino);

  // 1) Unidad de compra propia de la materia (caja, saco, brick…) con su factor.
  //    Ej.: 6 cajas × 12 = 72 ud.
  if (materia && materia.unidad_compra && Number(materia.conversion) > 0 && norm(materia.unidad_compra) === o) {
    const r = redondear(cant * Number(materia.conversion));
    return { cantidad: r, unidad: destino, ok: true, nota: `${cant} ${unidadOrigen} × ${materia.conversion} = ${r} ${destino}` };
  }

  // 2) Sin unidad detectada o misma unidad → tal cual.
  if (!o || o === d) {
    return { cantidad: redondear(cant), unidad: destino, ok: true, nota: "" };
  }

  // 3) Misma dimensión métrica (masa↔masa, volumen↔volumen, conteo↔conteo).
  const dOrigen = dimension(unidadOrigen);
  const dDestino = dimension(destino);
  if (dOrigen && dDestino && dOrigen.base === dDestino.base) {
    const factor = dOrigen.tabla[o] / dDestino.tabla[d];
    const r = redondear(cant * factor);
    return { cantidad: r, unidad: destino, ok: true, nota: `${cant} ${unidadOrigen} = ${r} ${destino}` };
  }

  // 4) No convertible automáticamente (p. ej. "caja" sin factor, o kg→ud).
  return {
    cantidad: redondear(cant),
    unidad: destino,
    ok: false,
    nota: `No sé pasar "${unidadOrigen || "?"}" a "${destino || "?"}". Revisa la cantidad a mano.`,
  };
}

module.exports = { convertir, norm, dimension };
