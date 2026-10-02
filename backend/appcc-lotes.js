// APPCC · LOTES INTERNOS Y OPERACIONES DE MANIPULACIÓN
// ─────────────────────────────────────────────────────────────────────────────
// Motor PURO (sin acceso a disco) que gobierna la trazabilidad de la cocina:
//
//  · La información COMERCIAL del producto (nombre, familia, código, código de
//    barras, PVP) vive en el producto de Ágora y NO se toca aquí.
//  · La información SANITARIA/OPERATIVA (vida útil, conservación, alérgenos,
//    operaciones permitidas) vive en la ficha APPCC (entidad appcc_fichas).
//  · Cada MANIPULACIÓN del producto genera un LOTE INTERNO con identificador
//    único e inmutable y toda la trazabilidad exigida por APPCC.
//
// Hay 8 tipos de operación. Cada uno usa una PLANTILLA y pide SOLO los campos
// necesarios. La fecha límite interna se calcula únicamente si hay vida útil
// configurada y NUNCA supera la caducidad original del fabricante.

// ── Estados del lote interno ────────────────────────────────────────────────
const ESTADOS = ["activo", "consumido", "agotado", "retirado", "caducado", "descartado"];
function estadoValido(e) { return ESTADOS.includes(String(e || "")); }

// ── Definición de las 8 operaciones ─────────────────────────────────────────
// campos[].tipo: texto | numero | fecha | textarea | lotes_origen | lote_existente
// campos[].req: obligatorio (bloquea el guardado si falta)
// campos[].msg: mensaje concreto si falta (APPCC exige mensajes claros)
// crea_lote: genera un lote interno nuevo (todas menos la reimpresión)
// usa_lote_existente: parte de un lote interno ya creado (división y reimpresión)
// calcula_limite: calcula fecha límite interna a partir de la vida útil
const OPERACIONES = [
  {
    k: "apertura", nombre: "Apertura de envase original", icono: "📦",
    descripcion: "Abres un envase del proveedor y empieza a contar su vida tras apertura.",
    crea_lote: true, usa_lote_existente: false, calcula_limite: true,
    campos: [
      { k: "proveedor", label: "Proveedor", tipo: "texto", req: false },
      { k: "lote_original", label: "Lote original del proveedor", tipo: "texto", req: true, msg: "Falta el lote original del proveedor (obligatorio para abrir un envase)." },
      { k: "caducidad_original", label: "Caducidad / consumo pref. original", tipo: "fecha", req: true, msg: "Falta la caducidad original del fabricante (obligatoria al abrir un envase)." },
      { k: "num_etiquetas", label: "Nº de envases/etiquetas", tipo: "numero", req: true, msg: "Indica cuántas etiquetas imprimir (mínimo 1)." },
    ],
  },
  {
    k: "reenvasado", nombre: "Reenvasado", icono: "🥡",
    descripcion: "Pasas el producto del envase del proveedor a tus recipientes.",
    crea_lote: true, usa_lote_existente: false, calcula_limite: true,
    campos: [
      { k: "proveedor", label: "Proveedor", tipo: "texto", req: true, msg: "Falta el proveedor (obligatorio para reenvasar)." },
      { k: "lote_original", label: "Lote original del proveedor", tipo: "texto", req: true, msg: "Falta el lote original del proveedor (obligatorio para reenvasar)." },
      { k: "caducidad_original", label: "Caducidad / consumo pref. original", tipo: "fecha", req: true, msg: "Falta la caducidad original del fabricante (obligatoria para reenvasar)." },
      { k: "num_etiquetas", label: "Nº de envases", tipo: "numero", req: true, msg: "Indica el número de envases a etiquetar (mínimo 1)." },
    ],
  },
  {
    k: "elaboracion", nombre: "Elaboración propia", icono: "🍳",
    descripcion: "Preparas una elaboración propia. Asocia los lotes de los ingredientes para trazar hacia atrás.",
    crea_lote: true, usa_lote_existente: false, calcula_limite: true,
    campos: [
      { k: "cantidad", label: "Cantidad elaborada", tipo: "texto", req: false },
      { k: "lotes_origen", label: "Lotes de los ingredientes usados", tipo: "lotes_origen", req: false },
      { k: "num_etiquetas", label: "Nº de etiquetas", tipo: "numero", req: true, msg: "Indica cuántas etiquetas imprimir (mínimo 1)." },
    ],
  },
  {
    k: "descongelacion", nombre: "Descongelación", icono: "❄️",
    descripcion: "Sacas un producto congelado a descongelar; empieza a contar su vida tras descongelación.",
    crea_lote: true, usa_lote_existente: false, calcula_limite: true,
    campos: [
      { k: "lote_original", label: "Lote de origen (producto congelado)", tipo: "texto", req: false },
      { k: "caducidad_original", label: "Caducidad original del congelado", tipo: "fecha", req: false },
      { k: "num_etiquetas", label: "Nº de etiquetas", tipo: "numero", req: true, msg: "Indica cuántas etiquetas imprimir (mínimo 1)." },
    ],
  },
  {
    k: "produccion_bebidas", nombre: "Producción de bebidas", icono: "🥤",
    descripcion: "Produces un lote de bebida (burbujas, spritz, cold brew…).",
    crea_lote: true, usa_lote_existente: false, calcula_limite: true,
    campos: [
      { k: "cantidad", label: "Cantidad producida (ml / L / uds)", tipo: "texto", req: false },
      { k: "num_etiquetas", label: "Nº de etiquetas", tipo: "numero", req: true, msg: "Indica cuántas etiquetas imprimir (mínimo 1)." },
    ],
  },
  {
    k: "preparacion", nombre: "Preparación previa", icono: "🔪",
    descripcion: "Mise en place: dejas algo preparado para el servicio.",
    crea_lote: true, usa_lote_existente: false, calcula_limite: true,
    campos: [
      { k: "cantidad", label: "Cantidad preparada", tipo: "texto", req: false },
      { k: "num_etiquetas", label: "Nº de etiquetas", tipo: "numero", req: true, msg: "Indica cuántas etiquetas imprimir (mínimo 1)." },
    ],
  },
  {
    k: "division", nombre: "División de un lote", icono: "🔀",
    descripcion: "Repartes un lote interno ya existente en varios recipientes. Heredan su caducidad.",
    crea_lote: true, usa_lote_existente: true, calcula_limite: false,
    campos: [
      { k: "lote_existente", label: "Lote interno a dividir", tipo: "lote_existente", req: true, msg: "Elige el lote interno que vas a dividir." },
      { k: "num_etiquetas", label: "Nº de recipientes", tipo: "numero", req: true, msg: "Indica en cuántos recipientes divides el lote (mínimo 1)." },
    ],
  },
  {
    k: "reimpresion", nombre: "Reimpresión de etiqueta", icono: "🖨️",
    descripcion: "Vuelves a imprimir la etiqueta de un lote interno existente (no crea lote nuevo).",
    crea_lote: false, usa_lote_existente: true, calcula_limite: false,
    campos: [
      { k: "lote_existente", label: "Lote interno a reimprimir", tipo: "lote_existente", req: true, msg: "Elige el lote interno cuya etiqueta quieres reimprimir." },
      { k: "num_etiquetas", label: "Nº de copias", tipo: "numero", req: true, msg: "Indica cuántas copias imprimir (mínimo 1)." },
    ],
  },
];
function operacion(k) { return OPERACIONES.find((o) => o.k === k) || null; }

