// Sugerencias de compra AGRUPADAS POR PROVEEDOR.
//
// Un solo cálculo que usan: el aviso diario de las 16:00 (avisos.js) y la
// pantalla de Pedidos. Incluye lo que está bajo mínimo ("critico") y lo que
// va justo ("por_pedir"), usando el umbral compartido.

const store = require("./data-store");
const { estadoStock, cantidadSugerida } = require("./umbral");

function sugerencias() {
  const materias = store.readAll("materias");
  const proveedores = store.readAll("proveedores");
  const provById = {};
  proveedores.forEach((p) => (provById[p.id] = p));

  const grupos = {};
  materias.forEach((m) => {
    const est = estadoStock(m);
    if (est === "correcto") return;
    const key = m.proveedor_id || "sin";
    if (!grupos[key]) {
      const p = provById[m.proveedor_id];
      grupos[key] = {
        proveedor_id: m.proveedor_id || null,
        proveedor: p ? p.nombre : "Sin proveedor asignado",
        whatsapp: p && p.whatsapp ? String(p.whatsapp).replace(/[^0-9+]/g, "") : null,
        items: [],
        criticos: 0,
      };
    }
    grupos[key].items.push({
      materia_id: m.id,
      nombre: m.nombre,
      disponibilidad_actual: Number(m.disponibilidad_actual) || 0,
      unidad: m.unidad || "",
      cantidad_sugerida: cantidadSugerida(m),
      estado: est, // "critico" (bajo mínimo) | "por_pedir" (va justo)
    });
    if (est === "critico") grupos[key].criticos++;
  });

  return Object.values(grupos)
    .map((g) => ({
      ...g,
      total_items: g.items.length,
      items: g.items.sort((a, b) =>
        a.estado === b.estado ? a.nombre.localeCompare(b.nombre) : a.estado === "critico" ? -1 : 1
      ),
    }))
    .sort((a, b) => b.criticos - a.criticos || a.proveedor.localeCompare(b.proveedor));
}

module.exports = { sugerencias };
