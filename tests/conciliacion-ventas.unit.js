// Conciliación de VENTAS con Ágora: total bruto/neto, desglose por tipo de
// documento, duplicados ESTRUCTURALES (misma venta como albarán Y factura; los
// tickets idénticos del mismo tipo —cafés iguales— NO cuentan), escaneo de precio
// real vs carta, y limpieza que quita el duplicado reponiendo stock.
// Ejecutar: node tests/conciliacion-ventas.unit.js
const assert = require("assert");
const store = require("../backend/data-store");

let fallos = 0;
const cola = [];
function test(n, fn) { cola.push({ n, fn }); } // se ejecutan en serie (hay tests async)
async function run() {
  for (const { n, fn } of cola) {
    try { await fn(); console.log("  ✓ " + n); }
    catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); }
  }
  if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
  console.log("  todo en verde");
}

// Monkeypatch del data-store con una base en memoria (el módulo lo usa directo).
function montar(seed) {
  const db = Object.assign({ ventas: [], docs_agora: [], productos: [], materias: [], stock_movements: [] }, seed || {});
  store.readAll = (n) => (db[n] || (db[n] = []));
  store.writeAll = (n, arr) => { db[n] = arr; };
  store.update = (n, id, patch) => { const x = (db[n] || []).find((y) => y.id === id); if (x) Object.assign(x, patch); return x; };
  store.insert = (n, o) => { (db[n] = db[n] || []).push(o); return o; };
  store.nextId = (p, n) => p + "-" + ((db[n] || []).length + 1);
  store.flush = async () => {};
  return db;
}

const C = require("../backend/conciliacion-ventas");
const T = Date.parse("2026-10-09T12:00:00");

function seedBase() {
  return {
    ventas: [
      // Factura real T/100: Brasa 8.5 + Sal 5.9 = 14.4
      { id: "v1", producto_id: "prod-001", producto: "Brasa", cantidad: 1, importe: 8.5, importe_neto: 7.73, fecha: "2026-10-09T09:10:00", doc_clave: "Invoice:T:100", doc_serie: "T", doc_number: 100, fuente: "agora" },
      { id: "v2", producto_id: "prod-002", producto: "Sal", cantidad: 1, importe: 5.9, importe_neto: 5.36, fecha: "2026-10-09T09:10:00", doc_clave: "Invoice:T:100", doc_serie: "T", doc_number: 100, fuente: "agora" },
      // La MISMA venta como Albarán T/55 (doble conteo cruzado)
      { id: "v3", producto_id: "prod-001", producto: "Brasa", cantidad: 1, importe: 8.5, importe_neto: 7.73, fecha: "2026-10-09T09:11:00", doc_clave: "DeliveryNote:T:55", doc_serie: "T", doc_number: 55, fuente: "agora" },
      { id: "v4", producto_id: "prod-002", producto: "Sal", cantidad: 1, importe: 5.9, importe_neto: 5.36, fecha: "2026-10-09T09:11:00", doc_clave: "DeliveryNote:T:55", doc_serie: "T", doc_number: 55, fuente: "agora" },
      // Dos cafés IDÉNTICOS, mismo tipo (Factura) → ventas reales, NO duplicados
      { id: "v7", producto_id: "prod-001", producto: "Brasa", cantidad: 1, importe: 8.5, fecha: "2026-10-09T11:00:00", doc_clave: "Invoice:T:200", doc_serie: "T", doc_number: 200, fuente: "agora" },
      { id: "v8", producto_id: "prod-001", producto: "Brasa", cantidad: 1, importe: 8.5, fecha: "2026-10-09T11:05:00", doc_clave: "Invoice:T:201", doc_serie: "T", doc_number: 201, fuente: "agora" },
      // Precio desviado: Brasa a 9.0 (carta 8.5)
      { id: "v9", producto_id: "prod-001", producto: "Brasa", cantidad: 2, importe: 18.0, fecha: "2026-10-09T11:30:00", doc_clave: "Invoice:T:202", doc_serie: "T", doc_number: 202, fuente: "agora" },
      // Ayer: no debe contar
      { id: "v6", producto_id: "prod-002", producto: "Sal", cantidad: 1, importe: 5.9, fecha: "2026-10-08T10:00:00", doc_clave: "Invoice:T:90" },
    ],
    docs_agora: [
      // La factura T/100 REFERENCIA explícitamente al albarán T/55 (vínculo
      // documental): es la misma venta facturada → se puede deduplicar.
      { id: "Invoice:T:100", type: "Invoice", origen: [{ serie: "T", number: 55 }] }, { id: "DeliveryNote:T:55", type: "DeliveryNote" },
      { id: "Invoice:T:200", type: "Invoice" }, { id: "Invoice:T:201", type: "Invoice" }, { id: "Invoice:T:202", type: "Invoice" },
    ],
    productos: [
      { id: "prod-001", nombre: "Brasa", precio_venta: 8.5, ingredientes: [{ materia_id: "m1", cantidad: 2 }] },
      { id: "prod-002", nombre: "Sal", precio_venta: 5.9, ingredientes: [{ materia_id: "m2", cantidad: 1 }] },
    ],
    materias: [
      { id: "m1", nombre: "Pan", disponibilidad_actual: 100, unidad: "ud" },
      { id: "m2", nombre: "Sal", disponibilidad_actual: 50, unidad: "g" },
    ],
  };
}

