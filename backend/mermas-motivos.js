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

// Compatibilidad: motivos de la lista plana antigua de /ajustes → clave canónica.
// (Antes /ajustes tenía su propia taxonomía distinta de /mermas; ahora es única.)
const LEGACY = {
  "caducidad": "caducado",
  "error de preparación": "mal_elaborado",
  "error de preparacion": "mal_elaborado",
  "rotura": "roto",
  "sobreproducción": "sobrante",
  "sobreproduccion": "sobrante",
  "devolución": "devolucion",
  "devolucion": "devolucion",
  "prueba i+d": "prueba",
};

// Sinónimos en lenguaje NATURAL → clave canónica. Pensado para la VOZ y la IA: la
// persona dice "se me ha caído", "caducó", "lo devolvió el cliente"… y debe registrarse
// igual que si pulsara el botón. Claves sin acentos (se comparan desacentuadas).
const VARIANTES = {
  "caducado":"caducado","caducada":"caducado","caducados":"caducado","caduco":"caducado","caducidad":"caducado","vencido":"caducado","vencida":"caducado","fecha pasada":"caducado","fuera de fecha":"caducado",
  "mal estado":"mal_estado","estropeado":"mal_estado","estropeada":"mal_estado","podrido":"mal_estado","podrida":"mal_estado","pasado":"mal_estado","deteriorado":"mal_estado","mal aspecto":"mal_estado","mal olor":"mal_estado",
  "caida":"caido","caido":"caido","se cayo":"caido","se me cayo":"caido","cayo":"caido","al suelo":"caido","caido al suelo":"caido",
  "roto":"roto","rota":"roto","rotura":"roto","derrame":"roto","derramado":"roto","derramada":"roto","se derramo":"roto","vertido":"roto","se rompio":"roto",
  "mal elaborado":"mal_elaborado","quemado":"mal_elaborado","quemada":"mal_elaborado","se quemo":"mal_elaborado","mal hecho":"mal_elaborado","salio mal":"mal_elaborado","error de preparacion":"mal_elaborado",
  "error de comanda":"error_comanda","comanda":"error_comanda","equivocado":"error_comanda","pedido equivocado":"error_comanda","error de pedido":"error_comanda","me equivoque":"error_comanda",
  "devolucion":"devolucion","devuelto":"devolucion","devuelta":"devolucion","lo devolvio":"devolucion","cliente devolvio":"devolucion","devolucion de cliente":"devolucion",
  "sobrante":"sobrante","sobra":"sobrante","sobro":"sobrante","sobras":"sobrante","de mas":"sobrante","sobrante de produccion":"sobrante","sobreproduccion":"sobrante",
  "cortesia":"cortesia","invitacion":"cortesia","invitado":"cortesia","regalo":"cortesia","detalle":"cortesia","gratis":"cortesia","invitacion o cortesia":"cortesia",
  "prueba":"prueba","cata":"prueba","i+d":"prueba","formacion":"prueba","desarrollo":"prueba","probar":"prueba","degustacion":"prueba","prueba cata o i+d":"prueba",
  "autoconsumo":"autoconsumo","consumo":"autoconsumo","personal":"autoconsumo","del personal":"autoconsumo","me lo comi":"autoconsumo","nos lo comimos":"autoconsumo","autoconsumo del equipo":"autoconsumo",
};
// Fragmentos para frases largas ("se me ha caído al suelo un croissant"). Orden: del
// más específico al más genérico (el primero que aparezca en la frase, gana).
const FRAGMENTOS = [
  ["caduc","caducado"],["venci","caducado"],
  ["derram","roto"],["rompi","roto"],["roto","roto"],
  ["caid","caido"],["cay","caido"],["suelo","caido"],
  ["quema","mal_elaborado"],["mal elaborad","mal_elaborado"],["mal hech","mal_elaborado"],
  ["comanda","error_comanda"],["equivoc","error_comanda"],
  ["devolv","devolucion"],["devoluci","devolucion"],
  ["sobr","sobrante"],
  ["regal","cortesia"],["invit","cortesia"],["cortesi","cortesia"],
  ["cata","prueba"],["degust","prueba"],["prueba","prueba"],
  ["autoconsum","autoconsumo"],
  ["mal estado","mal_estado"],["estropea","mal_estado"],["podrid","mal_estado"],
];
function desacentuar(s) { return String(s == null ? "" : s).toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
const VARIANTES_DESAC = Object.keys(VARIANTES).reduce((a, k) => { a[desacentuar(k)] = VARIANTES[k]; return a; }, {});

// Normaliza un motivo entrante (clave `k`, etiqueta `t`, string antiguo, o LENGUAJE
// NATURAL de la voz/IA) al motivo canónico. Devuelve el objeto motivo o null.
function normalizar(entrada) {
  const s = String(entrada || "").trim();
  if (!s) return null;
  const porClave = motivo(s);
  if (porClave) return porClave;
  const porEtiqueta = MERMAS_MOTIVOS.find((m) => m.t.toLowerCase() === s.toLowerCase());
  if (porEtiqueta) return porEtiqueta;
  const legacy = LEGACY[s.toLowerCase()];
  if (legacy) return motivo(legacy);
  // Lenguaje natural: desacentuar y buscar por sinónimo exacto, etiqueta o fragmento.
  const d = desacentuar(s);
  if (VARIANTES_DESAC[d]) return motivo(VARIANTES_DESAC[d]);
  const etiq = MERMAS_MOTIVOS.find((m) => desacentuar(m.t) === d);
  if (etiq) return etiq;
  for (const [frag, k] of FRAGMENTOS) { if (d.includes(frag)) return motivo(k); }
  return null;
}

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
  if (!normalizar(d.motivo)) errores.push({ campo: "motivo", mensaje: "Elige el motivo de la merma." });
  return { ok: errores.length === 0, errores };
}

module.exports = { MERMAS_MOTIVOS, motivo, normalizar, LEGACY, secciones, parseCantidad, UNIDADES, resolverObjetivo, validar };