// ── Fecha límite interna ─────────────────────────────────────────────────────
// Se calcula SOLO si hay vida útil configurada. Nunca supera la caducidad
// original del fabricante (se recorta al tope del fabricante si lo superase).
function calcularFechaLimite({ fechaManip, vidaDias, caducidadOriginal }) {
  if (vidaDias == null || !(Number(vidaDias) > 0)) return null; // sin vida configurada → no se calcula
  const base = fechaManip ? new Date(fechaManip) : new Date();
  if (isNaN(base.getTime())) return null;
  let limite = new Date(base.getTime() + Number(vidaDias) * 86400000);
  if (caducidadOriginal) {
    const cad = new Date(caducidadOriginal);
    if (!isNaN(cad.getTime()) && limite.getTime() > cad.getTime()) limite = cad; // tope del fabricante
  }
  return limite.toISOString();
}

// ── Validación de campos obligatorios (mensajes concretos) ───────────────────
function validar(opDef, datos) {
  const errores = [];
  if (!opDef) { errores.push({ campo: "operacion", mensaje: "Operación no reconocida." }); return { ok: false, errores }; }
  const d = datos || {};
  opDef.campos.forEach((c) => {
    if (!c.req) return;
    let vacio;
    if (c.tipo === "numero") vacio = !(parseInt(d[c.k], 10) >= 1);
    else if (c.tipo === "lote_existente") vacio = !String(d.lote_existente || "").trim();
    else vacio = !String(d[c.k] == null ? "" : d[c.k]).trim();
    if (vacio) errores.push({ campo: c.k, mensaje: c.msg || `Falta «${c.label}».` });
  });
  return { ok: errores.length === 0, errores };
}

// ── Identificador único e inmutable del lote interno ─────────────────────────
// L-AAAAMMDD-HHMMSS-XXXX  (fecha + hora + sufijo aleatorio base36).
function nuevoLoteId(now) {
  const d = now ? new Date(now) : new Date();
  const base = isNaN(d.getTime()) ? new Date() : d;
  const p = (n, w) => String(n).padStart(w, "0");
  const fecha = base.getUTCFullYear() + p(base.getUTCMonth() + 1, 2) + p(base.getUTCDate(), 2);
  const hora = p(base.getUTCHours(), 2) + p(base.getUTCMinutes(), 2) + p(base.getUTCSeconds(), 2);
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `L-${fecha}-${hora}-${rnd}`;
}

