const express = require("express");
const store = require("../data-store");
const costing = require("../costing");
const M = require("../mermas-motivos");

const router = express.Router();

// Motivos + secciones + unidades (para pintar el formulario).
router.get("/motivos", (req, res) => {
  res.json({ motivos: M.MERMAS_MOTIVOS, secciones: M.secciones(), unidades: M.UNIDADES });
});

// Resuelve nombre + coste estimado (€) + materia a descontar, desde el ref del
// catálogo. El coste SIEMPRE se deriva de costing.js (única fuente del dinero).
function resolver(ref, nombre, cantidad) {
  const obj = M.resolverObjetivo(ref);
  let coste = 0, objetivo_nombre = nombre || "", deducirMateria = null;
  if (obj.tipo === "materia") {
    const materia = store.findById("materias", obj.id);
    if (materia) { objetivo_nombre = materia.nombre; coste = Math.round((Number(materia.coste_medio) || 0) * cantidad * 100) / 100; deducirMateria = materia; }
  } else if (obj.tipo === "receta") {
    const receta = store.findById("recetas", obj.id);
    if (receta) { objetivo_nombre = receta.nombre; const idx = costing.indiceMaterias(store.readAll("materias")); coste = Math.round((costing.costePorUnidad(receta, idx) || 0) * cantidad * 100) / 100; }
  } else if (obj.tipo === "producto") {
    const prod = store.findById("productos", obj.id);
    if (prod) { objetivo_nombre = prod.nombre; const idx = costing.indiceMaterias(store.readAll("materias")); coste = Math.round((costing.costeProducto(prod, idx) || 0) * cantidad * 100) / 100; }
  }
  return { obj, coste, objetivo_nombre, deducirMateria };
}

// Listado de mermas (= entidad `ajustes`). ?hoy=1 solo hoy; ?ref= filtra producto.
// El equipo NUNCA ve coste (regla de negocio).
router.get("/", (req, res) => {
  let lista = (store.readAll("ajustes") || []).slice().reverse();
  if (req.query.hoy === "1") { const hoy = new Date().toDateString(); lista = lista.filter((a) => a.fecha && new Date(a.fecha).toDateString() === hoy); }
  if (req.query.ref) lista = lista.filter((a) => a.ref === req.query.ref);
  const esAdmin = req.user && req.user.rol === "admin";
  const lim = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  const out = lista.slice(0, lim).map((a) => {
    const c = { id: a.id, ref: a.ref || null, producto: a.objetivo_nombre || a.objetivo_id, cantidad: a.cantidad, unidad: a.unidad || "", motivo: a.motivo, grupo: a.grupo || "", responsable: a.responsable, observacion: a.observacion, fecha: a.fecha };
    if (esAdmin) c.coste_estimado = a.coste_estimado || 0;
    return c;
  });
  res.json(out);
});

// Registrar una merma (un movimiento). Valida con mensajes concretos; guarda en
// `ajustes` (única fuente), descuenta stock SOLO en materias, y audita.
router.post("/", express.json(), async (req, res) => {
  const b = req.body || {};
  const val = M.validar(b);
  if (!val.ok) return res.status(400).json({ error: "Faltan datos de la merma.", errores: val.errores });
  const mot = M.motivo(b.motivo);
  const cantidad = M.parseCantidad(b.cantidad);
  const unidad = M.UNIDADES.includes(b.unidad) ? b.unidad : (b.unidad ? String(b.unidad).slice(0, 10) : "ud");
  const { obj, coste, objetivo_nombre, deducirMateria } = resolver(b.ref, b.nombre, cantidad);
  if (deducirMateria) {
    const nuevo = Math.max(0, Math.round(((Number(deducirMateria.disponibilidad_actual) || 0) - cantidad) * 100) / 100);
    store.update("materias", deducirMateria.id, { disponibilidad_actual: nuevo });
  }
  const ahora = new Date().toISOString();
  const ajuste = {
    id: store.nextId("aju", "ajustes"),
    tipo_objetivo: obj.tipo, objetivo_id: obj.id,
    objetivo_nombre: objetivo_nombre || b.nombre || obj.id,
    ref: b.ref || null,
    cantidad, unidad,
    motivo: mot.t,            // etiqueta (compatible con los informes que agrupan por motivo)
    grupo: mot.grupo,
    coste_estimado: coste,
    responsable: (req.user && req.user.nombre) || b.responsable || "Sin asignar",
    observacion: b.observacion ? String(b.observacion).slice(0, 300) : "",
    origen: "mermas",
    fecha: ahora,
  };
  store.insert("ajustes", ajuste);
  try {
    require("../auditoria").registrar(req, {
      accion: "merma_registrada", entidad: "ajustes", entidad_id: ajuste.id,
      resumen: `Merma: ${ajuste.objetivo_nombre} · ${cantidad} ${unidad} · ${mot.t}`,
      meta: { motivo: mot.k, grupo: mot.grupo, coste: coste },
    });
  } catch (e) {}
  await store.flush();
  const esAdmin = req.user && req.user.rol === "admin";
  const merma = { id: ajuste.id, producto: ajuste.objetivo_nombre, cantidad, unidad, motivo: mot.t, fecha: ahora };
  if (esAdmin) merma.coste_estimado = coste;
  res.json({ ok: true, merma });
});

// Resumen económico (SOLO admin): totales por motivo y por grupo, con € perdido.
router.get("/resumen", (req, res) => {
  if (!req.user || req.user.rol !== "admin") return res.status(403).json({ error: "Solo un administrador puede ver el resumen económico de mermas." });
  const rango = String(req.query.rango || "hoy");
  const desde = new Date(); desde.setHours(0, 0, 0, 0);
  if (rango === "semana") desde.setDate(desde.getDate() - 7);
  else if (rango === "mes") desde.setDate(desde.getDate() - 30);
  const lista = (store.readAll("ajustes") || []).filter((a) => a.fecha && new Date(a.fecha).getTime() >= desde.getTime());
  const por_motivo = {}, por_grupo = {};
  let total = 0;
  lista.forEach((a) => {
    const c = Number(a.coste_estimado) || 0; total += c;
    por_motivo[a.motivo || "otro"] = Math.round(((por_motivo[a.motivo || "otro"] || 0) + c) * 100) / 100;
    const g = a.grupo || "otros"; por_grupo[g] = Math.round(((por_grupo[g] || 0) + c) * 100) / 100;
  });
  res.json({ rango, n: lista.length, total: Math.round(total * 100) / 100, por_motivo, por_grupo });
});

module.exports = router;
