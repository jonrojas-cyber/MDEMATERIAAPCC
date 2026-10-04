// CONSUMO DESDE EL EXPORT "ANÁLISIS DE VENTAS" DE ÁGORA (por producto)
// ─────────────────────────────────────────────────────────────────────────────
// El export trae, por día, cada ticket y sus líneas de producto:
//   Fila DÍA:      "DD/MM/YYYY" en col A.
//   Fila TICKET:   "DD/MM/YYYY -> T/xxxxx" en col A.
//   Fila PRODUCTO: col B=familia, col C=producto, col D=cantidad, col F=total.
// Se reconstruyen "docs" (un ticket = un doc con sus líneas) y se pasan al motor
// de consumo de Ágora (agora.importarDocs), que es idempotente (por ticket),
// descuenta stock según el escandallo de cada producto y registra las ventas.
// Así cruzamos compra vs venta y el almacén cuadra, sin duplicar al reimportar.

const { readXlsxSheet } = require("./xlsx-lite");

function num(x) {
  if (x == null || x === "") return 0;
  let s = String(x).trim().replace(/[€\s]/g, "");
  if (s.indexOf(",") > -1 && s.indexOf(".") > -1) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.indexOf(",") > -1) s = s.replace(",", ".");
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
function ymd(dd, mm, yyyy) { return `${yyyy}-${mm}-${dd}`; }

// Convierte un buffer (xlsx o CSV) en matriz de filas.
function aFilas(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || "");
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return readXlsxSheet(b);
  const txt = b.toString("utf8");
  const lineas = txt.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lineas.length) return [];
  const delim = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ";" : ",";
  return lineas.map((l) => l.split(delim).map((c) => c.replace(/^"|"$/g, "").trim()));
}

// Reconstruye los docs (tickets con sus líneas) a partir de las filas.
function parseDocs(filas) {
  const docs = [];
  let fecha = null, cur = null;
  (filas || []).forEach((c) => {
    const A = String((c && c[0]) == null ? "" : c[0]).trim();
    const mDia = A.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (mDia) { fecha = ymd(mDia[1], mDia[2], mDia[3]); cur = null; return; }
    if (A.includes("->")) {
      const md = A.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (md) fecha = ymd(md[1], md[2], md[3]);
      const ref = (A.split("->")[1] || "").trim();      // "T/001052"
      const parts = ref.split("/");
      const serie = parts.length > 1 ? parts[0] : "T";
      const number = parts.length > 1 ? parts.slice(1).join("/") : ref;
      cur = { type: "TicketExport", Serie: serie, Number: number, Date: fecha, Lines: [] };
      docs.push(cur);
      return;
    }
    // Línea de producto: col C (2)=producto, col D (3)=cantidad, col E (4)=Base
    // (neto, sin IVA), col F (5)=Total (con IVA). Guardamos ambos: el P&L va
    // sobre el NETO (Base); el total con IVA queda como referencia.
    const producto = String((c && c[2]) == null ? "" : c[2]).trim();
    const cantidad = num(c && c[3]);
    if (!cur || !producto) return;
    const base = num(c && c[4]);
    const total = num(c && c[5]);
    cur.Lines.push({ ProductName: producto, Quantity: cantidad, TotalAmount: total, Base: base });
  });
  return docs.filter((d) => d.Lines.length);
}

// Importa el consumo desde el buffer del export. `agoraImportar` inyectable (test).
function importar(buf, opts = {}) {
  const agoraImportar = opts.agoraImportar || require("./agora").importarDocs;
  const docs = parseDocs(aFilas(buf));
  if (!docs.length) return { docs: 0, resultado: null };
  const r = agoraImportar(docs, { usuario: { nombre: "Export Ágora" } });
  return { docs: docs.length, resultado: r };
}

// Importa REEMPLAZANDO el/los mes(es) del fichero: borra antes las ventas y los
// docs de Ágora de esos meses (cualquier origen, también los heredados sin
// doc_clave) y los reconstruye limpios, con neto y sin duplicar. Es lo que deben
// usar TODAS las vías de subida de ventas. Devuelve 0 docs si el fichero no tiene
// el formato jerárquico (día/ticket/producto), para poder caer a otro lector.
function importarReemplazando(store, buf, opts = {}) {
  const docs = parseDocs(aFilas(buf));
  if (!docs.length) return { docs: 0, resultado: null, reemplazado: false, meses: [] };
  const meses = new Set(docs.map((d) => String(d.Date || "").slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)));
  if (meses.size && store) {
    const enMes = (f) => meses.has(String(f || "").slice(0, 7));
    store.writeAll("ventas", (store.readAll("ventas") || []).filter((v) => !enMes(v.fecha)));
    store.writeAll("docs_agora", (store.readAll("docs_agora") || []).filter((d) => !enMes(d.fecha)));
  }
  const r = importar(buf, opts);
  return { ...r, reemplazado: true, meses: [...meses] };
}

module.exports = { importar, importarReemplazando, parseDocs, aFilas };
