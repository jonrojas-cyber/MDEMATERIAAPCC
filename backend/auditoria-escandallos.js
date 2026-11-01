// AUDITORÍA DE ESCANDALLOS (¿es real cada escandallo y está enlazado a la compra?)
// ─────────────────────────────────────────────────────────────────────────────
// Para CADA producto de la carta, comprueba su escandallo ingrediente a ingrediente:
//  · ¿tiene escandallo (ingredientes con cantidades) o no?
//  · ¿el coste de cada materia está ENLAZADO a su precio de compra (de tus facturas)?
//
// FUENTE ÚNICA DEL DINERO: el coste de cada línea y el total del producto salen del
// MISMO motor (costing.costeMateriaDetalle / costeProductoDetalle); no se recalcula
// coste_medio × cantidad por cuenta propia. Y el ESTADO se cruza con lo que el motor
// dice (incompleto / coste / respaldo por nombre): nunca se marca "enlazado" un
// escandallo que el motor considera incompleto o cuyo coste es una estimación.
//
// Origen del coste de una materia (etiqueta, no importe):
//   compra      → tiene precio_compra (volcado desde tus facturas por coste-desde-compras).
//   elaboracion → la produce una receta y esa receta SÍ resuelve su coste.
//   estimado    → coste_estimado (sembrado/estimado, no de una compra).
//   manual      → tiene coste pero sin precio de compra registrado (metido a mano).
//   sin_precio  → sin coste / pendiente_coste / elaboración que no resuelve → entra como 0.
//   sin_materia → el ingrediente apunta a una materia que no existe.
// Prioridad: elaboracion > sin_precio > estimado > compra > manual (lo estimado NUNCA
// se disfraza de compra aunque tenga un precio_compra de relleno).
//
// Estado del escandallo del producto (de peor a mejor, para priorizar):
//   sin_escandallo → sin ingredientes ni coste declarado.
//   incompleto     → el motor lo da incompleto (falta precio de alguna materia) o hay
//                    cantidades inválidas (negativas) → coste no fiable.
//   estimado       → el coste no sale del escandallo sino de un respaldo por nombre.
//   sin_compra     → escandallo con coste, pero NINGÚN ingrediente enlazado a compra
//                    (todo a mano/estimado): el coste existe pero no viene de facturas.
//   parcial        → parte de compra, parte no.
//   coste_directo  → sin escandallo, con coste declarado a mano (coste_materia).
//   enlazado       → escandallo completo con TODOS los ingredientes enlazados a compra.

const store = require("./data-store");
const costing = require("./costing");
const compras = require("./coste-desde-compras");

// Etiqueta de origen del coste de una materia. `det` es el coste resuelto por el
// motor (incluye elaboraciones recursivas). `conCompra` es el conjunto de materias
// con una compra REAL registrada (artículo de compras_productos emparejado).
function origenMateria(m, elaboracionIds, det, conCompra) {
  if (!m) return "sin_materia";
  if (elaboracionIds.has(m.id)) return det && det.resuelto && det.coste > 0 ? "elaboracion" : "sin_precio";
  const coste = Number(m.coste_medio) || 0;
  if (coste <= 0 || m.pendiente_coste === true) return "sin_precio";
  // Hay una COMPRA real de esta materia → enlazada (gana al flag estimado y al
  // precio_compra; refleja que su coste viene de una compra que metiste).
  if (conCompra && conCompra.has(m.id)) return "compra";
  if (m.coste_estimado === true) return "estimado";       // estimado explícito, sin compra real → no "compra"
  if (Number(m.precio_compra) > 0) return "compra";        // precio volcado de una compra pasada
  return "manual";
}

const RANK = { sin_escandallo: 0, incompleto: 1, estimado: 2, sin_compra: 3, parcial: 4, coste_directo: 5, enlazado: 6 };
const ESTADOS = ["enlazado", "parcial", "sin_compra", "coste_directo", "estimado", "incompleto", "sin_escandallo"];
const ENLAZADO_ORIG = new Set(["compra", "elaboracion"]);

function r4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }

