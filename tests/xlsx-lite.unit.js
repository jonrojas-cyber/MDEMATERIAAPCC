// Lector mínimo de .xlsx (sin dependencias) + importación por Buffer.
// Ejecutar: node tests/xlsx-lite.unit.js
//
// Construye un .xlsx sintético EN MEMORIA (ZIP con entradas "stored", sin
// comprimir, para no depender de nada) con la misma estructura jerárquica que
// el export "Análisis de Ventas" de Ágora, y comprueba que:
//   · xlsx-lite lo descomprime y lo convierte en matriz de celdas,
//   · parseExportBuffer detecta el xlsx (cabecera "PK") y produce el snapshot,
//   · un CSV normal sigue funcionando por la misma vía (parseExportBuffer).

const assert = require("assert");
const xlsx = require("../backend/xlsx-lite");
const am = require("../backend/analisis-mes");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("xlsx-lite");

// ── Mini-constructor de ZIP (método 0 = "stored", sin comprimir) ──────────────
// xlsx-lite no comprueba el CRC, así que lo dejamos en 0.
function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // firma cabecera local
    lh.writeUInt16LE(20, 4);         // versión
    lh.writeUInt16LE(0, 6);          // flags
    lh.writeUInt16LE(0, 8);          // método = stored
    lh.writeUInt32LE(0, 10);         // fecha/hora
    lh.writeUInt32LE(0, 14);         // crc32
    lh.writeUInt32LE(body.length, 18); // tamaño comprimido
    lh.writeUInt32LE(body.length, 22); // tamaño sin comprimir
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);         // extra len
    parts.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); // firma directorio central
    ch.writeUInt16LE(20, 4);         // versión creada
    ch.writeUInt16LE(20, 6);         // versión necesaria
    ch.writeUInt16LE(0, 8);          // flags
    ch.writeUInt16LE(0, 10);         // método
    ch.writeUInt32LE(0, 12);         // fecha/hora
    ch.writeUInt32LE(0, 16);         // crc32
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(body.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);         // extra len
    ch.writeUInt16LE(0, 32);         // comment len
    ch.writeUInt16LE(0, 34);         // disco
    ch.writeUInt16LE(0, 36);         // attrs internos
    ch.writeUInt32LE(0, 38);         // attrs externos
    ch.writeUInt32LE(offset, 42);    // offset cabecera local
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + body.length;
  }
  const cdStart = offset;
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, cdBuf, eocd]);
}

// Cadenas compartidas (índices 0..n) y celdas de texto que las referencian.
const STRINGS = ["Familia", "Formato", "Cantidad", "Base", "Total",
  "01/09/2026", "01/09/2026 -> T/001", "Cafes", "Latte", "--", "Tosta", "02/09/2026", "02/09/2026 -> T/002"];
function ss(list) {
  return `<?xml version="1.0"?><sst count="${list.length}" uniqueCount="${list.length}">` +
    list.map((s) => `<si><t>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`).join("") + `</sst>`;
}
// Celda de texto (shared string) o numérica.
function cS(ref, idx) { return `<c r="${ref}" t="s"><v>${idx}</v></c>`; }
function cN(ref, n) { return `<c r="${ref}"><v>${n}</v></c>`; }