console.log("conciliación de ventas");

test("bruto = suma de todos los importes del día (ignora ayer)", () => {
  montar(seedBase());
  const r = C.conciliacionDia("2026-10-09", T);
  assert.strictEqual(r.bruto, 14.4 + 14.4 + 8.5 + 8.5 + 18.0);
  assert.strictEqual(r.dia, "2026-10-09");
});

test("neto disponible y menor que el bruto cuando hay base", () => {
  montar(seedBase());
  const r = C.conciliacionDia("2026-10-09", T);
  assert.strictEqual(r.neto_disponible, true);
  assert.ok(r.neto < r.bruto);
});

test("desglose por tipo separa Factura de Albarán", () => {
  montar(seedBase());
  const r = C.conciliacionDia("2026-10-09", T);
  const fac = r.por_tipo.find((t) => t.tipo === "Factura");
  const alb = r.por_tipo.find((t) => t.tipo === "Albarán");
  assert.ok(fac && alb, "debe haber ambos tipos");
  assert.strictEqual(alb.bruto, 14.4);
});

test("duplicado SOLO cuando cruza tipos (albarán+factura), no por cafés iguales", () => {
  montar(seedBase());
  const r = C.conciliacionDia("2026-10-09", T);
  assert.strictEqual(r.total_duplicado, 14.4);
  assert.strictEqual(r.duplicados.length, 1);
  assert.strictEqual(r.duplicados[0].se_queda.tipo, "Factura");
});

test("escaneo de precios marca el producto por encima de carta", () => {
  montar(seedBase());
  const r = C.conciliacionDia("2026-10-09", T);
  const brasa = r.por_producto.find((p) => p.nombre === "Brasa");
  assert.strictEqual(brasa.pvp_carta, 8.5);
  assert.strictEqual(brasa.coincide, false); // media cobrada > 8.5 por la línea a 9.0
  const sal = r.por_producto.find((p) => p.nombre === "Sal");
  assert.strictEqual(sal.coincide, true);
});

test("limpiar duplicados quita el albarán, baja el total y repone stock", async () => {
  const db = montar(seedBase());
  const L = await C.limpiarDuplicados("2026-10-09", { nombre: "Moni" }, T);
  assert.strictEqual(L.eliminados, 2);        // 2 líneas del albarán
  assert.strictEqual(L.importe_quitado, 14.4);
  assert.strictEqual(L.tickets_quitados, 1);
  // Stock repuesto: Brasa(2 ud materia) + Sal(1 ud) = 3
  assert.strictEqual(L.stock_repuesto, 3);
  assert.strictEqual(db.materias.find((m) => m.id === "m1").disponibilidad_actual, 102);
  assert.strictEqual(db.materias.find((m) => m.id === "m2").disponibilidad_actual, 51);
  // El doc del albarán queda marcado dedup
  assert.strictEqual(db.docs_agora.find((d) => d.id === "DeliveryNote:T:55").dedup, true);
  const r2 = C.conciliacionDia("2026-10-09", T);
  assert.strictEqual(r2.total_duplicado, 0);
  assert.strictEqual(r2.bruto, 14.4 + 8.5 + 8.5 + 18.0); // sin el albarán
});

