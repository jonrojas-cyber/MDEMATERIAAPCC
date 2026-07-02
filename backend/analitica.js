// ANALÍTICA DEL PROPIETARIO · "dónde está mi dinero".
// Todo el dinero sale de costing.js (fuente única). Este módulo solo agrega.

const store = require("./data-store");
const costing = require("./costing");
const { categoriaDe } = require("./clasificador");
const { estadoStock } = require("./umbral");

const DAY = 86400000;
function ymd(d) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; }
function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// KPIs de cabecera del panel.
function kpis() {
  const materias = store.readAll("materias");
  const idxMat = costing.indiceMaterias(materias);
  const productos = store.readAll("productos");
  const prodById = {}; productos.forEach((p) => (prodById[p.id] = p));
  const prodByName = {}; productos.forEach((p) => { if (p.nombre) prodByName[p.nombre.toLowerCase()] = p; });
  const ventas = store.readAll("ventas");
  const ajustes = store.readAll("ajustes");
  const hoy = new Date().toDateString();

  const ventasHoy = ventas.filter((v) => v.fecha && new Date(v.fecha).toDateString() === hoy);
  const facturacion = eur(ventasHoy.reduce((s, v) => s + (Number(v.importe) || 0), 0));
  const costeVendido = eur(ventasHoy.reduce((s, v) => {
    const p = prodById[v.producto_id] || prodByName[String(v.producto || "").toLowerCase()];
    return s + (p ? costing.costeProducto(p, idxMat) * (Number(v.cantidad) || 0) : 0);
  }, 0));
  const mermaHoy = costing.costeMermas(ajustes.filter((a) => a.fecha && new Date(a.fecha).toDateString() === hoy));
  const critico = materias.filter((m) => estadoStock(m) !== "correcto").length;
  const ahora = Date.now();
  const caducan = store.readAll("lotes").filter((l) => l.estado !== "Fuera de servicio" && l.caduca_en &&
    (l.cantidad_restante == null || l.cantidad_restante > 0) &&
    new Date(l.caduca_en).getTime() - ahora <= 48 * 3.6e6).length;

  return {
    facturacion_hoy: facturacion,
    coste_vendido: costeVendido,
    margen_bruto_eur: eur(facturacion - costeVendido),
    margen_bruto_pct: facturacion > 0 ? Math.round((1 - costeVendido / facturacion) * 100) : null,
    merma_hoy: mermaHoy,
    valor_almacen: costing.valorStock(materias),
    valor_produccion: costing.valorProduccion(null, null, idxMat),
    stock_critico: critico,
    caducidades_48h: caducan,
  };
}

// Valor de almacén por macrocategoría.
function valorAlmacenPorCategoria() {
  const g = {};
  store.readAll("materias").forEach((m) => {
    const cat = categoriaDe(m).macro;
    const v = (Number(m.disponibilidad_actual) || 0) * (Number(m.coste_medio) || 0);
    g[cat] = (g[cat] || 0) + v;
  });
  return Object.entries(g).map(([label, value]) => ({ label, value: eur(value) })).sort((a, b) => b.value - a.value);
}

// Mermas en € por día (últimos N días).
function mermasPorDia(dias = 14) {
  const ajustes = store.readAll("ajustes");
  const base = Date.now();
  const out = [];
  for (let i = dias - 1; i >= 0; i--) {
    const k = ymd(base - i * DAY);
    const v = ajustes.filter((a) => a.fecha && ymd(a.fecha) === k).reduce((s, a) => s + (Number(a.coste_estimado) || 0), 0);
    out.push({ label: k.slice(5), value: eur(v) });
  }
  return out;
}

// Ranking de productos por venta y por beneficio (últimos N días).
function topProductos(dias = 30) {
  const desde = Date.now() - dias * DAY;
  const materias = store.readAll("materias");
  const idxMat = costing.indiceMaterias(materias);
  const productos = store.readAll("productos");
  const prodById = {}; productos.forEach((p) => (prodById[p.id] = p));
  const prodByName = {}; productos.forEach((p) => { if (p.nombre) prodByName[p.nombre.toLowerCase()] = p; });
  const acc = {};
  store.readAll("ventas").forEach((v) => {
    if (!v.fecha || new Date(v.fecha).getTime() < desde) return;
    const key = v.producto || v.producto_id || "?";
    const p = prodById[v.producto_id] || prodByName[String(v.producto || "").toLowerCase()];
    const cant = Number(v.cantidad) || 0;
    const importe = Number(v.importe) || 0;
    const coste = p ? costing.costeProducto(p, idxMat) * cant : 0;
    if (!acc[key]) acc[key] = { producto: key, unidades: 0, importe: 0, coste: 0 };
    acc[key].unidades += cant; acc[key].importe += importe; acc[key].coste += coste;
  });
  const arr = Object.values(acc).map((x) => ({
    producto: x.producto, unidades: Math.round(x.unidades * 10) / 10,
    importe: eur(x.importe), beneficio: eur(x.importe - x.coste),
    margen: x.importe > 0 ? Math.round((1 - x.coste / x.importe) * 100) : null,
  }));
  return {
    por_venta: [...arr].sort((a, b) => b.importe - a.importe).slice(0, 8),
    por_beneficio: [...arr].sort((a, b) => b.beneficio - a.beneficio).slice(0, 8),
    menor_margen: [...arr].filter((x) => x.margen != null).sort((a, b) => a.margen - b.margen).slice(0, 6),
  };
}