function auditar() {
  const materias = store.readAll("materias") || [];
  const productos = (store.readAll("productos") || []).filter((p) => p.activo !== false);
  const recetas = store.readAll("recetas") || [];
  const idxMat = costing.indiceMaterias(materias);
  const idxRec = costing.indiceRecetasProduccion(recetas);
  const byId = {}; materias.forEach((m) => (byId[m.id] = m));
  const elaboracionIds = new Set();
  recetas.forEach((rec) => { if (rec && rec.produce_materia_id) elaboracionIds.add(rec.produce_materia_id); });
  // Materias con una compra REAL registrada (no solo con precio_compra volcado).
  const conCompra = compras.materiasConCompra(store);

  const filas = productos.map((p) => {
    const ings = p.ingredientes || [];
    const tieneEscandallo = ings.length > 0;
    const directo = Number(p.coste_materia) > 0;

    const lineas = ings.map((ing) => {
      const m = byId[ing.materia_id];
      // Coste €/unidad del MISMO motor (resuelve elaboraciones por su receta).
      const dMat = costing.costeMateriaDetalle(ing.materia_id, idxMat, idxRec);
      const origen = origenMateria(m, elaboracionIds, dMat, conCompra);
      const cant = Number(ing.cantidad) || 0;
      return {
        materia_id: ing.materia_id,
        nombre: m ? m.nombre : String(ing.materia_id || "(materia desconocida)"),
        cantidad: cant,
        unidad: m ? (m.unidad || "") : "",
        coste_unit: r4(dMat.coste || 0),
        coste_linea: r4((dMat.coste || 0) * cant),
        origen,
      };
    });

    // Coste total del producto: la cifra oficial del motor (coste directo > escandallo
    // > respaldo por nombre). fuente_coste != null ⇒ el coste NO viene del escandallo.
    const detP = costing.costeProductoDetalle(p, idxMat);
    const coste = r4(detP.coste || 0);

    const cantNegativa = lineas.some((l) => l.cantidad < 0);
    const validas = lineas.filter((l) => l.cantidad > 0);
    const orsValidas = validas.map((l) => l.origen);

    let estado;
    if (directo) {
      estado = "coste_directo"; // el motor usa el coste declarado; el escandallo no manda
    } else if (!tieneEscandallo) {
      estado = "sin_escandallo";
    } else if (cantNegativa || detP.incompleto || !(coste > 0) || orsValidas.some((o) => o === "sin_precio" || o === "sin_materia")) {
      estado = "incompleto"; // el motor lo da incompleto / dato inválido / falta precio
    } else if (detP.fuente_coste) {
      estado = "estimado"; // el coste viene de un respaldo por nombre, no del escandallo
    } else if (orsValidas.length && orsValidas.every((o) => ENLAZADO_ORIG.has(o))) {
      estado = "enlazado";
    } else if (orsValidas.some((o) => ENLAZADO_ORIG.has(o))) {
      estado = "parcial";
    } else {
      estado = "sin_compra"; // tiene coste pero ningún ingrediente enlazado a compra
    }

    const enlazadas = validas.filter((l) => ENLAZADO_ORIG.has(l.origen)).length;
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria || "",
      tiene_escandallo: tieneEscandallo,
      coste,
      precio_venta: Math.round((Number(p.precio_venta) || 0) * 100) / 100,
      fuente_coste: detP.fuente_coste || null,
      coste_incompleto: detP.incompleto === true,
      estado,
      lineas_enlazadas: enlazadas,
      lineas_total: validas.length,
      lineas,
    };
  });

  filas.sort((a, b) => (RANK[a.estado] - RANK[b.estado]) || String(a.nombre).localeCompare(String(b.nombre)));

  const porEstado = {};
  for (const e of ESTADOS) porEstado[e] = filas.filter((f) => f.estado === e).length;
  const lineasTotal = filas.reduce((s, f) => s + f.lineas_total, 0);
  const lineasEnlazadas = filas.reduce((s, f) => s + f.lineas_enlazadas, 0);

  return {
    total: filas.length,
    con_escandallo: filas.filter((f) => f.tiene_escandallo).length,
    por_estado: porEstado,
    lineas_total: lineasTotal,
    lineas_enlazadas: lineasEnlazadas,
    // % de ingredientes con coste enlazado a un precio de compra registrado.
    enlace_pct: lineasTotal > 0 ? Math.round((lineasEnlazadas / lineasTotal) * 1000) / 1000 : null,
    productos: filas,
  };
}

module.exports = { auditar, origenMateria };
