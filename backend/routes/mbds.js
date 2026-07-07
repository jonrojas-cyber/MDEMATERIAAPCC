// MATERIA BEVERAGE DESIGN SYSTEM · API del laboratorio de bebidas.
// CRUD de biblioteca sensorial, cordiales, bebidas, catas y lotes. Compone el
// motor (mbds-engine): calcula parámetros, valida "Materia Apta" y propone
// correcciones. Los datos económicos (coste/PVP/margen) solo se sirven a la
// dirección; el equipo ve receta/proceso/lote (modo trabajador).

const express = require("express");
const store = require("../data-store");
const eng = require("../mbds-engine");

const router = express.Router();
const jsonGrande = express.json({ limit: "4mb" });

function esAdmin(req) { return req.user && req.user.rol === "admin"; }
const ings = () => store.readAll("mbds_ingredientes");
const cordiales = () => store.readAll("mbds_cordiales");
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

// Sensorial de la última cata de una bebida (o su objetivo si no hay catas).
function sensorialDe(bebidaId, objetivo) {
  const cs = store.readAll("mbds_catas").filter((c) => c.bebida_id === bebidaId)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  if (cs.length) { const c = cs[0]; return { drinkability: c.drinkability, persistencia: c.persistencia, salivacion: c.salivacion, dulzor: c.dulzor, amargor: c.amargor, aromatica: c.aromatica, acidez: c.acidez, carbonatacion: c.carbonatacion, fuente: "cata", cata_id: c.id, fecha: c.fecha }; }
  return { ...(objetivo || {}), fuente: "objetivo" };
}

// Quita del objeto los campos económicos (para el modo trabajador).
function sinEconomia(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const ECON = new Set(["coste_total", "coste_por_litro", "coste_por_servicio", "pvp", "pvp_recomendado", "food_cost_pct", "margen_pct", "coste"]);
  const limpio = Array.isArray(obj) ? obj.map(sinEconomia) : {};
  if (Array.isArray(obj)) return limpio;
  for (const k of Object.keys(obj)) {
    if (ECON.has(k)) continue;
    limpio[k] = (obj[k] && typeof obj[k] === "object") ? sinEconomia(obj[k]) : obj[k];
  }
  return limpio;
}

function cordialEnriquecido(c, ingredientes) {
  return { ...c, calc: eng.calcularCordial(c, ingredientes || ings()) };
}

function bebidaEnriquecida(b, ingredientes) {
  const IG = ingredientes || ings();
  const cor = cordiales().find((c) => c.id === b.cordial_id) || null;
  const cordialCalc = cor ? eng.calcularCordial(cor, IG) : null;
  const calc = eng.calcularBebida(b, cordialCalc, IG);
  const sensorial = sensorialDe(b.id, b.objetivo_sensorial);
  const alcoholica = (b.version || "alcoholica") === "alcoholica";
  const validacion = eng.validar(calc, sensorial, alcoholica);
  const correccion = validacion.apta ? [] : eng.corregir(calc, sensorial);
  return { ...b, cordial_nombre: cor ? cor.nombre : null, calc, cordial_calc: cordialCalc, sensorial, validacion, correccion };
}

// ── META (estándar, funciones sensoriales, taxonomías) ──────────────────────
router.get("/meta", (req, res) => {
  res.json({
    standards: eng.STANDARDS,
    funciones_sensoriales: eng.FUNCIONES_SENSORIALES,
    familias: ["Ámbar", "Blanco", "Rojo", "Verde", "Otro"],
    versiones: ["alcoholica", "0.0"],
    categorias_ingrediente: ["Fruta", "Vegetal", "Botánico", "Especia", "Ácido", "Mineral", "Endulzante", "Base", "Base alcohólica", "Vino", "Otro"],
  });
});