// Compras por proveedor (últimos N días).
function comprasPorProveedor(dias = 30) {
  const desde = Date.now() - dias * DAY;
  const prov = {}; store.readAll("proveedores").forEach((p) => (prov[p.id] = p.nombre));
  const g = {};
  store.readAll("recepciones").forEach((r) => {
    if (!r.fecha || new Date(r.fecha).getTime() < desde) return;
    const label = prov[r.proveedor_id] || r.proveedor_id || "Sin proveedor";
    g[label] = (g[label] || 0) + (Number(r.importe_total) || 0);
  });
  return Object.entries(g).map(([label, value]) => ({ label, value: eur(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
}

// Balance €: producido vs vendido vs tirado (últimos N días).
function balance(dias = 30) {
  const desde = Date.now() - dias * DAY;
  const idxMat = costing.indiceMaterias();
  const recById = {}; store.readAll("recetas").forEach((r) => (recById[r.id] = r));
  const producido = store.readAll("lotes")
    .filter((l) => l.producido_en && new Date(l.producido_en).getTime() >= desde)
    .reduce((s, l) => { const r = recById[l.receta_id]; return s + (r ? costing.costePorUnidad(r, idxMat) * (Number(l.cantidad_inicial) || 0) : 0); }, 0);
  const vendido = store.readAll("ventas")
    .filter((v) => v.fecha && new Date(v.fecha).getTime() >= desde)
    .reduce((s, v) => s + (Number(v.importe) || 0), 0);
  const tirado = store.readAll("ajustes")
    .filter((a) => a.fecha && new Date(a.fecha).getTime() >= desde)
    .reduce((s, a) => s + (Number(a.coste_estimado) || 0), 0);
  return { producido_eur: eur(producido), vendido_eur: eur(vendido), tirado_eur: eur(tirado) };
}

// Merma € por motivo (taxonomía) y por producto/materia (últimos N días).
function mermasPorMotivo(dias = 30) {
  const desde = Date.now() - dias * DAY;
  const ajustes = store.readAll("ajustes").filter((a) => a.fecha && new Date(a.fecha).getTime() >= desde);
  const porMotivo = {};
  const porObjetivo = {};
  ajustes.forEach((a) => {
    const c = Number(a.coste_estimado) || 0;
    porMotivo[a.motivo || "otro"] = (porMotivo[a.motivo || "otro"] || 0) + c;
    const key = a.objetivo_nombre || a.objetivo_id || "?";
    porObjetivo[key] = (porObjetivo[key] || 0) + c;
  });
  const toArr = (o) => Object.entries(o).map(([label, value]) => ({ label, value: eur(value) })).sort((a, b) => b.value - a.value);
  return { por_motivo: toArr(porMotivo), por_producto: toArr(porObjetivo).slice(0, 8) };
}

// Descuadre de inventario (últimos N días): merma oculta que solo aflora al
// contar físicamente. Dinero que se va sin quedar registrado como merma.
function descuadreInventario(dias = 30) {
  const desde = Date.now() - dias * DAY;
  const invs = store.readAll("inventarios").filter((i) => i.fecha && new Date(i.fecha).getTime() >= desde);
  const ultimo = invs.length ? invs[invs.length - 1] : null;
  return {
    recuentos: invs.length,
    descuadre_eur: eur(invs.reduce((s, i) => s + (Number(i.descuadre_eur) || 0), 0)),
    merma_oculta_eur: eur(invs.reduce((s, i) => s + (Number(i.merma_oculta_eur) || 0), 0)),
    ultimo: ultimo ? { fecha: ultimo.fecha, descuadre_eur: eur(ultimo.descuadre_eur), lineas_con_descuadre: ultimo.lineas_con_descuadre } : null,
  };
}

function panel(dias = 30) {
  return {
    dias,
    kpis: kpis(),
    valor_almacen_categoria: valorAlmacenPorCategoria(),
    mermas_por_dia: mermasPorDia(14),
    mermas: mermasPorMotivo(dias),
    top: topProductos(dias),
    compras_proveedor: comprasPorProveedor(dias),
    balance: balance(dias),
    inventario: descuadreInventario(dias),
  };
}

module.exports = { kpis, valorAlmacenPorCategoria, mermasPorDia, mermasPorMotivo, topProductos, comprasPorProveedor, balance, descuadreInventario, panel };
