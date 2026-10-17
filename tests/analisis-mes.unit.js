// Análisis del mes: parser del export de Ágora + snapshot sembrado.
// Ejecutar: node tests/analisis-mes.unit.js
const assert = require("assert");
const am = require("../backend/analisis-mes");
const seed = require("../backend/seed-analisis-mes");

let fallos = 0;
function test(n, fn) { try { fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + e.message); } }

console.log("análisis del mes");

// CSV sintético con el formato jerárquico del "Análisis de Ventas" de Ágora.
const CSV = [
  " ;Familia;Formato;Cantidad;Base;Total;Coste;Margen",
  "01/09/2026;;;10;100;110;0;100",
  "01/09/2026 -> T/001;;;3;30;33;0;30",
  ";Cafes;Latte;2;4;4,4;0;4",
  ";--;Tosta;1;6;6,6;0;6",
  "02/09/2026;;;5;50;55;0;50",
  "02/09/2026 -> T/002;;;5;50;55;0;50",
  ";Cafes;Latte;3;6;6,6;0;6",
].join("\n");

test("parseExportAgora suma días, cuenta tickets y agrega por familia", () => {
  const s = am.parseExportAgora(CSV);
  assert.strictEqual(s.mes, "2026-09");
  assert.strictEqual(s.neto, 150);          // 100 + 50 (filas de día)
  assert.strictEqual(s.total, 165);         // 110 + 55
  assert.strictEqual(s.uds, 15);            // 10 + 5
  assert.strictEqual(s.tickets, 2);         // dos filas "-> T/"
  assert.strictEqual(s.ticket_medio, 75);   // 150 / 2
  assert.strictEqual(s.dias_venta, 2);
});

test("renombra familias (Cafes→Cafés, --→Comida) y calcula %", () => {
  const s = am.parseExportAgora(CSV);
  const nombres = s.por_familia.map((f) => f.familia);
  assert.ok(nombres.includes("Cafés"), "falta Cafés: " + nombres.join(","));
  assert.ok(nombres.includes("Comida"), "falta Comida: " + nombres.join(","));
  const cafes = s.por_familia.find((f) => f.familia === "Cafés");
  assert.strictEqual(cafes.neto, 10);       // 4 + 6
});

test("patrón por día de semana con nombres correctos", () => {
  const s = am.parseExportAgora(CSV);
  const dias = s.por_dia_semana.map((d) => d.dia);
  assert.ok(dias.includes("Martes"), "01/09/2026 es martes");     // 1 sep 2026 = martes
  assert.ok(dias.includes("Miércoles"), "02/09/2026 es miércoles");
});

test("mesForzado tiene prioridad sobre la fecha detectada", () => {
  const s = am.parseExportAgora(CSV, "2026-08");
  assert.strictEqual(s.mes, "2026-08");
  assert.strictEqual(s.id, "am-2026-08");
});

test("un CSV sin ventas reconocibles lanza error", () => {
  assert.throws(() => am.parseExportAgora("hola;mundo\n;;;;;"), /vac|ventas|mes/i);
});

test("el snapshot sembrado de septiembre 2026 es coherente", () => {
  const s = seed.SNAP;
  assert.strictEqual(s.mes, "2026-09");
  assert.ok(Math.abs(s.neto - 12484.81) < 0.5, "neto=" + s.neto);
  assert.strictEqual(s.tickets, 1902);
  assert.ok(s.por_familia.some((f) => f.familia === "Comida"));
  assert.ok(s.por_familia.some((f) => f.familia === "Cafés"));
  assert.ok(s.serie.length >= 18, "serie=" + s.serie.length);
  // Los % de familia deben sumar ~100.
  const suma = s.por_familia.reduce((a, f) => a + f.pct, 0);
  assert.ok(Math.abs(suma - 100) < 1.5, "suma %=" + suma);
});

test("E1 · agregarDesdeVentas (conector) usa importe_neto y NO re-aplica IVA (cuadra con la vía CSV)", () => {
  // Fixture IVA mixto (doc 03): importe=BRUTO, importe_neto=NETO (Base de Ágora).
  const store = require("../backend/data-store");
  const ventas = [
    { producto_id: "p-cafe", fecha: "2026-09-01", cantidad: 5000, importe: 11000, importe_neto: 10000, doc_clave: "d1" },
    { producto_id: "p-sand", fecha: "2026-09-02", cantidad: 1000, importe: 6600, importe_neto: 6000, doc_clave: "d2" },
    { producto_id: "p-bolsa", fecha: "2026-09-03", cantidad: 200, importe: 2420, importe_neto: 2000, doc_clave: "d3" },
  ];
  const prods = [{ id: "p-cafe", categoria: "Cafes" }, { id: "p-sand", categoria: "--" }, { id: "p-bolsa", categoria: "Retail" }];
  const orig = store.readAll;
  store.readAll = (n) => (n === "ventas" ? ventas : n === "productos" ? prods : []);
  try {
    const s = am.agregarDesdeVentas("2026-09");
    assert.strictEqual(s.neto, 18000, "neto = suma de importe_neto (Base), no el bruto (el bug daba 20.020)");
    assert.strictEqual(s.total, 20020, "total = bruto con IVA, sin re-aplicar 10% (el bug daba 22.022)");
    assert.strictEqual(s.tickets, 3);
  } finally { store.readAll = orig; }
});

if (fallos) { console.error(`\n${fallos} fallo(s) en análisis del mes`); process.exit(1); }
console.log("  análisis del mes OK");
