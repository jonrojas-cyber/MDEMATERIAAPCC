// Integración con Ágora TPV.
//
// Ágora no ofrece una API REST pública de tiempo real; exporta datos (Excel/CSV)
// y hace un envío diario a su plataforma. Por eso integramos por CSV: se importa
// el export de ventas de Ágora y se descuenta automáticamente el stock de
// materias según el escandallo de cada producto.

const fs = require("fs");
const store = require("./data-store");

// Detecta el delimitador (; típico en Excel español, o ,) y parsea el CSV.
function parseCSV(texto) {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lineas.length) return [];
  const delim = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ";" : ",";
  const cabecera = lineas[0].split(delim).map((c) => c.trim().toLowerCase());
  return lineas.slice(1).map((linea) => {
    const celdas = linea.split(delim);
    const fila = {};
    cabecera.forEach((col, i) => (fila[col] = (celdas[i] || "").trim()));
    return fila;
  });
}

function buscarCampo(fila, nombres) {
  for (const n of nombres) {
    if (fila[n] != null && fila[n] !== "") return fila[n];
  }
  return null;
}

function num(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : parseFloat(v) || 0;
}

// Importa ventas desde el texto CSV de Ágora. Descuenta stock de materias según
// el escandallo de cada producto y registra cada venta. Devuelve un resumen.
function importarVentas(texto, fuente = "csv") {
  const filas = parseCSV(texto);
  const productos = store.readAll("productos");
  const materias = store.readAll("materias");
  const ventas = store.readAll("ventas");

  const idxProd = {};
  productos.forEach((p) => {
    if (p.clave) idxProd[p.clave.toLowerCase()] = p;
    if (p.nombre) idxProd[p.nombre.toLowerCase()] = p;
    if (p.id) idxProd[p.id.toLowerCase()] = p;
  });
  const idxMat = {};
  materias.forEach((m) => (idxMat[m.id] = m));

  let importadas = 0;
  const noReconocidos = [];

  filas.forEach((fila) => {
    const nombre = buscarCampo(fila, ["producto", "articulo", "artículo", "nombre", "descripcion", "descripción"]);
    const cantidad = num(buscarCampo(fila, ["cantidad", "uds", "unidades", "qty"])) || 1;
    const importe = num(buscarCampo(fila, ["importe", "total", "precio", "pvp"]));
    const fecha = buscarCampo(fila, ["fecha", "hora", "fechahora", "fecha_hora"]) || new Date().toISOString();
    if (!nombre) return;

    const producto = idxProd[String(nombre).toLowerCase()];
    if (!producto) {
      noReconocidos.push(nombre);
      return;
    }

    // Descontar stock de materias según el escandallo.
    (producto.ingredientes || []).forEach((ing) => {
      const m = idxMat[ing.materia_id];
      if (m) {
        m.disponibilidad_actual = Math.max(0, Math.round((m.disponibilidad_actual - ing.cantidad * cantidad) * 100) / 100);
      }
    });

    ventas.push({
      id: store.nextId("ven", "ventas"),
      producto_id: producto.id,
      producto: producto.nombre,
      cantidad,
      importe,
      fecha,
      fuente,
      importado_en: new Date().toISOString(),
    });
    importadas += cantidad;
  });

  store.writeAll("materias", materias);
  store.writeAll("ventas", ventas);

  const resumen = {
    fuente,
    lineas: filas.length,
    ventas_importadas: importadas,
    productos_no_reconocidos: [...new Set(noReconocidos)],
    cuando: new Date().toISOString(),
  };
  registrarSync(resumen);
  return resumen;
}

