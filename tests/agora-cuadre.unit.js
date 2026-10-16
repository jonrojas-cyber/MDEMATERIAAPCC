// Cuadre con Ágora: la ingesta NO debe sumar de más frente a "VENTAS HOY" de Ágora.
//  (1) Un PEDIDO (SalesOrder) no es venta cerrada → no se cuenta.
//  (2) Una DEVOLUCIÓN (línea con cantidad negativa) RESTA (antes se descartaba).
// importarDocs es ASÍNCRONO (escritura atómica con store.transaction · F03); el
// store simulado incluye una transaction que aplica las ops al final (todo o nada).
// Ejecutar: node tests/agora-cuadre.unit.js
const assert = require("assert");
const store = require("../backend/data-store");

let fallos = 0;
async function test(n, fn) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } }

function montar() {
  const db = {
    productos: [{ id: "p-cafe", nombre: "Café", ingredientes: [] }],
    materias: [], ventas: [], docs_agora: [], stock_movements: [], sincronizaciones: [],
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
  // Transacción simulada: acumula upserts/dels y los aplica al final (todo o nada).
  store.transaction = async (fn) => {
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

(async () => {
  console.log("cuadre de ingesta con Ágora");

  await test("un PEDIDO (SalesOrder) no se cuenta como venta", async () => {
    const db = montar();
    const docs = {
      Invoices: [{ Serie: "T", Number: 1, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 10, TotalAmount: 20 }] }],
      SalesOrders: [{ Serie: "P", Number: 1, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 5, TotalAmount: 10 }] }],
    };
    const r = await agora.importarDocs(docs, {});
    assert.strictEqual(r.pedidos_omitidos, 1, "el pedido se omite");
    assert.strictEqual(r.importe_total, 20, "solo cuenta la factura (20), no el pedido (10)");
    assert.strictEqual(db.ventas.length, 1, "una sola venta registrada (la factura)");
  });

  await test("una DEVOLUCIÓN (cantidad negativa) RESTA del total", async () => {
    const db = montar();
    const docs = {
      Invoices: [
        { Serie: "T", Number: 1, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 10, TotalAmount: 20 }] },
        { Serie: "T", Number: 2, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: -2, TotalAmount: 4 }] },
      ],
    };
    const r = await agora.importarDocs(docs, {});
    assert.strictEqual(r.importe_total, 16, "20 − 4 (devolución) = 16");
    assert.strictEqual(r.unidades_vendidas, 8, "10 − 2 = 8");
    const dev = db.ventas.find((v) => v.importe < 0);
    assert.ok(dev && dev.importe === -4, "la devolución queda registrada en negativo");
  });

  await test("la devolución repone stock (no lo descuenta)", async () => {
    const db = montar();
    db.productos = [{ id: "p-cafe", nombre: "Café", ingredientes: [{ materia_id: "m1", cantidad: 2 }] }];
    db.materias = [{ id: "m1", nombre: "Grano", disponibilidad_actual: 100, unidad: "g" }];
    const docs = { Invoices: [{ Serie: "T", Number: 5, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: -3, TotalAmount: 6 }] }] };
    await agora.importarDocs(docs, {});
    assert.strictEqual(db.materias[0].disponibilidad_actual, 106, "stock repuesto (+6), no descontado");
  });

  await test("un documento ANULADO/cancelado no se cuenta como venta", async () => {
    const db = montar();
    const docs = {
      Invoices: [
        { Serie: "T", Number: 10, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 1, TotalAmount: 2 }] },
        { Serie: "T", Number: 11, BusinessDay: "2026-10-10", Cancelled: true, Lines: [{ ProductName: "Café", Quantity: 5, TotalAmount: 10 }] },
        { Serie: "T", Number: 12, BusinessDay: "2026-10-10", Status: "Anulada", Lines: [{ ProductName: "Café", Quantity: 3, TotalAmount: 6 }] },
      ],
    };
    const r = await agora.importarDocs(docs, {});
    assert.strictEqual(r.anulados_omitidos, 2, "se omiten las 2 anuladas");
    assert.strictEqual(r.importe_total, 2, "solo cuenta la factura válida (2)");
    assert.strictEqual(db.ventas.length, 1, "una sola venta registrada");
  });

  console.log("Ágora · separa anulaciones / invitaciones / devoluciones / descuentos (agora.5)");

  await test("devoluciones e invitaciones se CUENTAN aparte y se etiquetan (naturaleza)", async () => {
    const db = montar();
    const docs = {
      Invoices: [
        { Serie: "T", Number: 20, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 10, TotalAmount: 20 }] },
        { Serie: "T", Number: 21, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: -2, TotalAmount: 4 }] },
        { Serie: "T", Number: 22, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 1, TotalAmount: 0 }] },
      ],
    };
    const r = await agora.importarDocs(docs, {});
    assert.strictEqual(r.devoluciones, 1, "una devolución contada aparte");
    assert.strictEqual(r.importe_devuelto, -4, "importe devuelto reportado (negativo)");
    assert.strictEqual(r.invitaciones, 1, "una invitación contada aparte");
    assert.strictEqual(r.unidades_invitadas, 1, "unidades invitadas reportadas");
    assert.strictEqual(r.importe_total, 16);
    const nat = (n) => db.ventas.find((v) => String(v.doc_number) === String(n)).naturaleza;
    assert.strictEqual(nat(20), "venta");
    assert.strictEqual(nat(21), "devolucion");
    assert.strictEqual(nat(22), "invitacion");
  });

  await test("la invitación (0 €) SÍ descuenta stock aunque no sume importe", async () => {
    const db = montar();
    db.productos = [{ id: "p-cafe", nombre: "Café", ingredientes: [{ materia_id: "m1", cantidad: 2 }] }];
    db.materias = [{ id: "m1", nombre: "Grano", disponibilidad_actual: 100, unidad: "g" }];
    const docs = { Invoices: [{ Serie: "T", Number: 30, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 3, TotalAmount: 0 }] }] };
    const r = await agora.importarDocs(docs, {});
    assert.strictEqual(r.invitaciones, 1);
    assert.strictEqual(r.importe_total, 0, "no suma dinero");
    assert.strictEqual(db.materias[0].disponibilidad_actual, 94, "pero gasta producto (3×2=6)");
  });

  await test("descuento GLOBAL de documento se SEÑALA y queda marcado como pendiente (PARCIAL)", async () => {
    const db = montar();
    const docs = {
      Invoices: [
        { Serie: "T", Number: 40, BusinessDay: "2026-10-10", GlobalDiscount: 1.5, Lines: [{ ProductName: "Café", Quantity: 5, TotalAmount: 10 }] },
        { Serie: "T", Number: 41, BusinessDay: "2026-10-10", Lines: [{ ProductName: "Café", Quantity: 1, TotalAmount: 2 }] },
      ],
    };
    const r = await agora.importarDocs(docs, {});
    assert.strictEqual(r.descuentos_globales, 1, "detecta el descuento global del ticket");
    assert.strictEqual(r.importe_descuento_global, 1.5, "reporta el importe del descuento");
    assert.strictEqual(r.descuento_global_pendiente, true, "marcado pendiente: reparto por línea requiere muestra de Ágora");
    assert.strictEqual(r.importe_total, 12, "el total de líneas no se toca sin saber el reparto");
  });

  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
  process.exit(0);
})();