test("NO borra ventas legítimas idénticas sin VÍNCULO documental (una facturada, otra en albarán)", async () => {
  // Dos ventas idénticas en contenido (Café 8,5): una como FACTURA y otra como
  // ALBARÁN, SIN que la factura referencie al albarán. Son DOS ventas reales
  // distintas → NO se deben fusionar ni borrar (agora.1). Solo se señalan.
  const db = montar({
    ventas: [
      { id: "a", producto_id: "prod-001", producto: "Café", cantidad: 1, importe: 8.5, fecha: "2026-10-09T09:00:00", doc_clave: "Invoice:T:400", doc_serie: "T", doc_number: 400 },
      { id: "c", producto_id: "prod-001", producto: "Café", cantidad: 1, importe: 8.5, fecha: "2026-10-09T09:10:00", doc_clave: "DeliveryNote:T:60", doc_serie: "T", doc_number: 60 },
    ],
    docs_agora: [
      { id: "Invoice:T:400", type: "Invoice" }, // SIN campo origen → sin vínculo
      { id: "DeliveryNote:T:60", type: "DeliveryNote" },
    ],
    productos: [{ id: "prod-001", nombre: "Café", ingredientes: [{ materia_id: "m1", cantidad: 2 }] }],
    materias: [{ id: "m1", nombre: "Pan", disponibilidad_actual: 100, unidad: "ud" }],
  });
  const L = await C.limpiarDuplicados("2026-10-09", { nombre: "Moni" }, T);
  assert.strictEqual(L.eliminados, 0, "sin vínculo documental NO se borra nada");
  assert.ok((L.candidatos || []).length >= 1, "el albarán se SEÑALA como candidato a revisar");
  const claves = db.ventas.map((v) => v.doc_clave);
  assert.ok(claves.includes("Invoice:T:400") && claves.includes("DeliveryNote:T:60"), "AMBAS ventas sobreviven");
});

test("SÍ deduplica cuando la factura REFERENCIA al albarán (vínculo documental)", async () => {
  const db = montar({
    ventas: [
      { id: "a", producto_id: "prod-001", producto: "Café", cantidad: 1, importe: 8.5, fecha: "2026-10-09T09:00:00", doc_clave: "Invoice:T:500", doc_serie: "T", doc_number: 500 },
      { id: "c", producto_id: "prod-001", producto: "Café", cantidad: 1, importe: 8.5, fecha: "2026-10-09T09:10:00", doc_clave: "DeliveryNote:T:70", doc_serie: "T", doc_number: 70 },
    ],
    docs_agora: [
      { id: "Invoice:T:500", type: "Invoice", origen: [{ serie: "T", number: 70 }] }, // factura factura el albarán T/70
      { id: "DeliveryNote:T:70", type: "DeliveryNote" },
    ],
    productos: [{ id: "prod-001", nombre: "Café", ingredientes: [{ materia_id: "m1", cantidad: 2 }] }],
    materias: [{ id: "m1", nombre: "Pan", disponibilidad_actual: 100, unidad: "ud" }],
  });
  const L = await C.limpiarDuplicados("2026-10-09", { nombre: "Moni" }, T);
  assert.strictEqual(L.eliminados, 1, "el albarán vinculado se quita");
  const claves = db.ventas.map((v) => v.doc_clave);
  assert.ok(claves.includes("Invoice:T:500") && !claves.includes("DeliveryNote:T:70"), "queda la factura, se quita el albarán facturado");
});

test("limpiar sin duplicados no toca nada", async () => {
  montar({
    ventas: [{ id: "x1", producto_id: "prod-001", producto: "Brasa", cantidad: 1, importe: 8.5, fecha: "2026-10-09T09:00:00", doc_clave: "Invoice:T:300", doc_serie: "T", doc_number: 300 }],
    docs_agora: [{ id: "Invoice:T:300", type: "Invoice" }],
    productos: [{ id: "prod-001", nombre: "Brasa", ingredientes: [] }],
  });
  const L = await C.limpiarDuplicados("2026-10-09", { nombre: "Moni" }, T);
  assert.strictEqual(L.eliminados, 0);
  assert.strictEqual(L.importe_quitado, 0);
});

run();
