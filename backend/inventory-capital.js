// CAPITAL PARADO · el dinero inmovilizado en el almacén, no en unidades sino en
// euros: por categoría, en frío/seco/bebidas/limpieza, sin rotación, a punto de
// caducar, perdido por merma, y la rotación media. Reutiliza costing y clasificador.

const store = require("./data-store");
const costing = require("./costing");
const { categoriaDe } = require("./clasificador");

const DAY = 86400000;
function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Mapea la macro/subcategoría de una materia a un "cajón" de capital.
function cajonDe(m) {
  const c = categoriaDe(m);
  const sub = (c.sub || "").toLowerCase();
  const macro = (c.macro || "").toLowerCase();
  if (macro.includes("limpieza") || macro.includes("appcc")) return "limpieza";
  if (macro.includes("bebida")) return "bebidas";
  if (sub.includes("bebida") || sub.includes("refresco")) return "bebidas";
  if (sub.includes("vegetal") || sub.includes("fruta") || sub.includes("proteína") || sub.includes("lácteo") || sub.includes("lacteo")) return "frio";
  return "seco";
}

function valorMateria(m) {
  return (Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0);
}

// Materias que llevan >= `dias` sin salida de stock (sin venta/consumo/merma).
function materiasSinRotacion(materias, movimientos, now, dias = 21) {
  const desde = now - dias * DAY;
  const conSalida = new Set();
  movimientos.forEach((mv) => {
    if ((Number(mv.delta) || 0) < 0 && mv.created_at && new Date(mv.created_at).getTime() >= desde) {
      conSalida.add(mv.materia_id);
    }
  });
  return materias.filter((m) => valorMateria(m) > 0 && !conSalida.has(m.id));
}

function calcular(now = Date.now()) {
  const materias = store.readAll("materias");
  const movimientos = store.readAll("stock_movements");
  const idxMat = costing.indiceMaterias(materias);
  const recetas = store.readAll("recetas");
  const recById = {}; recetas.forEach((r) => (recById[r.id] = r));

  const valorTotal = costing.valorStock(materias);

  // Cajones de dinero.
  const cajones = { frio: 0, seco: 0, bebidas: 0, limpieza: 0 };
  const porCategoria = {};
  materias.forEach((m) => {
    const v = valorMateria(m);
    cajones[cajonDe(m)] += v;
    const cat = categoriaDe(m).macro || "Otros";
    porCategoria[cat] = (porCategoria[cat] || 0) + v;
  });

  // Sin rotación.
  const sinRot = materiasSinRotacion(materias, movimientos, now);
  const sinRotEur = eur(sinRot.reduce((s, m) => s + valorMateria(m), 0));

  // En caducidad: lotes con caduca_en <= 72h y con stock, valorados a coste de receta.
  const enCaducidad = store.readAll("lotes")
    .filter((l) => l.estado !== "Fuera de servicio" && l.caduca_en && (l.cantidad_restante == null || l.cantidad_restante > 0) && new Date(l.caduca_en).getTime() - now <= 72 * 3.6e6)
    .reduce((s, l) => { const r = recById[l.receta_id]; return s + (r ? costing.costePorUnidad(r, idxMat) * (Number(l.cantidad_restante) || Number(l.cantidad_inicial) || 0) : 0); }, 0);

  // Merma (últimos 30 días).
  const r30 = { desde: now - 30 * DAY, hasta: now };
  const mermaEur = costing.costeMermas(store.readAll("ajustes").filter((a) => a.fecha && new Date(a.fecha).getTime() >= r30.desde));

  // Rotación: coste de materia vendida en 30 días / valor de stock.
  const productos = store.readAll("productos");
  const prodById = {}; const prodByName = {};
  productos.forEach((p) => { prodById[p.id] = p; if (p.nombre) prodByName[p.nombre.toLowerCase()] = p; });
  const costeVendido30 = store.readAll("ventas")
    .filter((v) => v.fecha && new Date(v.fecha).getTime() >= r30.desde)
    .reduce((s, v) => { const p = prodById[v.producto_id] || prodByName[String(v.producto || "").toLowerCase()]; return s + (p ? costing.costeProducto(p, idxMat) * (Number(v.cantidad) || 0) : 0); }, 0);
  const rotacion = valorTotal > 0 ? Math.round((costeVendido30 / valorTotal) * 100) / 100 : null;
  const diasMedios = costeVendido30 > 0 ? Math.round(valorTotal / (costeVendido30 / 30)) : null;

  return {
    valor_total: eur(valorTotal),
    por_categoria: Object.entries(porCategoria).map(([label, value]) => ({ label, value: eur(value) })).sort((a, b) => b.value - a.value),
    dinero_frio: eur(cajones.frio),
    dinero_seco: eur(cajones.seco),
    dinero_bebidas: eur(cajones.bebidas),
    dinero_limpieza: eur(cajones.limpieza),
    sin_rotacion_eur: sinRotEur,
    sin_rotacion_items: sinRot.length,
    en_caducidad_eur: eur(enCaducidad),
    merma_30d_eur: eur(mermaEur),
    rotacion,
    dias_medios_stock: diasMedios,
  };
}

module.exports = { calcular, cajonDe, eur };
