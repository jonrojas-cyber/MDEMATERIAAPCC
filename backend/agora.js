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

// ── Importación estructurada desde el export de Ágora (JSON) ────────────────
// Puente iframe + agora:pos:invoke-api: Ágora exporta Invoices/DeliveryNotes del
// business-day; aquí mapeamos cada producto vendido a su escandallo y
// descontamos stock. IDEMPOTENTE: cada documento se procesa una sola vez (se
// recuerda su id en 'docs_agora'); el frontend confirma a Ágora con
// POST /api/doc/processed para que deje de reexportarlo.
// El schema exacto vive en la guía v8.9.3; el extractor es tolerante a variantes.
function campoDoc(d, nombres) {
  for (const n of nombres) if (d && d[n] != null && d[n] !== "") return d[n];
  return null;
}
function lineasDe(doc) {
  const l = doc.lines || doc.lineas || doc.items || doc.details || doc.detalle || [];
  return Array.isArray(l) ? l : [];
}
function docId(doc) {
  return String(campoDoc(doc, ["id", "docId", "documentId", "number", "numero", "code", "codigo"]) || "");
}
// Número robusto para el puente JSON (no el parser de CSV español): admite
// number nativo, "8.5", "1.234,56" (europeo) y "1,234.56" (anglosajón).
function numJSON(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const s = String(v).trim();
  if (/,\d{1,2}$/.test(s)) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0; // 1.234,56
  return parseFloat(s.replace(/,/g, "")) || 0; // 8.5 · 17 · 1,234.56
}

function importarDocs(docs, { registrar } = {}) {
  const lista = Array.isArray(docs) ? docs : Array.isArray(docs && docs.documents) ? docs.documents : [];
  const productos = store.readAll("productos");
  const materias = store.readAll("materias");
  const ventas = store.readAll("ventas");
  const procesadosPrev = new Set(store.readAll("docs_agora").map((d) => d.id));

  const idxProd = {};
  productos.forEach((p) => {
    [p.clave, p.nombre, p.id, p.agora_ref].forEach((k) => { if (k) idxProd[String(k).toLowerCase()] = p; });
  });
  const idxMat = {};
  materias.forEach((m) => (idxMat[m.id] = m));

  const procesados = [];
  const omitidos = [];
  const noReconocidos = [];
  let unidades = 0, importeTotal = 0;

  lista.forEach((doc) => {
    const id = docId(doc);
    if (!id) return; // sin id no hay idempotencia posible
    if (procesadosPrev.has(id)) { omitidos.push(id); return; }

    const fecha = campoDoc(doc, ["businessDay", "business_day", "date", "fecha", "fechaHora"]) || new Date().toISOString();
    let lineasProc = 0;
    lineasDe(doc).forEach((ln) => {
      const nombre = campoDoc(ln, ["product", "productName", "name", "reference", "referencia", "articulo", "artículo", "descripcion", "descripción", "nombre"]);
      const cantidad = numJSON(campoDoc(ln, ["quantity", "units", "cantidad", "uds", "unidades", "qty"])) || 1;
      const importe = numJSON(campoDoc(ln, ["amount", "total", "importe", "price", "precio", "pvp"]));
      if (!nombre) return;
      const producto = idxProd[String(nombre).toLowerCase()];
      if (!producto) { noReconocidos.push(nombre); return; }

      (producto.ingredientes || []).forEach((ing) => {
        const m = idxMat[ing.materia_id];
        if (m) m.disponibilidad_actual = Math.max(0, Math.round((m.disponibilidad_actual - ing.cantidad * cantidad) * 100) / 100);
      });
      ventas.push({
        id: store.nextId("ven", "ventas"),
        producto_id: producto.id, producto: producto.nombre,
        cantidad, importe, fecha, fuente: "agora",
        doc_id: id, importado_en: new Date().toISOString(),
      });
      unidades += cantidad; importeTotal += importe; lineasProc += 1;
    });

    // Marca el documento como procesado (idempotencia), aunque no reconozca todo.
    store.insert("docs_agora", { id, procesado_en: new Date().toISOString(), lineas: lineasProc, fecha });
    procesados.push(id);
  });

  store.writeAll("materias", materias);
  store.writeAll("ventas", ventas);

  const resumen = {
    fuente: "agora",
    documentos: lista.length,
    procesados: procesados.length,
    omitidos_ya_procesados: omitidos.length,
    unidades_vendidas: Math.round(unidades * 100) / 100,
    importe_total: Math.round(importeTotal * 100) / 100,
    productos_no_reconocidos: [...new Set(noReconocidos)],
    cuando: new Date().toISOString(),
  };
  registrarSync(resumen);
  if (typeof registrar === "function") registrar(resumen);
  return { ...resumen, procesados_ids: procesados, omitidos_ids: omitidos };
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