// ── BIBLIOTECA SENSORIAL (ingredientes) ─────────────────────────────────────
router.get("/ingredientes", (req, res) => {
  const admin = esAdmin(req);
  const lista = ings().map((i) => (admin ? i : sinEconomia(i)));
  res.json(lista);
});
router.post("/ingredientes", jsonGrande, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección crea ingredientes." });
  const b = req.body || {};
  if (!String(b.nombre || "").trim()) return res.status(400).json({ error: "Indica el nombre del ingrediente." });
  const ing = {
    id: store.nextId("ing", "mbds_ingredientes"),
    nombre: String(b.nombre).trim(), categoria: b.categoria || "Otro", funcion_sensorial: b.funcion_sensorial || "",
    proveedor: b.proveedor || "", coste: num(b.coste), abv: num(b.abv), brix: num(b.brix), ph: num(b.ph),
    densidad: num(b.densidad) || 1, alergenos: Array.isArray(b.alergenos) ? b.alergenos : [], vida_util_dias: num(b.vida_util_dias) || null,
    temperatura: b.temperatura || "", notas_sensoriales: b.notas_sensoriales || "", materia_id: b.materia_id || null,
    creado_en: new Date().toISOString(),
  };
  store.insert("mbds_ingredientes", ing); await store.flush();
  res.status(201).json(ing);
});
router.put("/ingredientes/:id", jsonGrande, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección edita ingredientes." });
  if (!store.findById("mbds_ingredientes", req.params.id)) return res.status(404).json({ error: "Ingrediente no encontrado" });
  const b = req.body || {}; const patch = {};
  ["nombre", "categoria", "funcion_sensorial", "proveedor", "temperatura", "notas_sensoriales", "materia_id"].forEach((k) => { if (b[k] != null) patch[k] = b[k]; });
  ["coste", "abv", "brix", "ph", "densidad", "vida_util_dias"].forEach((k) => { if (b[k] != null && b[k] !== "") patch[k] = num(b[k]); });
  if (Array.isArray(b.alergenos)) patch.alergenos = b.alergenos;
  const upd = store.update("mbds_ingredientes", req.params.id, patch); await store.flush();
  res.json(upd);
});
router.delete("/ingredientes/:id", async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección borra ingredientes." });
  store.remove("mbds_ingredientes", req.params.id); await store.flush();
  res.json({ ok: true });
});

// ── CORDIALES ───────────────────────────────────────────────────────────────
router.get("/cordiales", (req, res) => {
  const admin = esAdmin(req); const IG = ings();
  const lista = cordiales().map((c) => { const e = cordialEnriquecido(c, IG); return admin ? e : sinEconomia(e); });
  res.json(lista);
});
router.get("/cordiales/:id", (req, res) => {
  const c = store.findById("mbds_cordiales", req.params.id);
  if (!c) return res.status(404).json({ error: "Cordial no encontrado" });
  const e = cordialEnriquecido(c);
  res.json(esAdmin(req) ? e : sinEconomia(e));
});
function camposCordial(b) {
  const c = {};
  ["nombre", "familia", "descripcion", "metodo", "temperatura", "tiempo", "filtrado"].forEach((k) => { if (b[k] != null) c[k] = b[k]; });
  ["rendimiento_ml", "merma_pct", "vida_util_dias"].forEach((k) => { if (b[k] != null && b[k] !== "") c[k] = num(b[k]); });
  if (Array.isArray(b.ingredientes)) c.ingredientes = b.ingredientes.map((x) => ({ ingrediente_id: x.ingrediente_id, cantidad: num(x.cantidad) }));
  if (b.objetivo_sensorial && typeof b.objetivo_sensorial === "object") c.objetivo_sensorial = b.objetivo_sensorial;
  return c;
}
router.post("/cordiales", jsonGrande, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección crea cordiales." });
  const b = req.body || {};
  if (!String(b.nombre || "").trim()) return res.status(400).json({ error: "Indica el nombre del cordial." });
  const c = { id: store.nextId("cor", "mbds_cordiales"), ingredientes: [], objetivo_sensorial: {}, ...camposCordial(b), creado_en: new Date().toISOString() };
  store.insert("mbds_cordiales", c); await store.flush();
  res.status(201).json(cordialEnriquecido(c));
});
router.put("/cordiales/:id", jsonGrande, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección edita cordiales." });
  if (!store.findById("mbds_cordiales", req.params.id)) return res.status(404).json({ error: "Cordial no encontrado" });
  const upd = store.update("mbds_cordiales", req.params.id, camposCordial(req.body || {})); await store.flush();
  res.json(cordialEnriquecido(upd));
});
router.delete("/cordiales/:id", async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección borra cordiales." });
  store.remove("mbds_cordiales", req.params.id); await store.flush();
  res.json({ ok: true });
});

