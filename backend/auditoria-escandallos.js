// AUDITORÍA DE ESCANDALLOS (¿es real cada escandallo y está enlazado a la compra?)
// ─────────────────────────────────────────────────────────────────────────────
// Para CADA producto de la carta, comprueba su escandallo ingrediente a ingrediente:
//  · ¿tiene escandallo (ingredientes con cantidades) o no?
//  · ¿el coste de cada materia está ENLAZADO a su precio de compra real (facturas)?
// Usa el MISMO motor de coste (costing), no recalcula el dinero por su cuenta.
//
// Origen del coste de una materia:
//   compra      → tiene precio_compra (lo volcó coste-desde-compras desde tus facturas). REAL.
//   elaboracion → la materia la produce una receta; su coste sale de su propio escandallo.
//   estimado    → coste_estimado (sembrado/estimado, no de una compra).
//   manual      → tiene coste pero sin precio de compra registrado (metido a mano).
//   sin_precio  → sin coste / pendiente_coste → entraría como 0 (coste infravalorado).
//   sin_materia → el ingrediente apunta a una materia que no existe.
//
// Estado del escandallo del producto (de peor a mejor, para priorizar):
//   sin_escandallo → no tiene ingredientes ni coste declarado.
//   incompleto     → tiene escandallo pero alguna materia SIN precio (coste infravalorado).
//   coste_directo  → sin escandallo, con coste declarado a mano (coste_materia).
//   parcial        → escandallo con alguna materia estimada/manual (no toda de compra).
//   enlazado       → escandallo con TODAS las materias enlazadas a compra real. Coste 100% real.

const store = require("./data-store");
const costing = require("./costing");

function origenMateria(m, elaboracionIds) {
  if (!m) return { origen: "sin_materia", coste: 0 };
  const coste = Number(m.coste_medio) || 0;
  if (elaboracionIds.has(m.id)) return { origen: "elaboracion", coste };
  if (coste <= 0 || m.pendiente_coste === true) return { origen: "sin_precio", coste: 0 };
  if (Number(m.precio_compra) > 0) return { origen: "compra", coste };
  if (m.coste_estimado === true) return { origen: "estimado", coste };
  return { origen: "manual", coste };
}

const RANK = { sin_escandallo: 0, incompleto: 1, coste_directo: 2, parcial: 3, enlazado: 4 };
const ESTADOS = ["enlazado", "parcial", "coste_directo", "incompleto", "sin_escandallo"];

function auditar() {
  const materias = store.readAll("materias") || [];
  const productos = (store.readAll("productos") || []).filter((p) => p.activo !== false);
  const recetas = store.readAll("recetas") || [];
  const idxMat = costing.indiceMaterias(materias);
  const byId = {}; materias.forEach((m) => (byId[m.id] = m));
  const elaboracionIds = new Set();
  recetas.forEach((r) => { if (r && r.produce_materia_id) elaboracionIds.add(r.produce_materia_id); });

  const filas = productos.map((p) => {
    const ings = p.ingredientes || [];
    const tieneEscandallo = ings.length > 0;
    const directo = Number(p.coste_materia) > 0;
    const lineas = ings.map((ing) => {
      const m = byId[ing.materia_id];
      const o = origenMateria(m, elaboracionIds);
      const cant = Number(ing.cantidad) || 0;
      return {
        materia_id: ing.materia_id,
        nombre: m ? m.nombre : String(ing.materia_id || "(materia desconocida)"),
        cantidad: cant,
        unidad: m ? (m.unidad || "") : "",
        coste_unit: o.coste,
        coste_linea: Math.round(o.coste * cant * 10000) / 10000,
        origen: o.origen,
      };
    });

    const det = costing.costeProductoDetalle(p, idxMat);
    const coste = Math.round((det.coste || 0) * 10000) / 10000;

    let estado;
    if (!tieneEscandallo) {
      estado = directo ? "coste_directo" : "sin_escandallo";
    } else {
      const ors = lineas.map((l) => l.origen);
      if (ors.some((o) => o === "sin_precio" || o === "sin_materia")) estado = "incompleto";
      else if (ors.every((o) => o === "compra" || o === "elaboracion")) estado = "enlazado";
      else estado = "parcial";
    }

    const enlazadas = lineas.filter((l) => l.origen === "compra" || l.origen === "elaboracion").length;
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria || "",
      tiene_escandallo: tieneEscandallo,
      coste,
      precio_venta: Math.round((Number(p.precio_venta) || 0) * 100) / 100,
      fuente_coste: det.fuente_coste || null, // si el coste viene del respaldo por nombre
      estado,
      lineas_enlazadas: enlazadas,
      lineas_total: lineas.length,
      lineas,
    };
  });

  filas.sort((a, b) => (RANK[a.estado] - RANK[b.estado]) || String(a.nombre).localeCompare(String(b.nombre)));

  const porEstado = {};
  for (const e of ESTADOS) porEstado[e] = filas.filter((f) => f.estado === e).length;
  // Nº de líneas (ingredientes) enlazadas a compra sobre el total, en toda la carta.
  const lineasTotal = filas.reduce((s, f) => s + f.lineas_total, 0);
  const lineasEnlazadas = filas.reduce((s, f) => s + f.lineas_enlazadas, 0);

  return {
    total: filas.length,
    con_escandallo: filas.filter((f) => f.tiene_escandallo).length,
    por_estado: porEstado,
    lineas_total: lineasTotal,
    lineas_enlazadas: lineasEnlazadas,
    enlace_pct: lineasTotal > 0 ? Math.round((lineasEnlazadas / lineasTotal) * 1000) / 1000 : null,
    productos: filas,
  };
}

module.exports = { auditar, origenMateria };