// ── Importación estructurada desde el export de Ágora (guía v8.9.3) ──────────
// Mapea cada línea vendida a su escandallo y descuenta stock, con las reglas
// críticas de la guía:
//   · Idempotencia por GlobalId, o por type+Serie+Number si no hay GlobalId.
//   · Si UN producto de la línea no está vinculado → el documento se BLOQUEA
//     (no se descuenta nada, no se marca procesado) hasta poder vincularlo.
//   · Todo cambio de stock deja un movimiento en 'stock_movements' (libro).
// El extractor es tolerante a variantes de nombre de campo.
function campoDoc(d, nombres) {
  for (const n of nombres) if (d && d[n] != null && d[n] !== "") return d[n];
  return null;
}
function lineasDe(doc) {
  const l = doc.Lines || doc.lines || doc.lineas || doc.items || doc.details || doc.detalle || [];
  return Array.isArray(l) ? l : [];
}
function tipoDoc(doc) {
  return String(campoDoc(doc, ["type", "Type", "documentType", "docType"]) || doc.__type || "Doc");
}
function serieNumero(doc) {
  const serie = campoDoc(doc, ["Serie", "serie", "series"]);
  const number = campoDoc(doc, ["Number", "number", "numero", "num"]);
  return { serie: serie != null ? String(serie) : null, number: number != null ? String(number) : null };
}
// Clave idempotente: GlobalId manda; si no, type:Serie:Number; si no, id/code.
function claveIdem(doc) {
  const gid = campoDoc(doc, ["GlobalId", "globalId", "global_id", "uuid"]);
  if (gid) return "gid:" + String(gid);
  const { serie, number } = serieNumero(doc);
  if (serie != null && number != null) return `${tipoDoc(doc)}:${serie}:${number}`;
  const id = campoDoc(doc, ["id", "docId", "documentId", "code", "codigo"]);
  return id ? "id:" + String(id) : "";
}
// Número robusto (no el parser CSV español): number nativo, "8.5", "1.234,56", "1,234.56".
function numJSON(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const s = String(v).trim();
  if (/,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s.replace(/,/g, "")) || 0;
}

// Normaliza el payload de Ágora a un array plano de docs con su tipo.
// Admite: array de docs, {documents:[...]}, o {Invoices:[...],DeliveryNotes:[...]}.
function normalizarDocs(docs) {
  if (Array.isArray(docs)) return docs;
  if (!docs || typeof docs !== "object") return [];
  if (Array.isArray(docs.documents)) return docs.documents;
  if (Array.isArray(docs.docs)) return docs.docs;
  const out = [];
  ["Invoices", "DeliveryNotes", "SalesOrders", "PurchaseOrders", "IncomingDeliveryNotes", "PurchaseInvoices"].forEach((tipo) => {
    if (Array.isArray(docs[tipo])) docs[tipo].forEach((d) => out.push({ ...d, __type: tipo.replace(/s$/, "") }));
  });
  return out;
}

