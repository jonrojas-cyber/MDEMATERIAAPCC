// MERMAS · taxonomía de motivos y validación (motor PURO, sin disco)
// ─────────────────────────────────────────────────────────────────────────────
// Cada merma registra UN movimiento: qué producto, cuánto, por qué, quién y cuándo.
// Los motivos están pensados para que todo el equipo clasifique el "por qué" en un
// toque, y para que el propietario analice después DÓNDE se pierde (evitable vs
// cortesía vs consumo vs caducidad). Las mermas se guardan en la entidad `ajustes`
// (única fuente de verdad del dinero): el `motivo` guardado es la etiqueta de abajo,
// y el `grupo` permite agrupar en los informes.

// grupo: para análisis — accidente/elaboración/servicio/sobreproducción = EVITABLE;
//        caducidad/calidad = conservación/compra; cortesía/i+d/personal = intencionado.
const MERMAS_MOTIVOS = [
  // Caducidad / estado
  { k: "caducado",     t: "Caducado",               grupo: "caducidad",       seccion: "Caducidad y estado", desc: "pasó la fecha o fin de vida útil" },
  { k: "mal_estado",   t: "Mal estado",             grupo: "calidad",         seccion: "Caducidad y estado", desc: "deteriorado, mal aspecto u olor" },
  // Accidente
  { k: "caido",        t: "Caído al suelo",         grupo: "accidente",       seccion: "Accidente",          desc: "se cayó" },
  { k: "roto",         t: "Roto o derramado",       grupo: "accidente",       seccion: "Accidente",          desc: "rotura o derrame" },
  // Elaboración / servicio
  { k: "mal_elaborado",t: "Mal elaborado",          grupo: "elaboración",     seccion: "Elaboración y servicio", desc: "quemado o salió mal" },
  { k: "error_comanda",t: "Error de comanda",       grupo: "servicio",        seccion: "Elaboración y servicio", desc: "se preparó un pedido equivocado" },
  { k: "devolucion",   t: "Devolución de cliente",  grupo: "servicio",        seccion: "Elaboración y servicio", desc: "el cliente lo devolvió" },
  { k: "sobrante",     t: "Sobrante de producción", grupo: "sobreproducción", seccion: "Elaboración y servicio", desc: "se preparó de más y se descarta" },
  // Cortesía / consumo (coste intencionado, no es un fallo)
  { k: "cortesia",     t: "Invitación o cortesía",  grupo: "cortesía",        seccion: "Cortesía y consumo", desc: "detalle o regalo a un cliente" },
  { k: "prueba",       t: "Prueba, cata o I+D",     grupo: "i+d",             seccion: "Cortesía y consumo", desc: "cata, formación o desarrollo" },
  { k: "autoconsumo",  t: "Autoconsumo del equipo", grupo: "personal",        seccion: "Cortesía y consumo", desc: "consumo del personal" },
];

function motivo(k) { return MERMAS_MOTIVOS.find((m) => m.k === k) || null; }

// Secciones ordenadas (para pintar los botones agrupados en la app).
function secciones() {
  const orden = ["Caducidad y estado", "Accidente", "Elaboración y servicio", "Cortesía y consumo"];
  return orden.map((s) => ({ seccion: s, motivos: MERMAS_MOTIVOS.filter((m) => m.seccion === s) }));
}

// Cantidad robusta: admite coma decimal y espacios; devuelve número o NaN.
function parseCantidad(v) {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v == null ? "" : v).replace(",", ".").replace(/[^0-9.]/g, ""));
  return n;
}

// Unidades admitidas (para el registro y el cálculo de coste).
const UNIDADES = ["ud", "g", "kg", "ml", "L", "ración"];

// Resuelve el objetivo a partir del ref del catálogo (mismo catálogo que Etiquetas):
//  mat:<id> → materia (tiene stock y coste_medio) · rec:<id> → receta (coste por
//  escandallo) · prod-… → producto · resto → otro (preparación/manual, sin coste).
function resolverObjetivo(ref) {
  const r = String(ref || "");
  if (r.startsWith("mat:")) return { tipo: "materia", id: r.slice(4) };
  if (r.startsWith("rec:")) return { tipo: "receta", id: r.slice(4) };
  if (r.startsWith("prod-") || r.startsWith("prod:")) return { tipo: "producto", id: r.replace(/^prod:/, "") };
  return { tipo: "otro", id: r };
}

// Validación de una merma (presencia de campos obligatorios, mensajes concretos).
function validar(datos) {
  const d = datos || {};
  const errores = [];
  if (!String(d.ref || d.nombre || "").trim()) errores.push({ campo: "producto", mensaje: "Elige el producto que ha mermado." });
  const c = parseCantidad(d.cantidad);
  if (!(Number.isFinite(c) && c > 0)) errores.push({ campo: "cantidad", mensaje: "Indica una cantidad mayor que 0." });
  if (!motivo(d.motivo)) errores.push({ campo: "motivo", mensaje: "Elige el motivo de la merma." });
  return { ok: errores.length === 0, errores };
}

module.exports = { MERMAS_MOTIVOS, motivo, secciones, parseCantidad, UNIDADES, resolverObjetivo, validar };
