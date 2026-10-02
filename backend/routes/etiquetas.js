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
  // Mapa ref(producto) → producto, para estado e inactividad.
  const prodById = {};
  (store.readAll("productos") || []).forEach((p) => { prodById[p.id] = p; });
  const sync = require("../agora-sync");
  // Resuelve vida útil: ficha APPCC (explícita) > vida de receta > null. NUNCA inventada.
  return [...porNombre.values()].map((it) => {
    const ficha = fichas[it.ref];
    const vida = ficha && ficha.vida_util_dias != null ? Number(ficha.vida_util_dias)
      : (it.vida_receta != null ? it.vida_receta : null);
    const p = prodById[it.ref];
    const inactivo = !!(p && (p.activo === false || p.activo_agora === false));
    let estado;
    if (p) estado = sync.estadoProducto(p, ficha);
    else estado = (vida != null) ? "listo" : "appcc_incompleta"; // recetas / preparaciones internas
    const familia = p ? (p.familia || p.categoria || null) : it.categoria;
    const item = {
      ref: it.ref, nombre: it.nombre, categoria: it.categoria, fuente: it.fuente,
      vida_dias: vida, tiene_ficha: !!ficha, estado, inactivo,
      origen: (it.fuente === "agora") ? "Ágora" : (it.fuente === "receta" ? "Elaboración" : "Manual"),
      agora_id: p ? (p.agora_id || null) : null,
      familia, subfamilia: p ? (p.subfamilia || null) : null,
      codigo: p ? (p.codigo || null) : null,
      codigo_barras: p ? (p.codigo_barras || null) : null,
      proveedor: (ficha && ficha.proveedor) || (p && p.proveedor) || null,
      alias: (ficha && Array.isArray(ficha.alias)) ? ficha.alias : [],
      favorito: !!(ficha && ficha.favorito),
      ultima_etiqueta: (ficha && ficha.ultima_etiqueta) || null,
      veces: (ficha && Number(ficha.veces)) || 0,
    };
    // Haystack normalizado para buscar por todos los campos a la vez.
    item._hay = norm([item.nombre, familia, item.subfamilia, item.codigo, item.codigo_barras, item.proveedor, (item.alias || []).join(" ")].filter(Boolean).join(" "));
    return item;
  });
}

