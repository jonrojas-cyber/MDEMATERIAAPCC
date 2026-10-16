// CONTENCIÓN DE LA INGESTA DE ÁGORA (Paso 1 · F02/F03/F20).
// Gate tests que deben pasar ANTES de desplegar la corrección:
//   G1 · ATOMICIDAD (F03): si la escritura falla, NO queda marcador "procesado"
//        sin su venta (ni venta sin marcador). store.transaction = todo o nada.
//   G2 · IDEMPOTENCIA QUE DESCARTA (F03/F20/F36): reimportar o recibir la misma
//        venta por otra vía (misma Serie+Número+día) NO duplica ni re-descuenta
//        stock. Ventas DISTINTAS por vías distintas SÍ entran las dos (sin pérdida).
// Ejecutar: node tests/contencion-ingesta.unit.js
const assert = require("assert");
const store = require("../backend/data-store");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

// Store simulado con transacción atómica (aplica upserts/dels al final, todo o nada).
function montar(opts = {}) {
  const db = {
    productos: [{ id: "p-cafe", nombre: "Café", ingredientes: [{ materia_id: "m1", cantidad: 2 }] }],
    materias: [{ id: "m1", nombre: "Grano", disponibilidad_actual: 100, unidad: "g" }],
    ventas: [], docs_agora: [], stock_movements: [], sincronizaciones: [],
  };
  let seq = 0;
  store.readAll = (n) => (db[n] || (db[n] = []));
  store.writeAll = (n, a) => { db[n] = a; };
  store.findById = (n, id) => (db[n] || []).find((x) => x.id === id) || null;
  store.insert = (n, o) => { (db[n] = db[n] || []).push(o); return o; };
  store.insertMany = (n, rows) => { const a = (db[n] = db[n] || []); (rows || []).forEach((r) => a.push(r)); return rows; };
  store.update = (n, id, patch) => { const x = (db[n] || []).find((y) => y.id === id); if (x) Object.assign(x, patch); return x; };
  store.nextId = (p) => `${p}-${++seq}`;
  store.flush = async () => {};
  store.transaction = async (fn) => {
    if (opts.failTransaction) throw new Error("fallo de BD simulado a mitad de la escritura");
    const ops = [];
    await fn({ upsert: (n, row) => ops.push(["u", n, row]), del: (n, id) => ops.push(["d", n, id]), readAll: store.readAll });
    ops.forEach(([t, n, x]) => {
      const a = (db[n] = db[n] || []);
      if (t === "u") { const i = a.findIndex((y) => y.id === x.id); if (i === -1) a.push(x); else a[i] = x; }
      else { const i = a.findIndex((y) => y.id === x); if (i !== -1) a.splice(i, 1); }
    });
  };
  return db;
}

const agora = require("../backend/agora");
const doc = (serie, number, fecha, qty) => ({ Invoices: [{ type: "Invoice", Serie: serie, Number: number, BusinessDay: fecha, Lines: [{ ProductName: "Café", Quantity: qty, TotalAmount: 2.2 * qty, Base: 2 * qty }] }] });

(async () => {
  console.log("contención de la ingesta de Ágora (F02/F03/F20)");

  await test("G1 · ATÓMICO (F03): si la escritura falla, NO queda marcador sin venta ni venta sin marcador", async () => {
    const db = montar({ failTransaction: true });
    await assert.rejects(() => agora.importarDocs(doc("T", 1, "2026-09-01", 1), {}), /fallo de BD/);
    assert.strictEqual(db.ventas.length, 0, "no se persistió ninguna venta");
    assert.strictEqual(db.docs_agora.filter((d) => d.status === "processed").length, 0, "no quedó NINGÚN marcador 'procesado' huérfano");
  });

  await test("G2a · reimportar el MISMO documento (misma clave) no duplica ni re-descuenta stock", async () => {
    const db = montar();
    const r1 = await agora.importarDocs(doc("T", 1052, "2026-09-01", 1), {});
    assert.strictEqual(r1.procesados, 1);
    assert.strictEqual(db.ventas.length, 1);
    assert.strictEqual(db.materias[0].disponibilidad_actual, 98, "descontó 1×2 g");
    const r2 = await agora.importarDocs(doc("T", 1052, "2026-09-01", 1), {});
    assert.strictEqual(r2.procesados, 0, "no reprocesa");
    assert.strictEqual(r2.omitidos_ya_procesados, 1, "omitido por clave idéntica");
    assert.strictEqual(db.ventas.length, 1, "no se duplicó la venta");
    assert.strictEqual(db.materias[0].disponibilidad_actual, 98, "el stock NO volvió a bajar");
  });

  await test("G2b · la MISMA venta por OTRA vía (Invoice vs TicketExport, misma Serie+Número+día) se DESCARTA", async () => {
    const db = montar();
    // Vía 1: conector (Invoice T/1052).
    await agora.importarDocs(doc("T", 1052, "2026-09-01", 1), {});
    assert.strictEqual(db.ventas.length, 1);
    assert.strictEqual(db.materias[0].disponibilidad_actual, 98);
    // Vía 2: export mensual (TicketExport T/001052, mismo ticket).
    const r2 = await agora.importarDocs([{ type: "TicketExport", Serie: "T", Number: "001052", Date: "2026-09-01", Lines: [{ ProductName: "Café", Quantity: 1, TotalAmount: 2.2, Base: 2 }] }], {});
    assert.strictEqual(r2.procesados, 0, "no la cuenta otra vez");
    assert.strictEqual(r2.duplicados_evitados, 1, "la descarta como duplicado de negocio");
    assert.strictEqual(db.ventas.length, 1, "sigue habiendo UNA sola venta (sin doble conteo · F36)");
    assert.strictEqual(db.materias[0].disponibilidad_actual, 98, "el stock NO se descontó dos veces (F20)");
  });

  await test("G2c · ventas DISTINTAS por vías distintas entran las DOS (sin pérdida)", async () => {
    const db = montar();
    await agora.importarDocs(doc("T", 1, "2026-09-01", 1), {});      // conector
    const r2 = await agora.importarDocs([{ type: "TicketExport", Serie: "T", Number: "002", Date: "2026-09-01", Lines: [{ ProductName: "Café", Quantity: 1, TotalAmount: 2.2, Base: 2 }] }], {}); // export, ticket distinto
    assert.strictEqual(r2.procesados, 1, "el ticket distinto SÍ se registra");
    assert.strictEqual(db.ventas.length, 2, "dos ventas distintas conservadas");
    assert.strictEqual(db.materias[0].disponibilidad_actual, 96, "descontó las dos (2×2 g)");
  });

  await test("G1b · en el camino feliz, venta + marcador 'procesado' quedan AMBOS escritos", async () => {
    const db = montar();
    await agora.importarDocs(doc("T", 7, "2026-09-01", 1), {});
    assert.strictEqual(db.ventas.length, 1, "venta escrita");
    assert.strictEqual(db.docs_agora.filter((d) => d.status === "processed").length, 1, "marcador escrito junto a la venta");
    assert.strictEqual(db.stock_movements.length, 1, "movimiento de stock escrito en la misma transacción");
  });

  if (fallos) { console.error(`\n${fallos} fallo(s) en contención de ingesta`); process.exit(1); }
  console.log("  contención de ingesta OK");
  process.exit(0);
})();