// Hoja con la misma jerarquía del CSV del test de análisis-mes:
//   Fila día (A=fecha, D=uds, E=base, F=total), fila ticket (A contiene "->"),
//   filas de producto (B=familia, D=uds, E=base).
const rows = [
  // cabecera: A vacía, B..E = Familia/Formato/Cantidad/Base
  `<row r="1">${cS("B1", 0)}${cS("C1", 1)}${cS("D1", 2)}${cS("E1", 3)}${cS("F1", 4)}</row>`,
  `<row r="2">${cS("A2", 5)}${cN("D2", 10)}${cN("E2", 100)}${cN("F2", 110)}</row>`,      // día 01/09
  `<row r="3">${cS("A3", 6)}${cN("D3", 3)}${cN("E3", 30)}${cN("F3", 33)}</row>`,         // ticket
  `<row r="4">${cS("B4", 7)}${cS("C4", 8)}${cN("D4", 2)}${cN("E4", 4)}</row>`,           // Cafes/Latte
  `<row r="5">${cS("B5", 9)}${cS("C5", 10)}${cN("D5", 1)}${cN("E5", 6)}</row>`,          // --/Tosta
  `<row r="6">${cS("A6", 11)}${cN("D6", 5)}${cN("E6", 50)}${cN("F6", 55)}</row>`,        // día 02/09
  `<row r="7">${cS("A7", 12)}${cN("D7", 5)}${cN("E7", 50)}${cN("F7", 55)}</row>`,        // ticket
  `<row r="8">${cS("B8", 7)}${cS("C8", 8)}${cN("D8", 3)}${cN("E8", 6)}</row>`,           // Cafes/Latte
].join("");
const SHEET = `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;

const XLSX = zip([
  { name: "[Content_Types].xml", data: `<?xml version="1.0"?><Types/>` },
  { name: "xl/sharedStrings.xml", data: ss(STRINGS) },
  { name: "xl/worksheets/sheet1.xml", data: SHEET },
]);

test("cabecera de xlsx es ZIP (PK\\x03\\x04)", () => {
  assert.strictEqual(XLSX[0], 0x50);
  assert.strictEqual(XLSX[1], 0x4b);
  assert.strictEqual(XLSX[2], 0x03);
  assert.strictEqual(XLSX[3], 0x04);
});

test("readXlsxSheet devuelve la matriz de celdas con texto resuelto", () => {
  const m = xlsx.readXlsxSheet(XLSX);
  assert.strictEqual(m.length, 8, "filas=" + m.length);
  assert.strictEqual(m[1][0], "01/09/2026");   // A2 shared string
  assert.strictEqual(m[1][3], "10");            // D2 numérica
  assert.strictEqual(m[3][1], "Cafes");         // B4 familia
});

test("parseExportBuffer detecta xlsx y compone el snapshot", () => {
  const s = am.parseExportBuffer(XLSX);
  assert.strictEqual(s.mes, "2026-09");
  assert.strictEqual(s.neto, 150);        // 100 + 50
  assert.strictEqual(s.total, 165);       // 110 + 55
  assert.strictEqual(s.uds, 15);          // 10 + 5
  assert.strictEqual(s.tickets, 2);       // dos filas "-> T/"
  assert.strictEqual(s.dias_venta, 2);
  const cafes = s.por_familia.find((f) => f.familia === "Cafés");
  assert.ok(cafes && cafes.neto === 10, "Cafés=" + JSON.stringify(cafes)); // 4 + 6
});

test("parseExportBuffer con mesForzado respeta el mes", () => {
  const s = am.parseExportBuffer(XLSX, "2026-08");
  assert.strictEqual(s.mes, "2026-08");
});

test("parseExportBuffer sigue leyendo CSV (no-ZIP) por la misma vía", () => {
  const CSV = [
    " ;Familia;Formato;Cantidad;Base;Total",
    "01/09/2026;;;10;100;110",
    "01/09/2026 -> T/001;;;3;30;33",
    ";Cafes;Latte;2;4;4,4",
  ].join("\n");
  const s = am.parseExportBuffer(Buffer.from(CSV, "utf8"));
  assert.strictEqual(s.mes, "2026-09");
  assert.strictEqual(s.neto, 100);
  assert.strictEqual(s.tickets, 1);
});

test("un ZIP sin hojas de cálculo lanza error claro", () => {
  const vacio = zip([{ name: "[Content_Types].xml", data: `<?xml version="1.0"?><Types/>` }]);
  assert.throws(() => xlsx.readXlsxSheet(vacio), /hoja/i);
});

// Regresión: libros con etiquetas prefijadas por espacio de nombres (x:) e
// inline strings (ClosedXML/EPPlus/.NET), y lectura de TODAS las hojas.
test("lee xlsx con prefijo de namespace (x:), inline strings y varias hojas", () => {
  const sstVacio = `<?xml version="1.0"?><x:sst xmlns:x="ns" />`;
  const inl = (ref, txt) => `<x:c r="${ref}" t="inlineStr"><x:is><x:t>${txt}</x:t></x:is></x:c>`;
  const n = (ref, v) => `<x:c r="${ref}"><x:v>${v}</x:v></x:c>`;
  const hoja1 = `<?xml version="1.0"?><x:worksheet xmlns:x="ns"><x:sheetData>` +
    `<x:row r="1">${inl("A1", "Resumen")}</x:row></x:sheetData></x:worksheet>`;
  const hoja2 = `<?xml version="1.0"?><x:worksheet xmlns:x="ns"><x:sheetData>` +
    `<x:row r="1">${inl("A1", "Proveedor")}${inl("B1", "Total")}</x:row>` +
    `<x:row r="2">${inl("A2", "Panamar")}${n("B2", "65.97")}</x:row>` +
    `</x:sheetData></x:worksheet>`;
  const buf = zip([
    { name: "xl/sharedStrings.xml", data: sstVacio },
    { name: "xl/worksheets/sheet1.xml", data: hoja1 },
    { name: "xl/worksheets/sheet2.xml", data: hoja2 },
  ]);
  const hojas = xlsx.readXlsxSheets(buf);
  assert.strictEqual(hojas.length, 2);
  assert.strictEqual(hojas[0].rows[0][0], "Resumen");
  assert.strictEqual(hojas[1].rows[1][0], "Panamar");
  assert.strictEqual(hojas[1].rows[1][1], "65.97");
});

if (fallos) { console.error(`\n${fallos} fallo(s) en xlsx-lite`); process.exit(1); }
console.log("  xlsx-lite OK");