// ── Búsqueda difusa y ranking ───────────────────────────────────────────────
function desplural(t) { return t.replace(/(es|s)$/i, "") || t; }
function tokens(s) { return norm(s).split(" ").filter(Boolean).map(desplural); }
function lev(a, b) { // distancia de edición (para errores tipográficos pequeños)
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function casaToken(palabras, t) {
  return palabras.some((w) => {
    const wp = desplural(w);
    if (wp === t) return true;
    if (t.length >= 2 && wp.includes(t)) return true;      // la palabra contiene el término
    if (wp.length >= 3 && t.includes(wp)) return true;     // el término contiene la palabra (evita 'm','x'…)
    if (t.length >= 4 && lev(wp, t) <= 1) return true;     // error tipográfico pequeño
    return false;
  });
}
function buscar(items, qraw) {
  const qn = norm(qraw);
  const qtok = tokens(qraw);
  if (!qtok.length) return items;
  const out = [];
  items.forEach((it) => {
    const palabras = it._hay.split(" ").filter(Boolean);
    if (!qtok.every((t) => casaToken(palabras, t))) return;
    const nombreN = norm(it.nombre);
    out.push({ it, exact: nombreN === qn, starts: nombreN.startsWith(qn) || nombreN.indexOf(qn) >= 0 });
  });
  return ordenar(out);
}
// Orden: 1) exacta 2) favoritos 3) recientes 4) parciales 5) menos usados.
function ordenar(arr) {
  const rec = (x) => (x.it.ultima_etiqueta ? Date.parse(x.it.ultima_etiqueta) || 0 : 0);
  arr.sort((a, b) =>
    (b.exact - a.exact) ||
    (b.it.favorito - a.it.favorito) ||
    (rec(b) - rec(a)) ||
    (b.starts - a.starts) ||
    (b.it.veces - a.it.veces) ||
    String(a.it.nombre).localeCompare(String(b.it.nombre))
  );
  return arr.map((x) => x.it);
}

router.get("/catalogo", (req, res) => {
  const verInactivos = req.query.inactivos === "1" || req.query.inactivos === "true";
  const filtro = String(req.query.filtro || "");
  let out = construirCatalogo();
  if (!verInactivos) out = out.filter((it) => !it.inactivo);
  // Atajos (sin buscador): recientes / favoritos / más usados / pendientes.
  if (filtro === "favoritos") out = out.filter((it) => it.favorito);
  else if (filtro === "recientes") out = out.filter((it) => it.ultima_etiqueta);
  else if (filtro === "pendientes") out = out.filter((it) => it.estado === "appcc_incompleta");
  if (req.query.q) { out = buscar(out, req.query.q); }
  else {
    // Sin búsqueda: favoritos → recientes → más usados → nombre.
    const rec = (x) => (x.ultima_etiqueta ? Date.parse(x.ultima_etiqueta) || 0 : 0);
    out.sort((a, b) => (b.favorito - a.favorito) || (rec(b) - rec(a)) || (b.veces - a.veces) || String(a.nombre).localeCompare(String(b.nombre)));
    if (filtro === "masusados") out.sort((a, b) => (b.veces - a.veces) || String(a.nombre).localeCompare(String(b.nombre)));
    if (filtro === "recientes") out.sort((a, b) => rec(b) - rec(a));
  }
  const lim = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 60));
  out = out.slice(0, lim).map((it) => { const c = { ...it }; delete c._hay; return c; });
  res.json(out);
});

// ── Sincronización de productos desde Ágora (CSV del export de productos) ──
// Solo admin: modifica el catálogo de productos. Preserva ingredientes, PVP propio
// y la ficha APPCC (entidad aparte). Nunca borra: marca inactivo lo que ya no está.
function soloAdminEtq(req, res) {
  if (!req.user || req.user.rol !== "admin") { res.status(403).json({ error: "Solo un administrador puede sincronizar productos desde Ágora." }); return false; }
  return true;
}
router.post("/sync-agora", express.text({ type: ["text/*", "application/csv", "application/octet-stream"], limit: "12mb" }), async (req, res) => {
  if (!soloAdminEtq(req, res)) return;
  try {
    const sync = require("../agora-sync");
    const filas = sync.parseCSV(req.body || "");
    if (!filas.length) return res.status(400).json({ error: "El CSV no tiene filas. Exporta el listado de productos de Ágora a CSV." });
    const productos = store.readAll("productos") || [];
    const now = new Date().toISOString();
    const { upserts, informe } = sync.sincronizar(productos, filas, { now, usuario: (req.user && req.user.nombre) || "" });
    // Aplica upserts (insert/update) sin tocar nada no incluido.
    upserts.forEach((p) => {
      if (store.findById("productos", p.id)) store.update("productos", p.id, p);
      else store.insert("productos", p);
    });
    // Guarda el informe.
    const resumen = {
      nuevos: informe.nuevos.length, actualizados: informe.actualizados.length,
      sin_cambios: informe.sin_cambios.length, posibles_duplicados: informe.posibles_duplicados.length,
      desactivados: informe.desactivados.length, errores: informe.errores.length, total_csv: informe.total_csv,
    };
    const rec = { id: "sync-" + now, fecha: now, usuario: informe.usuario, resumen, detalle: informe };
    store.insert("appcc_sync", rec);
    try {
      require("../auditoria").registrar(req, {
        accion: "sync_agora_productos", entidad: "productos", entidad_id: rec.id,
        resumen: `Sync Ágora: ${resumen.nuevos} nuevos · ${resumen.actualizados} act. · ${resumen.desactivados} baja · ${resumen.posibles_duplicados} dudosos`,
        meta: resumen,
      });
    } catch (e) {}
    await store.flush();
    res.json({ ok: true, resumen, informe });
  } catch (e) {
    res.status(400).json({ error: e.message || "No se pudo sincronizar." });
  }
});

