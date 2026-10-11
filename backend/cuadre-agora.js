// CUADRE DE SOLO LECTURA · Ágora ⇄ Control M (bloque 11).
// Analiza una exportación de Ágora (la misma que lee el conector, obtenida con
// include-processed=true y SIN llamar a /processed → no altera nada) y la resume
// con LAS MISMAS reglas que la ingesta de Control M, para cuadrar un día o un mes:
//   · Facturas + Albaranes = ventas.   · Pedidos (SalesOrder) = NO son venta.
//   · Líneas con cantidad negativa = devoluciones (restan).
//   · Señala posibles albarán+factura (doble conteo) por mismo Serie+Número.
// No decide identidad por contenido ni borra nada: solo informa (agora.1).

const tpv = require("./tpv-connector");

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function ymd(s) { return String(s || "").slice(0, 10); }

function tipoDe(doc) {
  const t = String(doc.__type || doc.type || doc.Type || doc.DocumentType || "").toLowerCase();
  if (/invoice|factura/.test(t)) return "Factura";
  if (/deliverynote|albaran|albarán/.test(t)) return "Albarán";
  if (/salesorder|pedido|comanda/.test(t)) return "Pedido";
  return "Otro";
}
function lineasDe(doc) {
  const L = doc.Lines || doc.lines || (doc.InvoiceItems && doc.InvoiceItems[0] && doc.InvoiceItems[0].Lines) || [];
  return Array.isArray(L) ? L : [];
}
function importeLinea(l) {
  return num(l.TotalAmount != null ? l.TotalAmount : (l.Amount != null ? l.Amount : (l.Total != null ? l.Total : l.importe)));
}
function cantidadLinea(l) {
  return num(l.Quantity != null ? l.Quantity : (l.Units != null ? l.Units : (l.cantidad != null ? l.cantidad : 1)));
}

// Analiza el export. Devuelve resumen por día + totales + avisos de doble conteo.
function analizarExport(bodyRaw, { dia = null } = {}) {
  const docs = tpv.extraerDocs(bodyRaw);
  const porDia = {};
  const claves = {}; // "serie|number" -> Set(tipos) para detectar albarán+factura
  let ivaPresente = false;

  docs.forEach((doc) => {
    const tipo = tipoDe(doc);
    const fecha = ymd(doc.BusinessDay || doc.businessDay || doc.Date || doc.date || doc.fecha);
    if (dia && fecha !== dia) return;
    const serie = doc.Serie != null ? doc.Serie : doc.serie;
    const number = doc.Number != null ? doc.Number : doc.number;
    const d = (porDia[fecha] = porDia[fecha] || { fecha, factura: 0, albaran: 0, pedido: 0, devolucion: 0, unidades: 0, docs: 0 });
    d.docs++;
    let brutoDoc = 0;
    lineasDe(doc).forEach((l) => {
      const cant = cantidadLinea(l);
      const imp = importeLinea(l);
      if (l.TaxRate != null || l.VatRate != null || l.NetAmount != null) ivaPresente = true;
      if (cant < 0 || imp < 0) { d.devolucion += -Math.abs(imp); }
      else { brutoDoc += imp; d.unidades += cant; }
    });
    if (tipo === "Factura") d.factura += brutoDoc;
    else if (tipo === "Albarán") d.albaran += brutoDoc;
    else if (tipo === "Pedido") d.pedido += brutoDoc;
    if ((tipo === "Factura" || tipo === "Albarán") && serie != null && number != null) {
      const k = `${serie}|${number}`;
      (claves[k] = claves[k] || new Set()).add(tipo);
    }
  });

  const dobleConteo = Object.entries(claves).filter(([, s]) => s.size > 1).map(([k]) => k);
  const dias = Object.values(porDia).map((d) => ({
    fecha: d.fecha,
    facturas: r2(d.factura),
    albaranes: r2(d.albaran),
    pedidos_excluidos: r2(d.pedido),
    devoluciones: r2(d.devolucion),
    // "Ventas Ágora" = facturas + albaranes + devoluciones (las devoluciones ya son negativas).
    // OJO: si una venta está como albarán Y factura, aquí aparece 2 veces (ver avisos).
    ventas_brutas: r2(d.factura + d.albaran + d.devolucion),
    unidades: r2(d.unidades),
    documentos: d.docs,
  })).sort((a, b) => a.fecha.localeCompare(b.fecha));

  const tot = dias.reduce((s, d) => ({
    facturas: s.facturas + d.facturas, albaranes: s.albaranes + d.albaranes,
    pedidos_excluidos: s.pedidos_excluidos + d.pedidos_excluidos, devoluciones: s.devoluciones + d.devoluciones,
    ventas_brutas: s.ventas_brutas + d.ventas_brutas, unidades: s.unidades + d.unidades, documentos: s.documentos + d.documentos,
  }), { facturas: 0, albaranes: 0, pedidos_excluidos: 0, devoluciones: 0, ventas_brutas: 0, unidades: 0, documentos: 0 });
  Object.keys(tot).forEach((k) => (tot[k] = r2(tot[k])));

  return {
    dias,
    total: tot,
    iva_detectado: ivaPresente,
    posible_doble_conteo: dobleConteo, // serie|number presentes como albarán Y factura
    nota: "Ventas = Facturas + Albaranes − Devoluciones; Pedidos excluidos. Compáralo con /api/ventas/conciliacion de Control M. Si hay 'posible_doble_conteo', revisa esos documentos: una venta puede estar como albarán y como factura.",
  };
}

module.exports = { analizarExport };
