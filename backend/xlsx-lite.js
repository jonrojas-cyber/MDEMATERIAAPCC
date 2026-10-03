// LECTOR MÍNIMO DE XLSX (sin dependencias externas)
// ─────────────────────────────────────────────────────────────────────────────
// Un .xlsx es un ZIP con XML dentro. Aquí se descomprime el ZIP (vía zlib, que ya
// trae Node) leyendo el directorio central, y se extrae la PRIMERA hoja como una
// matriz de celdas (texto por columna). Suficiente para importar el "Análisis de
// Ventas" de Ágora/AG Grid sin añadir librerías pesadas al proyecto.

const zlib = require("zlib");

// Descomprime el ZIP a { "ruta/fichero": Buffer }. Usa el directorio central
// (fiable, con tamaños y offsets), no los data-descriptors.
function unzip(buf) {
  const files = {};
  const SIG_EOCD = 0x06054b50, SIG_CEN = 0x02014b50;
  // Busca el End Of Central Directory desde el final (con margen para comentario).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("No es un .xlsx válido (ZIP sin directorio).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let e = 0; e < count; e++) {
    if (buf.readUInt32LE(p) !== SIG_CEN) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    // Cabecera local: el campo extra puede diferir del central → se relee aquí.
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const comp = buf.slice(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = comp;                 // almacenado (sin comprimir)
    else if (method === 8) data = zlib.inflateRawSync(comp); // deflate
    else throw new Error("Compresión ZIP no soportada: " + method);
    files[name] = data;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function decodeXml(s) {
  return String(s == null ? "" : s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, "&");
}

// Nota: algunos generadores (ClosedXML/EPPlus/.NET) prefijan TODAS las etiquetas
// con un espacio de nombres, p. ej. <x:si>, <x:t>, <x:row>, <x:c>, <x:v>. Por eso
// todas las expresiones aceptan un prefijo opcional (?:\w+:)?.
function parseSharedStrings(xml) {
  const out = [];
  const re = /<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g; let m;
  while ((m = re.exec(xml))) {
    const t = [...m[1].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((x) => x[1]).join("");
    out.push(decodeXml(t));
  }
  return out;
}

function colIndex(ref) {
  const letters = String(ref || "").replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function sheetToRows(xml, strings) {
  const rows = [];
  const rowRe = /<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g; let rm;
  while ((rm = rowRe.exec(xml))) {
    const arr = [];
    let auto = 0;
    const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g; let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1] || "", inner = cm[2];
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      const col = ref ? colIndex(ref) : auto; // sin r= → posición secuencial
      auto = col + 1;
      const t = (attrs.match(/t="([^"]+)"/) || [])[1];
      let val = "";
      if (inner != null) {
        if (t === "s") { const v = (inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1]; val = strings[+v] != null ? strings[+v] : ""; }
        else if (t === "inlineStr" || t === "str") { val = decodeXml([...inner.matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((x) => x[1]).join("")) || decodeXml((inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1] || ""); }
        else { const v = (inner.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1]; val = v != null ? decodeXml(v) : ""; }
      }
      arr[col] = val;
    }
    rows.push(arr);
  }
  return rows;
}

// Ordena sheet1, sheet2… numéricamente (no "sheet10" antes que "sheet2").
function ordenHojas(a, b) {
  const na = +(a.match(/(\d+)\.xml$/) || [])[1] || 0;
  const nb = +(b.match(/(\d+)\.xml$/) || [])[1] || 0;
  return na - nb;
}

// Devuelve la PRIMERA hoja como matriz de celdas [fila][columna] = texto.
function readXlsxSheet(buffer) {
  const hojas = readXlsxSheets(buffer);
  if (!hojas.length) throw new Error("El .xlsx no tiene hojas de cálculo.");
  return hojas[0].rows;
}

// Devuelve TODAS las hojas: [{ name, rows }]. Útil cuando los datos no están en
// la primera hoja (p. ej. un libro con una portada/resumen y el detalle detrás).
function readXlsxSheets(buffer) {
  const files = unzip(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  const ss = files["xl/sharedStrings.xml"] ? files["xl/sharedStrings.xml"].toString("utf8") : "";
  const strings = parseSharedStrings(ss);
  const nombres = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort(ordenHojas);
  return nombres.map((n) => ({ name: n, rows: sheetToRows(files[n].toString("utf8"), strings) }));
}

module.exports = { readXlsxSheet, readXlsxSheets, unzip, parseSharedStrings, sheetToRows };