router.get("/sync-agora/ultimo", (req, res) => {
  if (!soloAdminEtq(req, res)) return;
  const all = (store.readAll("appcc_sync") || []).slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  res.json(all[0] || null);
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
  // Campos PROPIOS de APPCC (no se sobrescriben desde Ágora).
  if (b.proveedor != null) campos.proveedor = String(b.proveedor).slice(0, 80);
  if (b.tipo_producto != null) campos.tipo_producto = String(b.tipo_producto).slice(0, 60);
  if (b.tipo_fecha != null) campos.tipo_fecha = String(b.tipo_fecha).slice(0, 20); // "caducidad" | "consumo_preferente"
  if (b.temperatura != null) campos.temperatura = String(b.temperatura).slice(0, 40);
  if (b.instrucciones_apertura != null) campos.instrucciones_apertura = String(b.instrucciones_apertura).slice(0, 200);
  if (b.plantilla != null) campos.plantilla = String(b.plantilla).slice(0, 40);
  if (b.favorito != null) campos.favorito = !!b.favorito;
  if (b.impresion_rapida != null) campos.impresion_rapida = !!b.impresion_rapida;
  if (b.necesita_lote_original != null) campos.necesita_lote_original = !!b.necesita_lote_original;
  if (b.necesita_caducidad_original != null) campos.necesita_caducidad_original = !!b.necesita_caducidad_original;
  if (b.etiquetas_default != null) { const n = parseInt(b.etiquetas_default, 10); if (Number.isFinite(n) && n > 0) campos.etiquetas_default = Math.min(99, n); }
  if (Array.isArray(b.alias)) campos.alias = b.alias.map((a) => String(a).slice(0, 60)).slice(0, 10);
  campos.nombre_visto = String(b.nombre || prev.nombre_visto || "").slice(0, 120); // último nombre conocido (informativo)
  campos.actualizado_en = new Date().toISOString();
  campos.actualizado_por = (req.user && req.user.nombre) || "";
  if (store.findById("appcc_fichas", ref)) store.update("appcc_fichas", ref, campos);
  else store.insert("appcc_fichas", { ...prev, ...campos });
  await store.flush();
  res.json({ ok: true, ficha: store.findById("appcc_fichas", ref) });
});

// Registra el USO al etiquetar (para "última vez etiquetado" y ranking de uso).
router.post("/uso/:ref", express.json(), async (req, res) => {
  const ref = decodeURIComponent(req.params.ref);
  const copies = Math.max(1, parseInt((req.body && req.body.copies), 10) || 1);
  const prev = store.findById("appcc_fichas", ref) || { id: ref };
  const campos = { id: ref, veces: (Number(prev.veces) || 0) + copies, ultima_etiqueta: new Date().toISOString() };
  if (store.findById("appcc_fichas", ref)) store.update("appcc_fichas", ref, campos);
  else store.insert("appcc_fichas", { ...prev, ...campos });
  await store.flush();
  res.json({ ok: true, veces: campos.veces, ultima_etiqueta: campos.ultima_etiqueta });
});

// Marca/desmarca favorito.
router.post("/favorito/:ref", express.json(), async (req, res) => {
  const ref = decodeURIComponent(req.params.ref);
  const fav = !!(req.body && req.body.favorito);
  const prev = store.findById("appcc_fichas", ref) || { id: ref };
  const campos = { id: ref, favorito: fav };
  if (store.findById("appcc_fichas", ref)) store.update("appcc_fichas", ref, campos);
  else store.insert("appcc_fichas", { ...prev, ...campos });
  await store.flush();
  res.json({ ok: true, favorito: fav });
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
