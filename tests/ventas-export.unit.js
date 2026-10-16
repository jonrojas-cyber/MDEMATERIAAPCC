// Consumo desde el export "Análisis de Ventas": reconstruye los tickets y sus
// líneas y los pasa al motor de consumo (idempotente, ASÍNCRONO). Ejecutar:
// node tests/ventas-export.unit.js
const assert = require("assert");
const ve = require("../backend/ventas-export");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

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

(async () => {
  console.log("consumo desde export de ventas");

  await test("parseDocs reconstruye tickets con fecha, serie/número y líneas", async () => {
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

  await test("importar pasa los docs al motor de consumo (idempotente)", async () => {
    let recibidos = null;
    const fake = (docs) => { recibidos = docs; return { procesados: docs.length }; };
    const r = await ve.importar(Buffer.from(CSV, "utf8"), { agoraImportar: fake });
    assert.strictEqual(r.docs, 3);
    assert.strictEqual(recibidos.length, 3);
    assert.ok(recibidos[0].Lines[0].ProductName && recibidos[0].Lines[0].Quantity > 0);
  });

  await test("sin tickets válidos no llama al motor", async () => {
    let llamado = false;
    const r = await ve.importar(Buffer.from("hola;mundo\n;;;;", "utf8"), { agoraImportar: () => { llamado = true; return {}; } });
    assert.strictEqual(r.docs, 0);
    assert.strictEqual(llamado, false);
  });

  await test("cada línea guarda NETO (Base, col E) y total con IVA (col F)", async () => {
    const docs = ve.parseDocs(ve.aFilas(Buffer.from(CSV, "utf8")));
    const fw = docs[0].Lines[0]; // Flatwhite: Base 2, Total 2.2
    assert.strictEqual(fw.Base, 2);
    assert.strictEqual(fw.TotalAmount, 2.2);
  });

  await test("el consumo pasa al motor cada línea con su Base (neto) y Total (IVA)", async () => {
    let captured = null;
    await ve.importar(Buffer.from(CSV, "utf8"), { agoraImportar: (docs) => { captured = docs; return {}; } });
    const fw = captured[0].Lines[0]; // Flatwhite
    assert.strictEqual(fw.Base, 2);
    assert.strictEqual(fw.TotalAmount, 2.2);
  });

  // F02 · importarReemplazando YA NO borra a ciegas: RECONCILIA. No debe tocar la
  // tabla de ventas/docs del store (eso provocaba la pérdida de ventas del conector
  // en vivo cuando el export cubría menos días). Delega en la idempotencia del motor.
  await test("importarReemplazando NO borra ventas/docs del store (reconcilia, no arrasa · F02)", async () => {
    const d = {
      ventas: [{ id: "viva", fecha: "2026-09-05", importe: 99, fuente: "agora" }, { id: "otra", fecha: "2026-08-01", importe: 50 }],
      docs_agora: [{ id: "d1", fecha: "2026-09-05", status: "processed" }, { id: "d2", fecha: "2026-08-01", status: "processed" }],
    };
    const borrados = [];
    const st = {
      readAll: (e) => d[e] || (d[e] = []),
      writeAll: (e, v) => { borrados.push(e); d[e] = v; }, // si se llama, es un borrado masivo (lo prohibido)
    };
    let got = null;
    const r = await ve.importarReemplazando(st, Buffer.from(CSV, "utf8"), { agoraImportar: (docs) => { got = docs; return { procesados: docs.length }; } });
    assert.ok(r.docs > 0 && got.length > 0, "entrega los docs al motor");
    assert.strictEqual(r.reconciliado, true, "marca que reconcilia (no reemplaza a ciegas)");
    assert.deepStrictEqual(r.meses, ["2026-09"]);
    // NINGÚN writeAll sobre el store → no hay borrado masivo de ventas ni docs.
    assert.strictEqual(borrados.length, 0, "no borra a ciegas la tabla de ventas/docs");
    // Las ventas previas (incluida la viva de septiembre) siguen intactas.
    assert.strictEqual(d.ventas.filter((v) => v.id === "viva").length, 1, "la venta viva del mes NO se pierde");
    assert.strictEqual(d.ventas.filter((v) => v.id === "otra").length, 1, "agosto intacto");
    assert.strictEqual(d.docs_agora.length, 2, "los docs previos siguen ahí");
  });

  if (fallos) { console.error(`\n${fallos} fallo(s) en consumo desde export`); process.exit(1); }
  console.log("  consumo desde export de ventas OK");
  process.exit(0);
})();
