// Integración con Ágora TPV.
//
// Ágora no ofrece una API REST pública de tiempo real; exporta datos (Excel/CSV)
// y hace un envío diario a su plataforma. Por eso integramos por CSV: se importa
// el export de ventas de Ágora y se descuenta automáticamente el stock de
// materias según el escandallo de cada producto.

const fs = require("fs");
const crypto = require("crypto");
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

// Normaliza un nombre de producto para emparejar Ágora ↔ Control M sin que fallen
// las TILDES, MAYÚSCULAS o ESPACIOS ("Té verde" == "te verde", "colección" ==
// "coleccion", "Iced  Latte" == "iced latte"). Es la clave del índice de productos.
function normProd(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Importa ventas desde el texto CSV de Ágora. Descuenta stock de materias según
// el escandallo de cada producto y registra cada venta. Devuelve un resumen.
function importarVentas(texto, fuente = "csv") {
  const filas = parseCSV(texto);
  const productos = store.readAll("productos");
  const materias = store.readAll("materias");
  const ventasPrevias = store.readAll("ventas");
  const nowISO = new Date().toISOString();

  const idxProd = {};
  productos.forEach((p) => {
    [p.clave, p.nombre, p.id, p.agora_ref].forEach((k) => { if (k) idxProd[normProd(k)] = p; });
  });
  const idxMat = {};
  materias.forEach((m) => (idxMat[m.id] = m));
  const prodById = {};
  productos.forEach((p) => { prodById[p.id] = p; });

  const dia = (f) => String(f || "").slice(0, 10);
  const ajustarStock = (producto, cantidad, signo) => {
    (producto && producto.ingredientes || []).forEach((ing) => {
      const m = idxMat[ing.materia_id];
      if (m) m.disponibilidad_actual = Math.max(0, Math.round(((Number(m.disponibilidad_actual) || 0) + signo * ing.cantidad * cantidad) * 100) / 100);
    });
  };

  let importadas = 0;
  const noReconocidos = [];
  const nuevas = [];
  const dias = new Set();

  filas.forEach((fila) => {
    const nombre = buscarCampo(fila, ["producto", "articulo", "artículo", "nombre", "descripcion", "descripción"]);
    const cantidad = num(buscarCampo(fila, ["cantidad", "uds", "unidades", "qty"])) || 1;
    const importe = num(buscarCampo(fila, ["importe", "total", "precio", "pvp"]));
    const fecha = buscarCampo(fila, ["fecha", "hora", "fechahora", "fecha_hora"]) || nowISO;
    if (!nombre) return;
    const producto = idxProd[normProd(nombre)];
    if (!producto) { noReconocidos.push(nombre); return; }
    dias.add(dia(fecha));
    nuevas.push({ id: store.nextId("ven", "ventas"), producto_id: producto.id, producto: producto.nombre, cantidad, importe, fecha, fuente, importado_en: nowISO });
    importadas += cantidad;
  });

  // IDEMPOTENCIA (agora.3): reemplaza por FUENTE + DÍA. Reimportar el mismo periodo
  // NO duplica; un solapamiento parcial solo reemplaza los días comunes. NO toca
  // ventas de otra fuente (p. ej. del conector) ni deduplica por contenido.
  const reemplazadas = ventasPrevias.filter((v) => v.fuente === fuente && dias.has(dia(v.fecha)));
  const quedan = ventasPrevias.filter((v) => !(v.fuente === fuente && dias.has(dia(v.fecha))));
  // Stock NEUTRO al reimportar: revierte el consumo de las filas reemplazadas y
  // aplica el de las nuevas (si el CSV es el mismo, el neto es cero).
  reemplazadas.forEach((v) => ajustarStock(prodById[v.producto_id], Number(v.cantidad) || 0, +1));
  nuevas.forEach((v) => ajustarStock(prodById[v.producto_id], Number(v.cantidad) || 0, -1));

  store.writeAll("materias", materias);
  store.writeAll("ventas", quedan.concat(nuevas));

  const resumen = {
    fuente,
    lineas: filas.length,
    ventas_importadas: importadas,
    reemplazadas: reemplazadas.length, // filas de la MISMA fuente+día sustituidas (no duplicadas)
    dias: [...dias],
    productos_no_reconocidos: [...new Set(noReconocidos)],
    cuando: nowISO,
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
  // Líneas directas (albaranes/pedidos simples).
  const directas = doc.Lines || doc.lines || doc.lineas || doc.items || doc.details || doc.detalle;
  if (Array.isArray(directas) && directas.length) return directas;
  // Estructura anidada real de Ágora: el documento agrupa "items" (cada consumo
  // o ticket) y cada uno lleva sus propias Lines.
  // Ej.: Invoice → InvoiceItems[] → Lines[].
  const grupos =
    doc.InvoiceItems || doc.DeliveryNoteItems || doc.OrderItems ||
    doc.Items || doc.Tickets || doc.Documents || doc.Content;
  if (Array.isArray(grupos)) {
    const out = [];
    grupos.forEach((g) => {
      const sub = (g && (g.Lines || g.lines || g.lineas || g.items)) || [];
      if (Array.isArray(sub)) out.push(...sub);
    });
    if (out.length) return out;
  }
  return Array.isArray(directas) ? directas : [];
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
// Referencias documentales de ORIGEN de un documento (p. ej. una factura que
// consolida varios albaranes). Se guardan para que la conciliación pueda
// deduplicar SOLO con vínculo explícito (agora.1). Si Ágora no las trae, null.
function referenciasOrigen(doc) {
  const campos = ["DeliveryNotes", "deliveryNotes", "Albaranes", "albaranes", "SourceDocuments", "sourceDocuments", "DocumentosOrigen", "References", "referencias"];
  for (const c of campos) {
    const v = doc && doc[c];
    if (Array.isArray(v) && v.length) {
      const out = v.map((x) => {
        if (x == null) return null;
        if (typeof x === "object") return { serie: x.Serie != null ? x.Serie : x.serie, number: x.Number != null ? x.Number : x.number };
        return x;
      }).filter(Boolean);
      if (out.length) return out;
    }
  }
  return null;
}
// ¿Documento ANULADO/cancelado? (agora.5). Admite banderas booleanas y estados
// de texto habituales. Si Ágora usa otro nombre de campo, se añade aquí (ver nota
// en el cuadre: hace falta una muestra para fijar el nombre exacto).
function esAnulado(doc) {
  if (!doc || typeof doc !== "object") return false;
  if (doc.Cancelled === true || doc.Voided === true || doc.IsVoid === true || doc.Anulado === true || doc.anulado === true || doc.Annulled === true) return true;
  const s = String(doc.Status || doc.status || doc.State || doc.estado || "").toLowerCase();
  return /anulad|cancelad|cancel|void|anulada/.test(s);
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
    [p.clave, p.nombre, p.id, p.agora_ref].forEach((k) => { if (k) idxProd[normProd(k)] = p; });
  });
  const idxMat = {};
  materias.forEach((m) => (idxMat[m.id] = m));

  const procesados = [];     // {clave, serie, number, type}
  const bloqueados = [];     // {clave, no_vinculados:[...]}
  const omitidos = [];
  const omitidosPedido = []; // pedidos/comandas: no son venta cerrada, no se cuentan
  const deduplicados = [];   // {serie, number} ya existentes por otra vía (no se duplican)
  const noVinculados = new Set();
  const materiasFaltantes = new Set(); // escandallos que apuntan a una materia inexistente (datos.7)
  const anulados = []; // documentos anulados/cancelados: no son venta (agora.5)
  const posiblesDuplicados = []; // mismo Serie+Número+día que una venta existente: se marca, NO se descarta (agora.4)
  const movimientos = [];
  const nuevasVentas = []; // se insertan en LOTE al final, sin reescribir la tabla (datos.5)
  let unidades = 0, importeTotal = 0;
  const nowISO = new Date().toISOString();

  // Anti-duplicados por CLAVE DE NEGOCIO (Serie + Número + día). Evita contar dos
  // veces una venta que ya entró por otra vía (p. ej. el import manual del "Análisis
  // de Ventas", cuya clave idempotente es "TicketExport:…" en vez de "Invoice:…").
  // El número se normaliza a entero (Ágora da 3719; el export da "003719").
  const bizKey = (s, n, f) => {
    const num = parseInt(String(n == null ? "" : n).replace(/[^0-9]/g, ""), 10);
    return `${String(s == null ? "" : s).trim()}|${Number.isFinite(num) ? num : 0}|${String(f || "").slice(0, 10)}`;
  };
  const ventasBiz = new Set();
  ventas.forEach((v) => { if (v.doc_serie != null || v.doc_number != null) ventasBiz.add(bizKey(v.doc_serie, v.doc_number, v.fecha)); });

  lista.forEach((doc) => {
    const clave = claveIdem(doc);
    if (!clave) return; // sin identificador no hay idempotencia
    if (procesadosPrev.has(clave)) { omitidos.push(clave); return; }

    const fecha = campoDoc(doc, ["BusinessDay", "businessDay", "business_day", "Date", "date", "fecha"]) || nowISO;
    const { serie, number } = serieNumero(doc);
    const type = tipoDoc(doc);

    // Un PEDIDO/comanda (SalesOrder) NO es una venta cerrada: Ágora no lo cuenta en
    // "VENTAS HOY" y aquí tampoco debe registrarse como venta (si la venta se cierra,
    // llega además como albarán/factura). Evita contar de más sin riesgo de perder
    // ventas reales. Se marca procesado para que el conector no lo reenvíe.
    if (/salesorder|pedido|comanda/i.test(String(type || ""))) {
      const rec = { id: clave, status: "processed", type, serie, number, fecha, procesado_en: nowISO, no_venta: true };
      if (porClave[clave]) store.update("docs_agora", clave, rec); else store.insert("docs_agora", rec);
      omitidosPedido.push({ serie, number });
      return;
    }

    // Documento ANULADO/cancelado: no es venta (agora.5). No se cuenta y se marca
    // procesado para que el conector no lo reenvíe. (Las INVITACIONES llegan como
    // líneas con importe 0 → ya suman 0; las DEVOLUCIONES, con cantidad negativa
    // → ya restan.)
    if (esAnulado(doc)) {
      const rec = { id: clave, status: "processed", type, serie, number, fecha, procesado_en: nowISO, no_venta: true, anulado: true };
      if (porClave[clave]) store.update("docs_agora", clave, rec); else store.insert("docs_agora", rec);
      anulados.push({ serie, number });
      return;
    }

    // ¿Coincide por Serie+Número+día con una venta ya existente (otra vía/tipo)?
    // NO se descarta (podría ser un documento DISTINTO · agora.4): se importa igual
    // y se MARCA como posible duplicado, conservando trazabilidad del origen. La
    // conciliación lo revisa con vínculo documental; nunca se pierde una venta en
    // silencio. El documento idéntico re-enviado (misma clave) ya se omitió antes.
    const bk = bizKey(serie, number, fecha);
    const posibleDup = (serie != null && number != null && ventasBiz.has(bk));
    if (posibleDup) posiblesDuplicados.push({ serie, number, type });

    // 1) Resolver TODAS las líneas primero (no descontamos nada aún).
    const resueltas = [];
    const faltan = [];
    lineasDe(doc).forEach((ln) => {
      if (campoDoc(ln, ["Cancelled", "cancelled", "anulada", "voided"])) return; // línea anulada
      const nombre = campoDoc(ln, ["ProductName", "product", "productName", "Name", "name", "Reference", "reference", "referencia", "descripcion", "descripción", "nombre"]);
      const cantidad = numJSON(campoDoc(ln, ["Quantity", "quantity", "Units", "units", "cantidad", "uds", "qty"]));
      const importeRaw = numJSON(campoDoc(ln, ["TotalAmount", "Amount", "amount", "Total", "total", "importe", "GrossAmount", "UnitPrice", "ProductPrice", "price", "precio", "pvp"]));
      // Neto (base sin IVA) si el documento lo trae; la cuenta de resultados va
      // sobre neto. Si no viene, queda null y el P&L cae al importe.
      const netoRaw = campoDoc(ln, ["Base", "base", "NetAmount", "net", "neto", "BaseAmount", "importe_neto"]);
      if (!nombre) return;
      // Cantidad 0 o no numérica: no es línea de venta. Las NEGATIVAS (devoluciones/
      // abonos) SÍ entran, pero RESTANDO: se registran en negativo para netear igual
      // que Ágora (antes se descartaban y Control M quedaba por encima de Ágora).
      if (!Number.isFinite(cantidad) || cantidad === 0) return;
      // El importe (y el neto) siguen el signo de la cantidad, mande Ágora el importe
      // en positivo o en negativo: así una devolución siempre resta.
      const signo = cantidad < 0 ? -1 : 1;
      const importe = signo * Math.abs(importeRaw);
      const neto = (netoRaw != null && netoRaw !== "") ? signo * Math.abs(numJSON(netoRaw)) : null;
      const producto = idxProd[normProd(nombre)];
      if (!producto) { faltan.push(String(nombre)); noVinculados.add(String(nombre)); return; }
      resueltas.push({ producto, cantidad, importe, neto, nombre });
    });

    // 2) Si falta algún producto por vincular → BLOQUEAR (no descontar, no marcar).
    if (faltan.length) {
      const rec = { id: clave, status: "blocked", type, serie, number, fecha, no_vinculados: [...new Set(faltan)], visto_en: nowISO };
      if (porClave[clave]) store.update("docs_agora", clave, rec); else store.insert("docs_agora", rec);
      bloqueados.push({ clave, no_vinculados: rec.no_vinculados });
      return;
    }

    // 3) Descontar stock + libro de movimientos + registrar venta.
    resueltas.forEach(({ producto, cantidad, importe, neto }) => {
      (producto.ingredientes || []).forEach((ing) => {
        const m = idxMat[ing.materia_id];
        if (!m) { materiasFaltantes.add(`${producto.nombre || producto.id} → ${ing.materia_id}`); return; } // integridad (datos.7): no se descuenta un ingrediente inexistente, pero se SEÑALA
        const delta = -Math.round(ing.cantidad * cantidad * 100) / 100;
        m.disponibilidad_actual = Math.max(0, Math.round((m.disponibilidad_actual + delta) * 100) / 100);
        movimientos.push({
          id: store.nextId("mov", "stock_movements"),
          source: "agora", source_ref: `${type}:${serie}:${number}`,
          materia_id: m.id, delta, unidad: m.unidad || "", reason: "venta",
          producto: producto.nombre, created_at: nowISO, created_by: (usuario && usuario.nombre) || "Ágora",
        });
      });
      nuevasVentas.push({
        id: store.nextId("ven", "ventas"),
        producto_id: producto.id, producto: producto.nombre,
        cantidad, importe, importe_neto: (neto != null ? neto : null), fecha, fuente: "agora",
        doc_clave: clave, doc_serie: serie, doc_number: number, importado_en: nowISO,
        // Trazabilidad: si coincide con una venta previa por Serie+Número+día, se
        // marca (no se descarta) para que la conciliación la revise (agora.4).
        posible_duplicado: posibleDup ? bk : undefined,
      });
      unidades += cantidad; importeTotal += importe;
    });

    const origen = referenciasOrigen(doc);
    const rec = { id: clave, status: "processed", type, serie, number, fecha, procesado_en: nowISO };
    if (origen) rec.origen = origen; // vínculo documental para la conciliación (agora.1)
    if (porClave[clave]) store.update("docs_agora", clave, rec); else store.insert("docs_agora", rec);
    procesados.push({ clave, serie, number, type });
    ventasBiz.add(bk); // ya presente: evita duplicar la misma venta dentro del lote
  });

  // Escrituras INCREMENTALES: añade solo lo nuevo, sin reescribir la tabla de
  // ventas entera en cada sync (datos.5/rendimiento.1). Materias es pequeña (se
  // actualizan saldos de las tocadas), así que su writeAll es barato.
  store.insertMany("stock_movements", movimientos);
  store.writeAll("materias", materias);
  store.insertMany("ventas", nuevasVentas);

  const resumen = {
    fuente: "agora",
    documentos: lista.length,
    procesados: procesados.length,
    bloqueados: bloqueados.length,
    omitidos_ya_procesados: omitidos.length,
    pedidos_omitidos: omitidosPedido.length,
    anulados_omitidos: anulados.length,
    duplicados_evitados: deduplicados.length,
    posibles_duplicados: posiblesDuplicados.length, // importados y marcados, NO descartados (agora.4)
    unidades_vendidas: Math.round(unidades * 100) / 100,
    importe_total: Math.round(importeTotal * 100) / 100,
    productos_no_vinculados: [...noVinculados],
    materias_faltantes: [...materiasFaltantes], // escandallos rotos (datos.7): el coste/stock de esos ingredientes NO se contó
    cuando: nowISO,
  };
  if (materiasFaltantes.size) console.warn("Ágora: escandallos con materia inexistente (no se descontó stock):", [...materiasFaltantes].join(", "));
  registrarSync(resumen);
  if (typeof registrar === "function") registrar(resumen);
  // procesados_ref: lo que hay que confirmar a Ágora (POST /api/doc/processed). Se
  // confirman también los deduplicados (ya existían) para que Ágora no los reenvíe.
  return {
    ...resumen,
    procesados_ref: [...procesados.map((p) => ({ Serie: p.serie, Number: p.number })), ...deduplicados.map((d) => ({ Serie: d.serie, Number: d.number })), ...omitidosPedido.map((d) => ({ Serie: d.serie, Number: d.number })), ...anulados.map((d) => ({ Serie: d.serie, Number: d.number }))],
    bloqueados_detalle: bloqueados,
  };
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
    // Idempotencia del CRON (agora.3): la vía heredada por CSV no deduplica, así
    // que reimportar el MISMO fichero cada hora duplicaba las ventas. Solo se
    // importa si el contenido cambió desde la última vez (marca persistida).
    const hash = crypto.createHash("sha1").update(texto).digest("hex");
    const marca = (store.readAll("config").find((c) => c && c.id === "agora_cron_csv_hash") || {}).valor;
    if (marca === hash) return; // fichero sin cambios → no reimportar
    const r = importarVentas(texto, "cron");
    const row = { id: "agora_cron_csv_hash", valor: hash, cuando: new Date().toISOString() };
    if (store.findById("config", "agora_cron_csv_hash")) store.update("config", "agora_cron_csv_hash", row);
    else store.insert("config", row);
    console.log(`Ágora cron: ${r.ventas_importadas} ventas importadas desde ${path}`);
  } catch (e) {
    console.error("Ágora cron error:", e.message);
  }
}

module.exports = { parseCSV, importarVentas, importarDocs, ultimaSync, cronImport };
