// REVISIÓN BIMESTRAL DEL CATÁLOGO DE COMPRA.
// Cada ~2 meses se revisa el catálogo de compra (compras_productos, los artículos
// por proveedor extraídos de facturas). Lo que NO se ha pedido en ~60 días se
// propone para ARCHIVAR (no se borra: recuperable). La fundadora revisa la lista y
// archiva lo que quiera; lo archivado desaparece del buscador de pedidos pero se
// puede recuperar. Solo opera sobre compras_productos — las materias (ligadas a
// recetas y stock) nunca se tocan automáticamente.
//
// Decisión: ARCHIVAR + REVISAR (elegido por la fundadora) en vez de borrar.

const store = require("./data-store");

const PERIODO_DIAS = 60;                 // ~2 meses
const FLAG_ULTIMA = "catalogo_revision_ultima";
const DAY = 86400000;

function ahoraISO(now) { return new Date(now).toISOString(); }

// Último pedido (fecha ms) por producto del catálogo de compra (por compra_id).
function ultimoPedidoPorCompra() {
  const map = {};
  (store.readAll("pedidos") || []).forEach((p) => {
    const t = p.fecha ? new Date(p.fecha).getTime() : NaN;
    if (!Number.isFinite(t)) return;
    (p.lineas || []).forEach((l) => {
      if (!l.compra_id) return;
      if (!map[l.compra_id] || t > map[l.compra_id]) map[l.compra_id] = t;
    });
  });
  return map;
}

// Candidatos a archivar: no pedidos en `dias` días y con antigüedad suficiente.
function candidatos(now = Date.now(), dias = PERIODO_DIAS) {
  const limite = now - dias * DAY;
  const ultimo = ultimoPedidoPorCompra();
  return (store.readAll("compras_productos") || [])
    .filter((c) => c && c.archivado !== true)
    .filter((c) => {
      const creado = c.creado_en ? new Date(c.creado_en).getTime() : 0;
      if (Number.isFinite(creado) && creado > limite) return false; // demasiado nuevo para juzgar
      const lp = ultimo[c.id];
      return !(lp && lp > limite); // candidato si nunca pedido o último pedido antiguo
    })
    .map((c) => {
      const lp = ultimo[c.id];
      const prov = store.findById("proveedores", c.proveedor_id);
      return {
        id: c.id, nombre: c.nombre, categoria: c.categoria || "Otros",
        proveedor_id: c.proveedor_id, proveedor_nombre: prov ? prov.nombre : c.proveedor_id,
        ultimo_pedido: lp ? ahoraISO(lp) : null,
        dias_sin_pedir: lp ? Math.round((now - lp) / DAY) : null,
        nunca_pedido: !lp,
        creado_en: c.creado_en || null,
      };
    })
    .sort((a, b) => (a.nunca_pedido === b.nunca_pedido ? 0 : a.nunca_pedido ? -1 : 1));
}

function archivados() {
  return (store.readAll("compras_productos") || [])
    .filter((c) => c && c.archivado === true)
    .map((c) => {
      const prov = store.findById("proveedores", c.proveedor_id);
      return {
        id: c.id, nombre: c.nombre, categoria: c.categoria || "Otros",
        proveedor_id: c.proveedor_id, proveedor_nombre: prov ? prov.nombre : c.proveedor_id,
        archivado_en: c.archivado_en || null, archivado_motivo: c.archivado_motivo || null,
      };
    })
    .sort((a, b) => String(b.archivado_en || "").localeCompare(String(a.archivado_en || "")));
}

// ¿Toca revisión? (nunca revisado, o la última fue hace > PERIODO_DIAS).
function estado(now = Date.now()) {
  const cfg = store.findById("config", FLAG_ULTIMA);
  const ultima = cfg && cfg.fecha ? new Date(cfg.fecha).getTime() : null;
  const due = ultima == null ? true : (now - ultima) >= PERIODO_DIAS * DAY;
  const cand = candidatos(now);
  return {
    periodo_dias: PERIODO_DIAS,
    due,
    ultima_revision: ultima != null ? ahoraISO(ultima) : null,
    proxima_revision: ultima != null ? ahoraISO(ultima + PERIODO_DIAS * DAY) : null,
    n_candidatos: cand.length,
    candidatos: cand,
    archivados: archivados(),
  };
}

async function archivar(ids = [], now = Date.now()) {
  const lista = Array.isArray(ids) ? ids : [ids];
  let n = 0;
  lista.forEach((id) => {
    const c = store.findById("compras_productos", id);
    if (c && c.archivado !== true) {
      store.update("compras_productos", id, { archivado: true, archivado_en: ahoraISO(now), archivado_motivo: `No pedido en ${PERIODO_DIAS} días (revisión bimestral)` });
      n++;
    }
  });
  if (n) await store.flush();
  return n;
}

async function recuperar(ids = [], now = Date.now()) {
  const lista = Array.isArray(ids) ? ids : [ids];
  let n = 0;
  lista.forEach((id) => {
    const c = store.findById("compras_productos", id);
    if (c && c.archivado === true) {
      store.update("compras_productos", id, { archivado: false, archivado_en: null, archivado_motivo: null, recuperado_en: ahoraISO(now) });
      n++;
    }
  });
  if (n) await store.flush();
  return n;
}

// Marca la revisión como hecha (reinicia el contador de 2 meses).
async function marcarRevisada(now = Date.now()) {
  const iso = ahoraISO(now);
  if (store.findById("config", FLAG_ULTIMA)) store.update("config", FLAG_ULTIMA, { fecha: iso });
  else store.insert("config", { id: FLAG_ULTIMA, fecha: iso });
  await store.flush();
  return iso;
}

module.exports = { PERIODO_DIAS, FLAG_ULTIMA, candidatos, archivados, estado, archivar, recuperar, marcarRevisada, ultimoPedidoPorCompra };
