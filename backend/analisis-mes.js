// ANÁLISIS DEL MES · snapshot mensual de ventas de Ágora.
//
// Fuente de la venta (dos vías, la app no llega sola a Ágora desde la nube):
//   1) CONECTOR de Ágora → mete cada ticket en la entidad "ventas" (automático,
//      cuando está conectado). agregarDesdeVentas(mes) construye el snapshot.
//   2) EXPORT "Análisis de Ventas" de Ágora (CSV) → parseExportAgora() lo
//      convierte en el mismo snapshot, para meses en que el conector no corrió.
//
// El snapshot guarda SOLO agregados (mix por familia, día de semana, serie
// diaria, tickets), nunca coste/precio nuestros: eso lo pone la Cuenta de
// Resultados (fuente única del dinero).

const store = require("./data-store");

const WD = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ORDEN_WD = [1, 2, 3, 4, 5, 6, 0]; // lunes→domingo
const IVA_HOSTELERIA = 0.10;

function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function num(x) {
  if (x == null) return 0;
  // admite "1.234,56" y "1234.56"
  let s = String(x).trim().replace(/[€\s]/g, "");
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.indexOf(",") > -1) s = s.replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
function ymd(y, mo, d) { return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
function wdDe(fechaISO) { const [y, mo, d] = fechaISO.split("-").map(Number); return new Date(y, mo - 1, d).getDay(); }

// Renombra familias de Ágora a etiquetas legibles.
const FAM_ALIAS = { "--": "Comida", "Cafes": "Cafés", "": "Otros" };
function famNombre(f) { return FAM_ALIAS[f] != null ? FAM_ALIAS[f] : f; }

// Compone el snapshot a partir de: filas de DÍA {fecha,uds,neto,total}, número
// de tickets y agregado por familia {familia:{uds,neto}}.
function componer(mes, dias, tickets, famMap, origen) {
  const real = dias.filter((d) => d.neto > 0);
  const neto = r2(real.reduce((s, d) => s + d.neto, 0));
  const total = r2(real.reduce((s, d) => s + d.total, 0) || neto * (1 + IVA_HOSTELERIA));
  const uds = Math.round(real.reduce((s, d) => s + d.uds, 0));
  const nTickets = tickets || 0;
  const por_familia = Object.values(famMap).map((f) => ({
    familia: famNombre(f.familia), uds: Math.round(f.uds), neto: r2(f.neto),
    pct: neto > 0 ? r2(f.neto / neto * 100) : 0,
  })).sort((a, b) => b.neto - a.neto);
  const wdAgg = {};
  real.forEach((d) => {
    const w = wdDe(d.fecha);
    const a = (wdAgg[w] = wdAgg[w] || { dias: 0, neto: 0, uds: 0 });
    a.dias++; a.neto += d.neto; a.uds += d.uds;
  });
  const por_dia_semana = ORDEN_WD.filter((w) => wdAgg[w]).map((w) => ({
    dia: WD[w], dias: wdAgg[w].dias,
    neto_medio: r2(wdAgg[w].neto / wdAgg[w].dias), uds_medio: Math.round(wdAgg[w].uds / wdAgg[w].dias),
  }));
  const serie = real.map((d) => ({ fecha: d.fecha, uds: Math.round(d.uds), neto: r2(d.neto), total: r2(d.total) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    id: "am-" + mes, mes, neto, total, uds, tickets: nTickets,
    ticket_medio: nTickets > 0 ? r2(neto / nTickets) : 0,
    uds_por_ticket: nTickets > 0 ? r2(uds / nTickets) : 0,
    dias_venta: real.length, neto_dia_medio: real.length ? r2(neto / real.length) : 0,
    por_familia, por_dia_semana, serie,
    origen: origen || "manual", generado_en: new Date().toISOString(),
  };
}

// Parser del export "Análisis de Ventas" de Ágora en CSV. El export es jerárquico:
//   · fila DÍA:     "DD/MM/YYYY" en col A + totales del día
//   · fila TICKET:  "... -> T/xxxx" en col A (subtotal de ticket) → se cuentan
//   · fila PRODUCTO: Familia en col B, Formato en col C + su venta
// Columnas: A(nombre) B(Familia) C(Formato) D(Cantidad) E(Base) F(Total) [G(Coste) H(Margen)]
// Núcleo del parser: recibe las FILAS ya separadas en celdas (matriz), venga de
// CSV o de xlsx. Columnas: A(nombre) B(Familia) C(Formato) D(Cantidad) E(Base) F(Total).
function parseFilas(filas, mesForzado) {
  if (!filas.length) throw new Error("El fichero está vacío.");
  // Detecta si la primera fila es cabecera (contiene "Familia"/"Base"…).
  let start = 0;
  const c0 = (filas[0] || []).map((x) => String(x == null ? "" : x).toLowerCase());
  if (c0.some((x) => /familia|base|cantidad|formato/.test(x))) start = 1;
  const dias = {}; const famMap = {}; let tickets = 0; let mesDetectado = null;
  for (let i = start; i < filas.length; i++) {
    const c = filas[i] || [];
    const A = String(c[0] == null ? "" : c[0]).trim();
    const mDia = A.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (mDia) {
      const fecha = ymd(+mDia[3], +mDia[2], +mDia[1]);
      if (!mesDetectado) mesDetectado = fecha.slice(0, 7);
      const d = (dias[fecha] = dias[fecha] || { fecha, uds: 0, neto: 0, total: 0 });
      d.uds += num(c[3]); d.neto += num(c[4]); d.total += num(c[5]);
      continue;
    }
    if (A.includes("->")) { tickets++; continue; }
    const familia = String(c[1] == null ? "" : c[1]).trim();
    if (!familia) continue; // salta agregados sin familia (evita duplicar)
    const f = (famMap[familia] = famMap[familia] || { familia, uds: 0, neto: 0 });
    f.uds += num(c[3]); f.neto += num(c[4]);
  }
  const mes = mesForzado || mesDetectado;
  if (!mes) throw new Error("No se pudo detectar el mes (faltan filas de día DD/MM/AAAA).");
  const snap = componer(mes, Object.values(dias), tickets, famMap, "agora_export");
  if (!(snap.neto > 0)) throw new Error("El fichero no tiene ventas reconocibles.");
  return snap;
}

function parseExportAgora(csvText, mesForzado) {
  const lineas = String(csvText).split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lineas.length) throw new Error("El fichero está vacío.");
  const delim = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ";" : ",";
  const filas = lineas.map((l) => l.split(delim).map((c) => c.replace(/^"|"$/g, "").trim()));
  return parseFilas(filas, mesForzado);
}

// Importa desde un fichero cualquiera (Buffer): detecta xlsx (ZIP, cabecera "PK")
// y lo lee sin dependencias; si no, lo trata como CSV.
function parseExportBuffer(buf, mesForzado) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || "");
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    const filas = require("./xlsx-lite").readXlsxSheet(b);
    return parseFilas(filas, mesForzado);
  }
  return parseExportAgora(b.toString("utf8"), mesForzado);
}