// ── Construcción del lote interno (registro inmutable + trazabilidad) ────────
// ctx: { producto, ref, agora_id, ficha, now, usuario, loteOrigen }
// La ficha aporta vida útil / conservación / alérgenos. La vida usada puede venir
// por operación (ficha.vidas_por_operacion[op]) o la general (ficha.vida_util_dias).
function vidaUtilDe(ficha, opK) {
  if (!ficha) return null;
  const porOp = ficha.vidas_por_operacion && ficha.vidas_por_operacion[opK];
  if (porOp != null && Number(porOp) > 0) return Number(porOp);
  if (ficha.vida_util_dias != null && Number(ficha.vida_util_dias) > 0) return Number(ficha.vida_util_dias);
  return null;
}

function construirLote(opDef, datos, ctx) {
  ctx = ctx || {};
  const now = ctx.now || new Date().toISOString();
  const usuario = ctx.usuario || "";
  const ficha = ctx.ficha || {};
  const d = datos || {};
  const num = Math.max(1, parseInt(d.num_etiquetas, 10) || 1);
  const origen = ctx.loteOrigen || null; // para división: hereda del lote padre

  // Caducidad original: en la división se hereda del lote padre.
  const caducidadOriginal = origen ? (origen.caducidad_original || null) : (d.caducidad_original ? new Date(d.caducidad_original).toISOString() : null);
  const vidaDias = opDef.calcula_limite ? vidaUtilDe(ficha, opDef.k) : null;
  // La división hereda la fecha límite del lote padre (no recalcula).
  const fechaLimite = origen ? (origen.fecha_limite_interna || null)
    : (opDef.calcula_limite ? calcularFechaLimite({ fechaManip: now, vidaDias, caducidadOriginal }) : null);

  const alergenos = origen ? (origen.alergenos || []) : (Array.isArray(ficha.alergenos) ? ficha.alergenos : []);
  const conservacion = origen ? (origen.conservacion || null) : (ficha.conservacion || null);

  const lote = {
    id: nuevoLoteId(now),
    ref: ctx.ref || (origen && origen.ref) || null,
    producto: ctx.producto || (origen && origen.producto) || "",
    agora_id: ctx.agora_id || (origen && origen.agora_id) || null,
    operacion: opDef.k,
    operacion_nombre: opDef.nombre,
    proveedor: (d.proveedor || (origen && origen.proveedor) || ficha.proveedor || "") || null,
    lote_original: d.lote_original || (origen && origen.lote_original) || null,
    caducidad_original: caducidadOriginal,
    tipo_fecha_original: ficha.tipo_fecha || (origen && origen.tipo_fecha_original) || "caducidad",
    cantidad: d.cantidad || null,
    fecha_manipulacion: now,
    usuario,
    num_etiquetas: num,
    vida_util_dias: vidaDias,
    fecha_limite_interna: fechaLimite,
    conservacion,
    alergenos,
    lotes_origen: Array.isArray(d.lotes_origen) ? d.lotes_origen.filter(Boolean).slice(0, 50) : [],
    lote_padre: origen ? origen.id : null,
    estado: "activo",
    observaciones: d.observaciones ? String(d.observaciones).slice(0, 400) : null,
    incidencias: null,
    historial: [{ tipo: "impresion", fecha: now, usuario, copies: num }],
    creado_en: now,
  };
  return lote;
}

// ── Especificaciones de impresión para la página de etiquetas por lote ───────
// Traduce un lote interno a las especs que entiende label-service (lote page).
// La fecha de vencimiento de la etiqueta es la fecha límite interna; si no hay
// (sin vida configurada) usa la caducidad original del fabricante.
function especsImpresion(lote, copies) {
  const n = Math.max(1, parseInt(copies, 10) || lote.num_etiquetas || 1);
  const venceISO = lote.fecha_limite_interna || lote.caducidad_original || null;
  const venceLabel = lote.fecha_limite_interna ? "consumir antes" : (lote.tipo_fecha_original === "consumo_preferente" ? "consumo pref." : "consumir antes");
  const partesEst = [];
  if (lote.lote_original) partesEst.push("lote " + lote.lote_original);
  if (lote.operacion && lote.operacion !== "elaboracion" && lote.operacion !== "produccion_bebidas") partesEst.push(lote.operacion_nombre);
  if (lote.observaciones) partesEst.push(lote.observaciones);
  const espec = {
    n: lote.producto,
    c: lote.cantidad || "",
    v: 0, // la caducidad va explícita (cad), no por horas de vida
    est: partesEst.join(" · "),
    r: lote.usuario || "",
    p: lote.fecha_manipulacion,
    loteId: lote.id,
  };
  if (venceISO) { espec.cad = venceISO; espec.venceLabel = venceLabel; }
  const out = [];
  for (let i = 0; i < n; i++) out.push(espec);
  return out;
}

module.exports = {
  ESTADOS, estadoValido, OPERACIONES, operacion,
  calcularFechaLimite, validar, nuevoLoteId, vidaUtilDe, construirLote, especsImpresion,
};