function importarDocs(docs, { registrar, usuario } = {}) {
  const lista = normalizarDocs(docs);
  const productos = store.readAll("productos");
  const materias = store.readAll("materias");
  const ventas = store.readAll("ventas");
  const docsAgora = store.readAll("docs_agora");
  const procesadosPrev = new Set(docsAgora.filter((d) => d.status === "processed").map((d) => d.id));
  const porClave = {};
  docsAgora.forEach((d) => (porClave[d.id] = d));

  const idxProd = {};
  productos.forEach((p) => {
    [p.clave, p.nombre, p.id, p.agora_ref].forEach((k) => { if (k) idxProd[String(k).toLowerCase()] = p; });
  });
  const idxMat = {};
  materias.forEach((m) => (idxMat[m.id] = m));

  const procesados = [];     // {clave, serie, number, type}
  const bloqueados = [];     // {clave, no_vinculados:[...]}
  const omitidos = [];
  const noVinculados = new Set();
  const movimientos = [];
  let unidades = 0, importeTotal = 0;
  const nowISO = new Date().toISOString();

  lista.forEach((doc) => {
    const clave = claveIdem(doc);
    if (!clave) return; // sin identificador no hay idempotencia
    if (procesadosPrev.has(clave)) { omitidos.push(clave); return; }

    const fecha = campoDoc(doc, ["BusinessDay", "businessDay", "business_day", "Date", "date", "fecha"]) || nowISO;
    const { serie, number } = serieNumero(doc);
    const type = tipoDoc(doc);

    // 1) Resolver TODAS las líneas primero (no descontamos nada aún).
    const resueltas = [];
    const faltan = [];
    lineasDe(doc).forEach((ln) => {
      if (campoDoc(ln, ["Cancelled", "cancelled", "anulada", "voided"])) return; // línea anulada
      const nombre = campoDoc(ln, ["ProductName", "product", "productName", "Name", "name", "Reference", "reference", "referencia", "descripcion", "descripción", "nombre"]);
      const cantidad = numJSON(campoDoc(ln, ["Quantity", "quantity", "Units", "units", "cantidad", "uds", "qty"])) || 1;
      const importe = numJSON(campoDoc(ln, ["Amount", "amount", "Total", "total", "importe", "price", "precio", "pvp"]));
      if (!nombre) return;
      const producto = idxProd[String(nombre).toLowerCase()];
      if (!producto) { faltan.push(String(nombre)); noVinculados.add(String(nombre)); return; }
      resueltas.push({ producto, cantidad, importe, nombre });
    });

    // 2) Si falta algún producto por vincular → BLOQUEAR (no descontar, no marcar).
    if (faltan.length) {
      const rec = { id: clave, status: "blocked", type, serie, number, fecha, no_vinculados: [...new Set(faltan)], visto_en: nowISO };
      if (porClave[clave]) store.update("docs_agora", clave, rec); else store.insert("docs_agora", rec);
      bloqueados.push({ clave, no_vinculados: rec.no_vinculados });
      return;
    }

    // 3) Descontar stock + libro de movimientos + registrar venta.
    resueltas.forEach(({ producto, cantidad, importe }) => {
      (producto.ingredientes || []).forEach((ing) => {
        const m = idxMat[ing.materia_id];
        if (!m) return;
        const delta = -Math.round(ing.cantidad * cantidad * 100) / 100;
        m.disponibilidad_actual = Math.max(0, Math.round((m.disponibilidad_actual + delta) * 100) / 100);
        movimientos.push({
          id: store.nextId("mov", "stock_movements"),
          source: "agora", source_ref: `${type}:${serie}:${number}`,
          materia_id: m.id, delta, unidad: m.unidad || "", reason: "venta",
          producto: producto.nombre, created_at: nowISO, created_by: (usuario && usuario.nombre) || "Ágora",
        });
      });
      ventas.push({
        id: store.nextId("ven", "ventas"),
        producto_id: producto.id, producto: producto.nombre,
        cantidad, importe, fecha, fuente: "agora",
        doc_clave: clave, doc_serie: serie, doc_number: number, importado_en: nowISO,
      });
      unidades += cantidad; importeTotal += importe;
    });

    const rec = { id: clave, status: "processed", type, serie, number, fecha, procesado_en: nowISO };
    if (porClave[clave]) store.update("docs_agora", clave, rec); else store.insert("docs_agora", rec);
    procesados.push({ clave, serie, number, type });
  });

  movimientos.forEach((mv) => store.insert("stock_movements", mv));
  store.writeAll("materias", materias);
  store.writeAll("ventas", ventas);

  const resumen = {
    fuente: "agora",
    documentos: lista.length,
    procesados: procesados.length,
    bloqueados: bloqueados.length,
    omitidos_ya_procesados: omitidos.length,
    unidades_vendidas: Math.round(unidades * 100) / 100,
    importe_total: Math.round(importeTotal * 100) / 100,
    productos_no_vinculados: [...noVinculados],
    cuando: nowISO,
  };
  registrarSync(resumen);
  if (typeof registrar === "function") registrar(resumen);
  // procesados_ref: lo que hay que confirmar a Ágora (POST /api/doc/processed).
  return { ...resumen, procesados_ref: procesados.map((p) => ({ Serie: p.serie, Number: p.number })), bloqueados_detalle: bloqueados };
}

function registrarSync(resumen) {
  store.insert("sincronizaciones", { id: store.nextId("syn", "sincronizaciones"), ...resumen });
}

function ultimaSync() {
  const syncs = store.readAll("sincronizaciones");
  if (!syncs.length) return null;
  return syncs[syncs.length - 1];
}

// Tarea horaria: si hay un CSV configurado (AGORA_CSV_PATH), lo importa.
function cronImport() {
  const path = process.env.AGORA_CSV_PATH;
  if (!path) return; // sin fuente configurada, no hace nada
  try {
    if (!fs.existsSync(path)) return;
    const texto = fs.readFileSync(path, "utf-8");
    const r = importarVentas(texto, "cron");
    console.log(`Ágora cron: ${r.ventas_importadas} ventas importadas desde ${path}`);
  } catch (e) {
    console.error("Ágora cron error:", e.message);
  }
}

module.exports = { parseCSV, importarVentas, importarDocs, ultimaSync, cronImport };
