// LIMPIEZA DE PRODUCCIÓN · deja en el almacén y en las recetas SOLO lo que se usa.
//
// Regla de la fundadora: cualquier ingrediente/elaboración de producción que no
// esté (directa o indirectamente) al servicio de un producto que se VENDE debe
// desaparecer, para tener una app más eficiente. "Lo que se vende" = productos
// activos con PVP (catálogo de Ágora + carta ya sembrada). Baja REVERSIBLE
// (`activo:false` + motivo), nunca borrado: si algo se cae por error, se recupera.
//
// El método es un CIERRE TRANSITIVO por el escandallo (no un match de nombres):
// se parte de los productos vendidos, se recogen sus materias, y de cada materia
// que es una ELABORACIÓN (la produce una receta) se recogen también las materias
// de esa receta, recursivamente. Así jamás se da de baja un sub-ingrediente que
// compone algo que sí se vende (matcha base, cold brew, salsa verde, dukkah…).
//
// `computar(datos)` es puro (inyectable para tests). `aplicar(st)` es idempotente
// por flag y actúa sobre el store activo (Postgres en producción, JSON en local).

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Un producto protege sus ingredientes si está EN EL MENÚ (activo). No se exige
// PVP > 0: un producto real con precio pendiente (o un add-on gratis, p. ej.
// "Leche fresca 0,00") sigue siendo real y no debe perder sus ingredientes. Solo
// los productos ARCHIVADOS (activo:false) dejan de proteger.
function esVendido(p) {
  return p && p.activo !== false;
}

// Índices para enlazar una materia con la receta que la produce (elaboración).
// Enlace primario por `produce_materia_id`; secundario por nombre normalizado
// (protege elaboraciones cuya receta no rellenó `produce_materia_id`).
function indicesRecetas(recetas) {
  const porProduce = {};   // materia_id → receta
  const porNombre = {};    // nombre normalizado → receta
  (recetas || []).forEach((r) => {
    if (r && r.produce_materia_id) porProduce[r.produce_materia_id] = r;
    if (r && r.nombre) porNombre[norm(r.nombre)] = r;
  });
  return { porProduce, porNombre };
}

// Cierre transitivo: qué materias y recetas quedan EN USO por lo que se vende.
function computar(datos) {
  const productos = datos.productos || [];
  const materias = datos.materias || [];
  const recetas = datos.recetas || [];
  const matById = {}; materias.forEach((m) => (matById[m.id] = m));
  const { porProduce, porNombre } = indicesRecetas(recetas);

  const keepMat = new Set();
  const keepRec = new Set();

  function visitarMateria(materiaId) {
    if (!materiaId || keepMat.has(materiaId)) return;
    keepMat.add(materiaId);
    // ¿La produce una receta? (elaboración) → mantener la receta y sus ingredientes.
    const m = matById[materiaId];
    let rec = porProduce[materiaId];
    if (!rec && m && porNombre[norm(m.nombre)]) rec = porNombre[norm(m.nombre)];
    if (rec) {
      keepRec.add(rec.id);
      (rec.ingredientes || []).forEach((ing) => visitarMateria(ing.materia_id));
    }
  }

  productos.filter(esVendido).forEach((p) => {
    (p.ingredientes || []).forEach((ing) => visitarMateria(ing.materia_id));
  });

  // Materias huérfanas = activas y NO alcanzadas por ningún producto vendido.
  const materiasBaja = materias.filter((m) => m.activo !== false && !keepMat.has(m.id)).map((m) => m.id);
  // Recetas huérfanas = no producen (ni por id ni por nombre) ninguna materia en uso.
  const recetasBaja = recetas.filter((r) => r.activo !== false && !keepRec.has(r.id)).map((r) => r.id);

  return { keepMat: [...keepMat], keepRec: [...keepRec], materiasBaja, recetasBaja };
}

const FLAG = "limpieza_produccion_v1";
const MOTIVO = "Sin uso en ningún producto vendido (limpieza de producción)";

function aplicar(st) {
  const cfg = st.readAll("config") || [];
  if (cfg.some((c) => c && c.id === FLAG)) return { ranAny: false, materias: 0, recetas: 0 };

  const plan = computar({
    productos: st.readAll("productos") || [],
    materias: st.readAll("materias") || [],
    recetas: st.readAll("recetas") || [],
  });

  const ahora = new Date().toISOString();
  plan.materiasBaja.forEach((id) => st.update("materias", id, { activo: false, archivado_motivo: MOTIVO, archivado_en: ahora }));
  plan.recetasBaja.forEach((id) => st.update("recetas", id, { activo: false, archivado_motivo: MOTIVO, archivado_en: ahora }));

  st.insert("config", { id: FLAG, hecho: true, materias: plan.materiasBaja.length, recetas: plan.recetasBaja.length, fecha: ahora });
  return { ranAny: true, materias: plan.materiasBaja.length, recetas: plan.recetasBaja.length };
}

module.exports = { computar, aplicar, esVendido, FLAG, MOTIVO };
