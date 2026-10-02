const express = require("express");
const store = require("../data-store");
const labelService = require("../label-service");

const router = express.Router();

router.get("/", (req, res) => {
  res.json(store.readAll("etiquetas").slice().reverse());
});

// ── Catálogo de etiquetas de producción (buscador) ──────────────────────────
// FUENTE: productos de ÁGORA + resto de la carta + recetas (elaboraciones) +
// preparaciones internas (etiquetas_catalogo). Se deduplica por nombre
// normalizado (ignora mayúsculas, espacios y tildes). La VIDA ÚTIL nunca se
// inventa: sale de la ficha APPCC (explícita) o de la receta; si no, queda null
// y hay que introducirla en la ficha antes de poder caducar la etiqueta.
function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); }

// Mapa ref → ficha APPCC (vida útil explícita + manipulación).
function fichasPorRef() {
  const m = {};
  (store.readAll("appcc_fichas") || []).forEach((f) => { if (f && f.id) m[f.id] = f; });
  return m;
}
// Construye la lista completa de ítems etiquetables con su ref ESTABLE.
function construirCatalogo() {
  const fichas = fichasPorRef();
  const items = [];
  // 1) Productos (Ágora + carta). ref = id del producto → estable ante cambios de Ágora.
  (store.readAll("productos") || []).filter((p) => p.activo !== false).forEach((p) => {
    const esAgora = String(p.id).startsWith("prod-agora") || !!p.agora_ref;
    items.push({ ref: p.id, nombre: p.nombre, categoria: p.categoria || "Producto", fuente: esAgora ? "agora" : "producto" });
  });
  // 2) Recetas (elaboraciones) — su vida útil real se usa como fallback.
  (store.readAll("recetas") || []).forEach((r) => {
    items.push({ ref: "rec:" + r.id, nombre: r.nombre, categoria: "Elaboración", fuente: "receta",
      vida_receta: r.vida_util_horas != null ? Math.round((r.vida_util_horas / 24) * 10) / 10 : null });
  });
  // 3) Preparaciones internas del catálogo editable.
  (store.readAll("etiquetas_catalogo") || []).forEach((c) => {
    items.push({ ref: c.id, nombre: c.nombre, categoria: c.categoria || "Preparación", fuente: "catalogo" });
  });
  // Dedupe por nombre normalizado (preferencia: agora > producto > receta > catalogo).
  const prio = { agora: 0, producto: 1, receta: 2, catalogo: 3 };
  const porNombre = new Map();
  items.forEach((it) => {
    const k = norm(it.nombre); if (!k) return;
    const prev = porNombre.get(k);
    if (!prev || (prio[it.fuente] ?? 9) < (prio[prev.fuente] ?? 9)) porNombre.set(k, it);
  });
  // Resuelve vida útil: ficha APPCC (explícita) > vida de receta > null. NUNCA inventada.
  return [...porNombre.values()].map((it) => {
    const ficha = fichas[it.ref];
    const vida = ficha && ficha.vida_util_dias != null ? Number(ficha.vida_util_dias)
      : (it.vida_receta != null ? it.vida_receta : null);
    return { ref: it.ref, nombre: it.nombre, categoria: it.categoria, fuente: it.fuente,
      vida_dias: vida, tiene_ficha: !!ficha };
  });
}

router.get("/catalogo", (req, res) => {
  const q = norm(req.query.q);
  let out = construirCatalogo();
  if (q) out = out.filter((it) => norm(it.nombre).includes(q));
  out.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  res.json(out);
});

// ── Ficha APPCC de un producto (vida útil + manipulación), por ref ESTABLE ──
// Se guarda aparte de Ágora: aunque Ágora cambie nombre/precio/familia, la ficha
// permanece ligada al ref (id de producto / rec:id / etc-slug).
router.get("/ficha/:ref", (req, res) => {
  const ref = decodeURIComponent(req.params.ref);
  const f = store.findById("appcc_fichas", ref) || null;
  // Fallback de vida: receta (dato real existente), nunca inventado.
  let vidaReceta = null;
  if (ref.startsWith("rec:")) { const r = store.findById("recetas", ref.slice(4)); if (r && r.vida_util_horas != null) vidaReceta = Math.round((r.vida_util_horas / 24) * 10) / 10; }
  res.json({ ref, ficha: f, vida_receta: vidaReceta });
});

