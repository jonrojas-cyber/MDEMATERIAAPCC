// CONCILIACIÓN DE VENTAS · cuadrar Control M con Ágora al céntimo.
// Dado un día, desglosa lo que Control M tiene registrado para que la discrepancia
// con Ágora (p. ej. 707 € aquí vs 658 € en Ágora, ambos CON IVA) salte a la vista:
//   · total bruto (lo que ve el dashboard) y neto,
//   · desglose por TIPO de documento (Factura / Albarán / ticket manual): si una
//     venta entra como albarán Y como factura se cuenta dos veces → aquí se ve,
//   · ticket a ticket (serie/nº, tipo, hora, importe) para cazar extras,
//   · DUPLICADOS sospechosos: tickets con la misma firma (mismos productos + mismo
//     importe) bajo documentos distintos → casi seguro la misma venta repetida,
//   · precio real por producto (importe/uds) frente al PVP de la carta ("escaneo de
//     cada precio"), marcando los que no coinciden.
// No reimplementa dinero: lee las ventas ya registradas (misma fuente que el P&L).

const store = require("./data-store");

function eur(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function ymdLocal(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function hhmm(f) {
  const d = new Date(f);
  if (!Number.isFinite(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Etiqueta legible del tipo de documento a partir de la venta / su doc.
function etiquetaTipo(v, docsById) {
  const doc = v.doc_clave ? docsById[v.doc_clave] : null;
  const t = (doc && doc.type) || v.doc_tipo || "";
  const s = String(t).toLowerCase();
  if (s.includes("invoice") || s.includes("factura")) return "Factura";
  if (s.includes("deliverynote") || s.includes("albaran") || s.includes("albarán")) return "Albarán";
  if (s.includes("salesorder") || s.includes("pedido")) return "Pedido";
  if (String(v.doc_clave || "").startsWith("TicketExport")) return "Ticket (CSV)";
  if (v.fuente === "agora") return "Ágora";
  return "Otro";
}

// Firma de un ticket para detectar la MISMA venta repetida bajo otro documento:
// productos+cantidades ordenados junto al importe redondeado del ticket.
function firmaTicket(lineas, importe) {
  const prod = lineas
    .map((l) => `${l.producto || l.producto_id}:${l.cantidad}`)
    .sort()
    .join("|");
  return `${prod}#${eur(importe)}`;
}

// Prioridad del documento en el ciclo de vida de Ágora: Pedido → Albarán → Factura.
// La Factura es la verdad fiscal; cuando una misma venta aparece en varios tipos, se
// queda la de mayor prioridad y el resto es doble conteo. En CAFÉS muchos tickets son
// idénticos (20 cafés iguales) y eso NO es duplicado: solo lo es cuando la misma firma
// aparece bajo TIPOS DE DOCUMENTO DISTINTOS (ahí sí es la misma venta repetida).
const PRIO_TIPO = { "Factura": 4, "Ticket (CSV)": 3, "Albarán": 2, "Pedido": 1 };
function prioTipo(t) { return PRIO_TIPO[t] || 0; }

function conciliacionDia(dia, now = Date.now()) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(dia || "")) ? String(dia) : ymdLocal(now);

  const ventas = store.readAll("ventas").filter((v) => String(v.fecha || "").slice(0, 10) === d);
  const docsById = {};
  store.readAll("docs_agora").forEach((x) => { docsById[x.id] = x; });

  // Índice de PVP de carta por id y por nombre (para el escaneo de precios).
  const pvpById = {}; const pvpByName = {};
  store.readAll("productos").forEach((p) => {
    if (p.precio_venta != null && p.precio_venta !== "") {
      pvpById[p.id] = Number(p.precio_venta);
      if (p.nombre) pvpByName[String(p.nombre).toLowerCase()] = Number(p.precio_venta);
    }
  });

  let bruto = 0, neto = 0, unidades = 0, netoDisp = false;
  const prod = {};        // por producto
  const tk = {};          // por ticket (doc_clave)
  const porTipo = {};     // por tipo de documento

  ventas.forEach((v) => {
    const imp = Number(v.importe) || 0;
    const nt = (v.importe_neto != null && v.importe_neto !== "") ? Number(v.importe_neto) : null;
    const cant = Number(v.cantidad) || 0;
    bruto += imp;
    neto += (nt != null ? nt : imp);
    if (nt != null) netoDisp = true;
    unidades += cant;

    // Por producto
    const pk = v.producto_id || v.producto || "?";
    if (!prod[pk]) {
      const pvp = pvpById[v.producto_id] != null ? pvpById[v.producto_id]
        : (pvpByName[String(v.producto || "").toLowerCase()] != null ? pvpByName[String(v.producto || "").toLowerCase()] : null);
      prod[pk] = { nombre: v.producto || pk, unidades: 0, bruto: 0, neto: 0, pvp_carta: pvp };
    }
    prod[pk].unidades += cant;
    prod[pk].bruto += imp;
    prod[pk].neto += (nt != null ? nt : imp);

    // Por ticket
    const tkey = v.doc_clave || `(sin doc) ${v.id}`;
    if (!tk[tkey]) {
      tk[tkey] = {
        clave: tkey,
        ref: (v.doc_serie != null || v.doc_number != null) ? `${v.doc_serie || ""}${v.doc_number != null ? "/" + v.doc_number : ""}` : tkey,
        tipo: etiquetaTipo(v, docsById),
        hora: hhmm(v.fecha),
        importe: 0, unidades: 0, lineas: [],
      };
    }
    tk[tkey].importe += imp;
    tk[tkey].unidades += cant;
    tk[tkey].lineas.push({ producto: v.producto, producto_id: v.producto_id, cantidad: cant, importe: eur(imp) });

    // Por tipo
    const et = etiquetaTipo(v, docsById);
    if (!porTipo[et]) porTipo[et] = { tipo: et, bruto: 0, tickets: new Set() };
    porTipo[et].bruto += imp;
    porTipo[et].tickets.add(tkey);
  });

  // Duplicados ESTRUCTURALES: misma firma (productos+importe) bajo >1 tipo de
  // documento. Esto sí es doble conteo (p. ej. un albarán que luego se factura).
  // Los tickets idénticos del MISMO tipo (cafés iguales) NO se tocan: son ventas reales.
  const porFirma = {};
  Object.values(tk).forEach((t) => {
    const f = firmaTicket(t.lineas, t.importe);
    (porFirma[f] = porFirma[f] || []).push(t);
  });
  const duplicados = [];
  Object.values(porFirma).forEach((grupo) => {
    const tipos = new Set(grupo.map((t) => t.tipo));
    if (grupo.length < 2 || tipos.size < 2) return; // mismo tipo o único → no es doble conteo
    // Se queda el de mayor prioridad (Factura); el resto es el importe duplicado.
    const ordenado = grupo.slice().sort((a, b) => prioTipo(b.tipo) - prioTipo(a.tipo) || (a.hora || "").localeCompare(b.hora || ""));
    const sobran = ordenado.slice(1);
    duplicados.push({
      importe_unitario: eur(ordenado[0].importe),
      veces: grupo.length,
      importe_duplicado: eur(sobran.reduce((s, t) => s + t.importe, 0)),
      se_queda: { ref: ordenado[0].ref, tipo: ordenado[0].tipo, hora: ordenado[0].hora },
      tickets: ordenado.map((t) => ({ ref: t.ref, tipo: t.tipo, hora: t.hora, importe: eur(t.importe) })),
    });
  });
  duplicados.sort((a, b) => b.importe_duplicado - a.importe_duplicado);
  const total_duplicado = eur(duplicados.reduce((s, x) => s + x.importe_duplicado, 0));

  const por_producto = Object.values(prod).map((p) => {
    const precio_real = p.unidades > 0 ? eur(p.bruto / p.unidades) : null;
    const coincide = (p.pvp_carta == null || precio_real == null) ? null : Math.abs(precio_real - p.pvp_carta) < 0.02;
    return {
      nombre: p.nombre,
      unidades: Math.round(p.unidades * 100) / 100,
      bruto: eur(p.bruto),
      neto: eur(p.neto),
      precio_real,
      pvp_carta: p.pvp_carta != null ? eur(p.pvp_carta) : null,
      coincide,
    };
  }).sort((a, b) => b.bruto - a.bruto);

  const por_tipo = Object.values(porTipo)
    .map((t) => ({ tipo: t.tipo, bruto: eur(t.bruto), tickets: t.tickets.size }))
    .sort((a, b) => b.bruto - a.bruto);

  const tickets = Object.values(tk)
    .map((t) => ({ ref: t.ref, tipo: t.tipo, hora: t.hora, importe: eur(t.importe), unidades: Math.round(t.unidades * 100) / 100 }))
    .sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

  return {
    dia: d,
    bruto: eur(bruto),
    neto: eur(neto),
    neto_disponible: netoDisp,
    unidades: Math.round(unidades * 100) / 100,
    num_tickets: tickets.length,
    total_duplicado,
    por_tipo,
    duplicados,
    por_producto,
    tickets,
  };
}

// Quita de un día los duplicados ESTRUCTURALES (misma venta bajo tipos de documento
// distintos): se queda la Factura y elimina el albarán/pedido equivalente, reponiendo
// el stock que ese documento descontó de más y marcando su doc como dedup (para que el
// conector no lo reenvíe). Es la remediación de lo ya importado antes del arreglo.
async function limpiarDuplicados(dia, usuario, now = Date.now()) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(dia || "")) ? String(dia) : ymdLocal(now);
  const nowISO = new Date(now).toISOString();

  const todas = store.readAll("ventas");
  const docsById = {};
  store.readAll("docs_agora").forEach((x) => { docsById[x.id] = x; });

  // Agrupar las ventas del día por ticket (doc_clave).
  const tk = {};
  todas.forEach((v) => {
    if (String(v.fecha || "").slice(0, 10) !== d) return;
    const key = v.doc_clave;
    if (!key) return; // sin documento no se concilia (no se toca)
    if (!tk[key]) tk[key] = { clave: key, tipo: etiquetaTipo(v, docsById), hora: hhmm(v.fecha), importe: 0, lineas: [], ventaIds: [] };
    tk[key].importe += Number(v.importe) || 0;
    tk[key].lineas.push({ producto: v.producto, producto_id: v.producto_id, cantidad: Number(v.cantidad) || 0 });
    tk[key].ventaIds.push(v.id);
  });

  // Firma por ticket → grupos; en cada grupo cruzado, se queda el de mayor prioridad.
  const porFirma = {};
  Object.values(tk).forEach((t) => { const f = firmaTicket(t.lineas, t.importe); (porFirma[f] = porFirma[f] || []).push(t); });
  const clavesAEliminar = [];
  Object.values(porFirma).forEach((grupo) => {
    const tipos = new Set(grupo.map((t) => t.tipo));
    if (grupo.length < 2 || tipos.size < 2) return;
    const ordenado = grupo.slice().sort((a, b) => prioTipo(b.tipo) - prioTipo(a.tipo) || (a.hora || "").localeCompare(b.hora || ""));
    ordenado.slice(1).forEach((t) => clavesAEliminar.push(t.clave));
  });

  if (!clavesAEliminar.length) {
    return { dia: d, eliminados: 0, importe_quitado: 0, unidades_quitadas: 0, tickets_quitados: 0, stock_repuesto: 0 };
  }
  const setElim = new Set(clavesAEliminar);

  // Índices para reponer stock (reverso exacto del descuento de agora.importarDocs).
  const productos = store.readAll("productos");
  const prodById = {}; productos.forEach((p) => { prodById[p.id] = p; });
  const materias = store.readAll("materias");
  const matById = {}; materias.forEach((m) => { matById[m.id] = m; });

  let importeQuitado = 0, unidadesQuitadas = 0, eliminados = 0, stockRepuesto = 0;
  const movimientos = [];
  const quedan = todas.filter((v) => {
    if (!(setElim.has(v.doc_clave) && String(v.fecha || "").slice(0, 10) === d)) return true;
    // Esta venta se elimina: reponer el stock que descontó.
    importeQuitado += Number(v.importe) || 0;
    unidadesQuitadas += Number(v.cantidad) || 0;
    eliminados++;
    const prod = prodById[v.producto_id];
    if (prod) {
      (prod.ingredientes || []).forEach((ing) => {
        const m = matById[ing.materia_id];
        if (!m) return;
        const delta = Math.round(ing.cantidad * (Number(v.cantidad) || 0) * 100) / 100; // +: reponer
        if (!delta) return;
        m.disponibilidad_actual = Math.round(((Number(m.disponibilidad_actual) || 0) + delta) * 100) / 100;
        stockRepuesto += delta;
        movimientos.push({
          id: store.nextId("mov", "stock_movements"),
          source: "conciliacion", source_ref: String(v.doc_clave || ""),
          materia_id: m.id, delta, unidad: m.unidad || "", reason: "reverso_duplicado",
          producto: prod.nombre, created_at: nowISO, created_by: (usuario && usuario.nombre) || "Conciliación",
        });
      });
    }
    return false;
  });

  movimientos.forEach((mv) => store.insert("stock_movements", mv));
  store.writeAll("materias", materias);
  store.writeAll("ventas", quedan);
  // Marcar los documentos eliminados como dedup para que el conector no los reenvíe.
  clavesAEliminar.forEach((clave) => {
    if (docsById[clave]) store.update("docs_agora", clave, { status: "processed", dedup: true, dedup_en: nowISO });
  });
  await store.flush();

  return {
    dia: d,
    eliminados,
    tickets_quitados: clavesAEliminar.length,
    importe_quitado: eur(importeQuitado),
    unidades_quitadas: Math.round(unidadesQuitadas * 100) / 100,
    stock_repuesto: Math.round(stockRepuesto * 100) / 100,
  };
}

module.exports = { conciliacionDia, limpiarDuplicados };