// ── BEBIDAS FINALES ──────────────────────────────────────────────────────────
router.get("/bebidas", (req, res) => {
  const admin = esAdmin(req); const IG = ings();
  const lista = store.readAll("mbds_bebidas").map((b) => { const e = bebidaEnriquecida(b, IG); return admin ? e : sinEconomia(e); });
  res.json(lista);
});
router.get("/bebidas/:id", (req, res) => {
  const b = store.findById("mbds_bebidas", req.params.id);
  if (!b) return res.status(404).json({ error: "Bebida no encontrada" });
  const e = bebidaEnriquecida(b);
  e.catas = store.readAll("mbds_catas").filter((c) => c.bebida_id === b.id).sort((a, b2) => (a.fecha < b2.fecha ? 1 : -1));
  e.lotes = store.readAll("mbds_lotes").filter((l) => l.bebida_id === b.id).sort((a, b2) => (a.fecha < b2.fecha ? 1 : -1));
  res.json(esAdmin(req) ? e : sinEconomia(e));
});
function camposBebida(b) {
  const c = {};
  ["nombre", "familia", "version", "cordial_id", "presion", "temperatura", "tiempo_carbo", "envase"].forEach((k) => { if (b[k] != null) c[k] = b[k]; });
  ["cordial_ml", "cordial_abv", "volumen_total", "co2", "servicio_ml", "pvp"].forEach((k) => { if (b[k] != null && b[k] !== "") c[k] = num(b[k]); });
  if (Array.isArray(b.componentes)) c.componentes = b.componentes.map((x) => ({ ingrediente_id: x.ingrediente_id, ml: num(x.ml) }));
  if (b.objetivo_sensorial && typeof b.objetivo_sensorial === "object") c.objetivo_sensorial = b.objetivo_sensorial;
  return c;
}
router.post("/bebidas", jsonGrande, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección crea bebidas." });
  const b = req.body || {};
  if (!String(b.nombre || "").trim()) return res.status(400).json({ error: "Indica el nombre de la bebida." });
  const bebida = { id: store.nextId("beb", "mbds_bebidas"), version: "alcoholica", componentes: [], co2: eng.STANDARDS.co2.obj, servicio_ml: eng.STANDARDS.servicio_ml, ...camposBebida(b), creado_en: new Date().toISOString() };
  store.insert("mbds_bebidas", bebida); await store.flush();
  res.status(201).json(bebidaEnriquecida(bebida));
});
router.put("/bebidas/:id", jsonGrande, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección edita bebidas." });
  if (!store.findById("mbds_bebidas", req.params.id)) return res.status(404).json({ error: "Bebida no encontrada" });
  const upd = store.update("mbds_bebidas", req.params.id, camposBebida(req.body || {})); await store.flush();
  res.json(bebidaEnriquecida(upd));
});
router.delete("/bebidas/:id", async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección borra bebidas." });
  store.remove("mbds_bebidas", req.params.id); await store.flush();
  res.json({ ok: true });
});

// Cálculo/validación al vuelo (para el editor en vivo, sin guardar).
router.post("/calcular", jsonGrande, (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ error: "Solo la dirección." });
  const b = req.body || {};
  const e = bebidaEnriquecida({ ...b, id: b.id || "tmp" });
  res.json(e);
});

// ── CATAS ─────────────────────────────────────────────────────────────────
router.get("/catas", (req, res) => {
  const q = req.query.bebida_id;
  let cs = store.readAll("mbds_catas");
  if (q) cs = cs.filter((c) => c.bebida_id === q);
  res.json(cs.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
});
router.post("/catas", jsonGrande, async (req, res) => {
  const b = req.body || {};
  if (!b.bebida_id || !store.findById("mbds_bebidas", b.bebida_id)) return res.status(400).json({ error: "Indica la bebida catada." });
  const cata = {
    id: store.nextId("cat", "mbds_catas"), bebida_id: b.bebida_id, persona: b.persona || (req.user && req.user.nombre) || "",
    fecha: b.fecha || new Date().toISOString(),
    acidez: num(b.acidez), dulzor: num(b.dulzor), amargor: num(b.amargor), aromatica: num(b.aromatica),
    carbonatacion: num(b.carbonatacion), persistencia: num(b.persistencia), salivacion: num(b.salivacion), drinkability: num(b.drinkability),
    observaciones: b.observaciones || "", creado_en: new Date().toISOString(),
  };
  store.insert("mbds_catas", cata); await store.flush();
  res.status(201).json(cata);
});

// ── LOTES DE PRODUCCIÓN ──────────────────────────────────────────────────────
router.get("/lotes", (req, res) => {
  const q = req.query.bebida_id;
  let ls = store.readAll("mbds_lotes");
  if (q) ls = ls.filter((l) => l.bebida_id === q);
  res.json(ls.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)));
});
router.post("/lotes", jsonGrande, async (req, res) => {
  const b = req.body || {};
  if (!b.bebida_id || !store.findById("mbds_bebidas", b.bebida_id)) return res.status(400).json({ error: "Indica la bebida producida." });
  const bebida = store.findById("mbds_bebidas", b.bebida_id);
  const lote = {
    id: store.nextId("lot", "mbds_lotes"), bebida_id: b.bebida_id, bebida_nombre: bebida.nombre,
    numero_lote: b.numero_lote || `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${(bebida.nombre || "").slice(0, 3).toUpperCase()}`,
    fecha: b.fecha || new Date().toISOString(), operario: b.operario || (req.user && req.user.nombre) || "",
    temperatura: b.temperatura || "", tiempo: b.tiempo || "", presion: b.presion || "", co2: num(b.co2) || bebida.co2,
    resultado: b.resultado || "OK", merma_pct: num(b.merma_pct), observaciones: b.observaciones || "",
    creado_en: new Date().toISOString(),
  };
  store.insert("mbds_lotes", lote); await store.flush();
  res.status(201).json(lote);
});

module.exports = router;
