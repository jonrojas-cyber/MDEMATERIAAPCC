// Consumo desde el export "Análisis de Ventas": reconstruye los tickets y sus
// líneas y los pasa al motor de consumo (idempotente). Ejecutar:
// node tests/ventas-export.unit.js
const assert = require("assert");
const ve = require("../backend/ventas-export");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("consumo desde export de ventas");

// Export en CSV con la estructura jerárquica (día · ticket · productos).
const CSV = [
  " ;Familia;Formato;Cantidad;Base;Total;Coste;Margen",
  "01/09/2026;;;281;373;422.07;0;373",
  "01/09/2026 -> T/001052;;;3;2.36;2.6;0;2.36",
  ";Cafes;Flatwhite;1;2;2.2;0;2",
  ";Cafes;Leche de avena;1;0.36;0.4;0;0.36",
  ";Cafes;Brasil;1;0;0;0;0",
  "01/09/2026 -> T/001053;;;1;1.64;1.8;0;1.64",
  ";Cafes;Espresso;2;3.28;3.6;0;3.28",
  "02/09/2026;;;5;10;11;0;10",
  "02/09/2026 -> T/001100;;;1;3.5;3.5;0;3.5",
  ";--;Tosta origen;1;3.18;3.5;0;3.18",
].join("\n");

test("parseDocs reconstruye tickets con fecha, serie/número y líneas", () => {
  const docs = ve.parseDocs(ve.aFilas(Buffer.from(CSV, "utf8")));
  assert.strictEqual(docs.length, 3); // T/001052, T/001053, T/001100
  const t1 = docs[0];
  assert.strictEqual(t1.Serie, "T");
  assert.strictEqual(t1.Number, "001052");
  assert.strictEqual(t1.Date, "2026-09-01");
  assert.strictEqual(t1.Lines.length, 3);
  assert.strictEqual(t1.Lines[0].ProductName, "Flatwhite");
  assert.strictEqual(t1.Lines[0].Quantity, 1);
  assert.strictEqual(docs[1].Lines[0].Quantity, 2); // Espresso ×2
  assert.strictEqual(docs[2].Date, "2026-09-02"); // cambia de día
});

test("importar pasa los docs al motor de consumo (idempotente)", () => {
  let recibidos = null;
  const fake = (docs) => { recibidos = docs; return { procesados: docs.length }; };
  const r = ve.importar(Buffer.from(CSV, "utf8"), { agoraImportar: fake });
  assert.strictEqual(r.docs, 3);
  assert.strictEqual(recibidos.length, 3);
  // El motor recibe el formato que entiende (Serie/Number/Lines con ProductName/Quantity).
  assert.ok(recibidos[0].Lines[0].ProductName && recibidos[0].Lines[0].Quantity > 0);
});

test("sin tickets válidos no llama al motor", () => {
  let llamado = false;
  const r = ve.importar(Buffer.from("hola;mundo\n;;;;", "utf8"), { agoraImportar: () => { llamado = true; return {}; } });
  assert.strictEqual(r.docs, 0);
  assert.strictEqual(llamado, false);
});

if (fallos) { console.error(`\n${fallos} fallo(s) en consumo desde export`); process.exit(1); }
console.log("  consumo desde export de ventas OK");