// Construye el snapshot desde la entidad "ventas" (lo que mete el conector).
// Cada venta: { producto_id, producto, cantidad, importe (=base), fecha, doc_clave }.
function agregarDesdeVentas(mes, opts) {
  const ventas = (store.readAll("ventas") || []).filter((v) => String(v.fecha || "").slice(0, 7) === mes);
  const productos = store.readAll("productos") || [];
  const byId = {}; productos.forEach((p) => (byId[p.id] = p));
  const diasMap = {}; const famMap = {}; const tk = new Set();
  ventas.forEach((v) => {
    const fecha = String(v.fecha).slice(0, 10);
    const cant = Number(v.cantidad) || 0, imp = Number(v.importe) || 0;
    const d = (diasMap[fecha] = diasMap[fecha] || { fecha, uds: 0, neto: 0, total: 0 });
    d.uds += cant; d.neto += imp; d.total += imp * (1 + IVA_HOSTELERIA);
    const p = byId[v.producto_id];
    const familia = (p && p.categoria) || "Otros";
    const f = (famMap[familia] = famMap[familia] || { familia, uds: 0, neto: 0 });
    f.uds += cant; f.neto += imp;
    if (v.doc_clave) tk.add(v.doc_clave);
  });
  return componer(mes, Object.values(diasMap), tk.size, famMap, "conector");
}

function guardar(snap) {
  const existe = store.findById("analisis_mes", snap.id);
  if (existe) store.update("analisis_mes", snap.id, snap);
  else store.insert("analisis_mes", snap);
  return snap;
}

function obtener(mes) { return store.findById("analisis_mes", "am-" + mes) || null; }
function listarMeses() {
  return (store.readAll("analisis_mes") || []).map((s) => s.mes).sort().reverse();
}

module.exports = { parseExportAgora, parseExportBuffer, parseFilas, agregarDesdeVentas, componer, guardar, obtener, listarMeses, num, r2 };
