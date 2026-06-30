// AUDITORÍA · registro append-only de acciones críticas.
//
// Deja rastro de quién hizo qué y cuándo en lo que importa para seguridad
// alimentaria y control de stock: bajas de lote, recepciones, ajustes/mermas,
// etiquetas, cambios de estado. Nunca se modifica ni se borra (solo se añade).
//
// Cada evento lleva el local_id del usuario → preparado para multi-local.

const store = require("./data-store");

// Registra un evento. `req` aporta el usuario en sesión (req.user); si no hay
// (cron/sistema), queda como "Sistema". Devuelve el evento creado.
function registrar(req, { accion, entidad = null, entidad_id = null, resumen = "", meta = null }) {
  const u = (req && req.user) || {};
  const evento = {
    id: store.nextId("aud", "auditoria"),
    fecha: new Date().toISOString(),
    usuario_key: u.key || "sistema",
    usuario_nombre: u.nombre || "Sistema",
    local_id: u.local_id || "principal",
    accion,
    entidad,
    entidad_id,
    resumen,
    meta,
  };
  store.insert("auditoria", evento);
  return evento;
}

// Lista filtrable (más reciente primero). Filtros: accion, entidad, local_id,
// desde/hasta (ISO), q (texto en resumen), limit.
function listar(filtros = {}) {
  let items = store.readAll("auditoria").slice().reverse();
  const { accion, entidad, local_id, desde, hasta, q } = filtros;
  if (accion) items = items.filter((e) => e.accion === accion);
  if (entidad) items = items.filter((e) => e.entidad === entidad);
  if (local_id) items = items.filter((e) => (e.local_id || "principal") === local_id);
  if (desde) items = items.filter((e) => e.fecha >= desde);
  if (hasta) items = items.filter((e) => e.fecha <= hasta);
  if (q) {
    const s = String(q).toLowerCase();
    items = items.filter((e) => (e.resumen || "").toLowerCase().includes(s) || (e.usuario_nombre || "").toLowerCase().includes(s));
  }
  const limit = Number(filtros.limit) || 200;
  return items.slice(0, limit);
}

module.exports = { registrar, listar };
