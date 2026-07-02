// INTELIGENCIA DEL NEGOCIO · "lo que deberías saber".
// Observa tendencias (merma, precios, descuadre, márgenes) y las convierte en
// frases claras y accionables. No inventa datos: si no hay señal, no habla.

const store = require("./data-store");
const costing = require("./costing");

const DAY = 86400000;
function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

let _seq = 0;
function nid() { return `ins-${++_seq}`; }

// 1) Merma concentrada: un producto/materia acapara buena parte de lo tirado.
function mermaConcentrada(dias, ajustes) {
  const desde = Date.now() - dias * DAY;
  const recientes = ajustes.filter((a) => a.fecha && new Date(a.fecha).getTime() >= desde);
  const total = recientes.reduce((s, a) => s + (Number(a.coste_estimado) || 0), 0);
  if (total < 15) return null; // por debajo de 15 € no merece alarma
  const porObjetivo = {};
  recientes.forEach((a) => {
    const k = a.objetivo_nombre || a.objetivo_id || "?";
    porObjetivo[k] = (porObjetivo[k] || 0) + (Number(a.coste_estimado) || 0);
  });
  const top = Object.entries(porObjetivo).map(([nombre, v]) => ({ nombre, v })).sort((a, b) => b.v - a.v)[0];
  if (!top) return null;
  const pct = Math.round((top.v / total) * 100);
  if (pct < 35) return null;
  return {
    id: nid(), tipo: "merma_concentrada", severidad: "importante",
    titulo: `Estás tirando demasiado ${top.nombre}`,
    detalle: `${eur(top.v)} € en ${dias} días — el ${pct}% de toda tu merma. Ajusta producción o revisa conservación.`,
    accion: { label: "Ver mermas", handler: "irA_ajustes" },
  };
}

// 2) Merma al alza: esta semana se tira más que la anterior.
function mermaAlAlza(ajustes) {
  const ahora = Date.now();
  const sem = (ini, fin) => ajustes
    .filter((a) => a.fecha && new Date(a.fecha).getTime() >= ini && new Date(a.fecha).getTime() < fin)
    .reduce((s, a) => s + (Number(a.coste_estimado) || 0), 0);
  const estaSemana = sem(ahora - 7 * DAY, ahora);
  const semanaPrevia = sem(ahora - 14 * DAY, ahora - 7 * DAY);
  if (estaSemana < 10 || semanaPrevia <= 0) return null;
  const subida = Math.round(((estaSemana - semanaPrevia) / semanaPrevia) * 100);
  if (subida < 30) return null;
  return {
    id: nid(), tipo: "merma_alza", severidad: "importante",
    titulo: `Tu merma ha subido un ${subida}% esta semana`,
    detalle: `${eur(estaSemana)} € esta semana frente a ${eur(semanaPrevia)} € la anterior. Mira qué ha cambiado.`,
    accion: { label: "Ver mermas", handler: "irA_ajustes" },
  };
}

// 3) Subidas de precio de proveedor en el periodo.
function subidasPrecio(dias) {
  const desde = Date.now() - dias * DAY;
  const prov = {}; store.readAll("proveedores").forEach((p) => (prov[p.id] = p.nombre));
  const prod = {}; store.readAll("compras_productos").forEach((p) => (prod[p.id] = p.nombre));
  const hist = store.readAll("precios_historico")
    .filter((h) => h.fecha && new Date(h.fecha).getTime() >= desde)
    .filter((h) => Number(h.precio_anterior) > 0 && Number(h.precio_nuevo) > Number(h.precio_anterior));
  // Nos quedamos con la subida más reciente por producto.
  const porProducto = {};
  hist.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).forEach((h) => (porProducto[h.producto_id] = h));
  const subidas = Object.values(porProducto).map((h) => {
    const pct = Math.round(((h.precio_nuevo - h.precio_anterior) / h.precio_anterior) * 100);
    return { h, pct };
  }).filter((x) => x.pct >= 5).sort((a, b) => b.pct - a.pct);
  if (!subidas.length) return null;
  const s = subidas[0];
  const nombre = prod[s.h.producto_id] || "un producto";
  const proveedor = prov[s.h.proveedor_id] ? ` (${prov[s.h.proveedor_id]})` : "";
  const otras = subidas.length > 1 ? ` Y ${subidas.length - 1} producto(s) más han subido.` : "";
  return {
    id: nid(), tipo: "subida_precio", severidad: "importante",
    titulo: `${nombre} subió un ${s.pct}%${proveedor}`,
    detalle: `De ${eur(s.h.precio_anterior)} € a ${eur(s.h.precio_nuevo)} €.${otras} Revisa si tu PVP sigue cubriendo el margen.`,
    accion: { label: "Ver carta", handler: "irA_carta" },
  };
}

