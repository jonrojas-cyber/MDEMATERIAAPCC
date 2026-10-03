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

function parseSharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g; let m;
  while ((m = re.exec(xml))) {
    const t = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
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
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g; let rm;
  while ((rm = rowRe.exec(xml))) {
    const arr = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g; let cm;
    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1] || "", inner = cm[2];
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const col = colIndex(ref);
      const t = (attrs.match(/t="([^"]+)"/) || [])[1];
      let val = "";
      if (inner != null) {
        if (t === "s") { const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1]; val = strings[+v] != null ? strings[+v] : ""; }
        else if (t === "inlineStr") { val = decodeXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")); }
        else { const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1]; val = v != null ? decodeXml(v) : ""; }
      }
      arr[col] = val;
    }
    rows.push(arr);
  }
  return rows;
}

// Devuelve la PRIMERA hoja como matriz de celdas [fila][columna] = texto.
function readXlsxSheet(buffer) {
  const files = unzip(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  const ss = files["xl/sharedStrings.xml"] ? files["xl/sharedStrings.xml"].toString("utf8") : "";
  const strings = parseSharedStrings(ss);
  const sheetName = Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
  if (!sheetName) throw new Error("El .xlsx no tiene hojas de cálculo.");
  return sheetToRows(files[sheetName].toString("utf8"), strings);
}

module.exports = { readXlsxSheet, unzip, parseSharedStrings, sheetToRows };
