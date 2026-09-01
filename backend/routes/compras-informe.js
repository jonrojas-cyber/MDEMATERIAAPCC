// INFORME DE COMPRAS · misma estructura que Gstock (Compras → Informes).
// Agrega las líneas de las recepciones (albaranes) ya registradas por
// proveedor / familia / producto y periodo. NO inventa nada: suma lo que hay en
// las recepciones. Fuente única del gasto = entidad "recepciones".
//
// Filtros (query): desde, hasta (aaaa-mm-dd), proveedor_id, categoria (macro o
// subcategoría de la materia), materia_id, tipo (albaran|factura).
// Devuelve filas por producto y por proveedor, con subtotal (Σ importes de línea)
// y total (Σ importe_total de los albaranes del rango) — como el Subtotal/Total
// de Gstock. Solo admin (va montado bajo el guard del Centro de Compras).

const express = require("express");
const store = require("../data-store");

const router = express.Router();
const eur = (n) => Math.round((Number(n) || 0) * 100) / 100;
const ymd = (f) => String(f || "").slice(0, 10);

// Familia de una materia (para el filtro/agrupación por familia de Gstock).
function familiaDe(m) {
  if (!m) return "Sin clasificar";
  return m.subcategoria || m.macro || m.categoria || "Sin clasificar";
}

// Agregación pura (inyectable para tests): recibe las colecciones y los filtros.
function agregar({ recepciones = [], materias = [], proveedores = [] }, filtros = {}) {
  const { desde, hasta, proveedor_id, categoria, materia_id, tipo } = filtros;
  const d0 = desde ? ymd(desde) : "0000-00-00";
  const d1 = hasta ? ymd(hasta) : "9999-99-99";

  const matById = {}; materias.forEach((m) => (matById[m.id] = m));
  const provById = {}; proveedores.forEach((p) => (provById[p.id] = p));

  // Recepciones dentro del rango y filtros de cabecera.
  const recs = recepciones.filter((r) => {
    const f = ymd(r.fecha);
    if (f < d0 || f > d1) return false;
    if (proveedor_id && r.proveedor_id !== proveedor_id) return false;
    if (tipo && (r.tipo_documento || "albaran") !== tipo) return false;
    return true;
  });

  const porProducto = {};   // materia_id|descripcion → agregado
  const porProveedor = {};  // proveedor_id → agregado
  const porFamilia = {};    // familia → agregado
  let subtotal = 0;         // Σ importes de línea (base de albarán)

  recs.forEach((r) => {
    const prov = provById[r.proveedor_id];
    (r.lineas || []).forEach((l) => {
      const m = l.materia_id ? matById[l.materia_id] : null;
      const fam = familiaDe(m);
      // Filtros de línea: familia (macro o subcategoría) y materia concreta.
      if (materia_id && l.materia_id !== materia_id) return;
      if (categoria && !(m && (m.macro === categoria || m.subcategoria === categoria || m.categoria === categoria))) return;
      const importe = Number(l.importe) || 0;
      const cantidad = Number(l.cantidad) || 0;
      subtotal += importe;

      const kProd = l.materia_id || `desc:${(l.descripcion || "—").toLowerCase()}`;
      if (!porProducto[kProd]) {
        porProducto[kProd] = {
          producto: m ? m.nombre : (l.descripcion || "—"),
          materia_id: l.materia_id || null,
          familia: fam, unidad: l.unidad_destino || (m ? m.unidad : ""),
          cantidad: 0, importe: 0, lineas: 0,
        };
      }
      porProducto[kProd].cantidad += cantidad;
      porProducto[kProd].importe += importe;
      porProducto[kProd].lineas += 1;

      const kProv = r.proveedor_id || "—";
      if (!porProveedor[kProv]) porProveedor[kProv] = { proveedor: prov ? prov.nombre : kProv, proveedor_id: r.proveedor_id || null, importe: 0, lineas: 0 };
      porProveedor[kProv].importe += importe;
      porProveedor[kProv].lineas += 1;

      if (!porFamilia[fam]) porFamilia[fam] = { familia: fam, importe: 0, lineas: 0 };
      porFamilia[fam].importe += importe;
      porFamilia[fam].lineas += 1;
    });
  });

  // Total facturado = Σ importe_total de los albaranes del rango (con impuestos/
  // redondeos del albarán). Solo tiene sentido sin filtrar por producto/familia.
  const filtraLinea = !!(materia_id || categoria);
  const totalFacturado = filtraLinea ? null : eur(recs.reduce((s, r) => s + (Number(r.importe_total) || 0), 0));

  const norm = (obj) => Object.values(obj)
    .map((x) => ({ ...x, cantidad: x.cantidad != null ? eur(x.cantidad) : undefined, importe: eur(x.importe) }))
    .sort((a, b) => b.importe - a.importe);

  return {
    desde: desde || null, hasta: hasta || null,
    recepciones: recs.length,
    por_producto: norm(porProducto),
    por_proveedor: norm(porProveedor),
    por_familia: norm(porFamilia),
    subtotal: eur(subtotal),
    total_facturado: totalFacturado,   // null si se filtró por producto/familia
    gran_total: totalFacturado != null ? totalFacturado : eur(subtotal),
  };
}

router.get("/", (req, res) => {
  res.json(agregar({
    recepciones: store.readAll("recepciones"),
    materias: store.readAll("materias"),
    proveedores: store.readAll("proveedores"),
  }, req.query));
});

module.exports = router;
module.exports.agregar = agregar;