// 4) Merma oculta: el último recuento reveló diferencias grandes.
function mermaOculta() {
  const invs = store.readAll("inventarios");
  if (!invs.length) return null;
  const ultimo = invs[invs.length - 1];
  const oculta = Math.abs(Number(ultimo.merma_oculta_eur) || 0);
  if (oculta < 10) return null;
  return {
    id: nid(), tipo: "merma_oculta", severidad: "importante",
    titulo: `El último recuento reveló ${eur(oculta)} € de merma oculta`,
    detalle: `Faltaba producto que no estaba registrado como merma (robo, roturas o errores sin anotar). Cuenta más a menudo para detectarlo antes.`,
    accion: { label: "Inventario", handler: "irA_inventario" },
  };
}

// 5) Producto que vende mucho pero deja poco margen.
function productoProblema(dias) {
  const desde = Date.now() - dias * DAY;
  const materias = store.readAll("materias");
  const idxMat = costing.indiceMaterias(materias);
  const productos = store.readAll("productos");
  const prodById = {}; productos.forEach((p) => (prodById[p.id] = p));
  const prodByName = {}; productos.forEach((p) => { if (p.nombre) prodByName[p.nombre.toLowerCase()] = p; });
  const acc = {};
  store.readAll("ventas").forEach((v) => {
    if (!v.fecha || new Date(v.fecha).getTime() < desde) return;
    const p = prodById[v.producto_id] || prodByName[String(v.producto || "").toLowerCase()];
    const key = v.producto || v.producto_id || "?";
    const cant = Number(v.cantidad) || 0;
    const importe = Number(v.importe) || 0;
    const coste = p ? costing.costeProducto(p, idxMat) * cant : 0;
    if (!acc[key]) acc[key] = { nombre: key, unidades: 0, importe: 0, coste: 0 };
    acc[key].unidades += cant; acc[key].importe += importe; acc[key].coste += coste;
  });
  const arr = Object.values(acc).filter((x) => x.importe > 0 && x.coste > 0)
    .map((x) => ({ ...x, margen: Math.round((1 - x.coste / x.importe) * 100) }));
  if (!arr.length) return null;
  // Ordena por volumen de venta; coge el más vendido con margen bajo (<50%).
  const porVenta = [...arr].sort((a, b) => b.importe - a.importe);
  const problema = porVenta.find((x) => x.margen < 50);
  if (!problema) return null;
  return {
    id: nid(), tipo: "producto_problema", severidad: "info",
    titulo: `${problema.nombre} vende mucho pero deja poco margen`,
    detalle: `${problema.margen}% de margen en ${dias} días (${eur(problema.importe)} € vendidos). Sube el precio o baja su coste.`,
    accion: { label: "Ver carta", handler: "irA_carta" },
  };
}

function generar(dias = 30) {
  _seq = 0;
  const ajustes = store.readAll("ajustes");
  const out = [
    mermaConcentrada(dias, ajustes),
    mermaAlAlza(ajustes),
    subidasPrecio(dias),
    mermaOculta(),
    productoProblema(dias),
  ].filter(Boolean);
  const orden = { critico: 0, importante: 1, info: 2 };
  out.sort((a, b) => (orden[a.severidad] ?? 3) - (orden[b.severidad] ?? 3));
  return out;
}

module.exports = { generar };