router.post("/ficha/:ref", express.json(), async (req, res) => {
  const ref = decodeURIComponent(req.params.ref);
  const b = req.body || {};
  const prev = store.findById("appcc_fichas", ref) || {};
  const campos = { id: ref };
  // vida útil: solo si viene un número explícito (>0). No se inventa; vacío = sin fijar.
  if (b.vida_util_dias === null || b.vida_util_dias === "") campos.vida_util_dias = null;
  else if (b.vida_util_dias != null) { const v = Number(b.vida_util_dias); if (Number.isFinite(v) && v >= 0) campos.vida_util_dias = v; }
  if (b.conservacion != null) campos.conservacion = String(b.conservacion).slice(0, 80);
  if (b.notas != null) campos.notas = String(b.notas).slice(0, 400);
  if (Array.isArray(b.alergenos)) campos.alergenos = b.alergenos.map((a) => String(a).slice(0, 40)).slice(0, 20);
  campos.nombre_visto = String(b.nombre || prev.nombre_visto || "").slice(0, 120); // último nombre conocido (informativo)
  campos.actualizado_en = new Date().toISOString();
  campos.actualizado_por = (req.user && req.user.nombre) || "";
  if (store.findById("appcc_fichas", ref)) store.update("appcc_fichas", ref, campos);
  else store.insert("appcc_fichas", { ...prev, ...campos });
  await store.flush();
  res.json({ ok: true, ficha: store.findById("appcc_fichas", ref) });
});

// Añadir una preparación interna al catálogo (lo que NO está en Ágora/recetas).
// NO se fija vida útil aquí (no se inventa): se hace en la ficha APPCC.
router.post("/catalogo", express.json(), async (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || "").trim();
  if (!nombre) return res.status(400).json({ error: "Indica el nombre del producto." });
  // Evitar duplicar algo que ya existe (Ágora/receta/catálogo) por nombre normalizado.
  const existe = construirCatalogo().find((it) => norm(it.nombre) === norm(nombre));
  if (existe) return res.json({ ok: true, item: existe, ya_existia: true });
  const id = require("../seed-etiquetas").slug(nombre);
  const campos = { id, nombre, vida_dias: null, categoria: String(b.categoria || "Preparación").trim() || "Preparación" };
  if (store.findById("etiquetas_catalogo", id)) store.update("etiquetas_catalogo", id, campos);
  else store.insert("etiquetas_catalogo", { ...campos, creado_en: new Date().toISOString() });
  await store.flush();
  res.json({ ok: true, item: { ref: id, nombre, categoria: campos.categoria, fuente: "catalogo", vida_dias: null, tiene_ficha: false } });
});

// Historial de impresiones (todas, persistente en BD).
router.get("/historial", (req, res) => {
  res.json(store.readAll("impresiones").slice().reverse());
});

router.get("/lote/:loteId", (req, res) => {
  const etiquetas = store.readAll("etiquetas").filter((e) => e.lote_id === req.params.loteId);
  res.json(etiquetas.slice().reverse());
});

router.post("/:id/reimprimir", (req, res) => {
  const etiqueta = labelService.registrarImpresion(req.params.id, {
    usuario: req.body.usuario,
    impresora: req.body.impresora || "Navegador",
  });
  if (!etiqueta) return res.status(404).json({ error: "Etiqueta no encontrada" });
  require("../auditoria").registrar(req, {
    accion: "etiqueta_impresa",
    entidad: "etiquetas",
    entidad_id: etiqueta.id,
    resumen: `Reimpresión de etiqueta ${etiqueta.codigo_lote || etiqueta.id}`,
    meta: { lote_id: etiqueta.lote_id },
  });
  res.json(etiqueta);
});

module.exports = router;
