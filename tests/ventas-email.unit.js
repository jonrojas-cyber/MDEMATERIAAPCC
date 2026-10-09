// INGESTA DE VENTAS POR CORREO · detecta el export "Análisis de Ventas" de Ágora en
// un correo entrante y lo importa SOLO, con el mismo motor que la subida manual.
// Ejecutar: node tests/ventas-email.unit.js  (restaura backend/data después).

const assert = require("assert");
const store = require("../backend/data-store");
const ve = require("../backend/ventas-email");

let fallos = 0;
const cola = [];
function test(n, fn) { cola.push([n, fn]); }
async function run() { for (const [n, fn] of cola) { try { await fn(); console.log("  ✓ " + n); } catch (e) { fallos++; console.error("  ✗ " + n + "\n    " + (e && e.message)); } } }

console.log("ingesta de ventas por correo");

// ── Detección (esCorreoDeVentas) ───────────────────────────────────────────────
test("detecta export de ventas: CSV + asunto con 'ventas'", () => {
  const p = { subject: "Análisis de ventas septiembre", attachments: [{ filename: "export.csv", mediaType: "text/csv" }] };
  assert.strictEqual(ve.esCorreoDeVentas(p), true);
});
test("detecta por el nombre del fichero (xlsx 'Análisis de Ventas') aunque no haya asunto", () => {
  const p = { subject: "", attachments: [{ filename: "Análisis de Ventas.xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }] };
  assert.strictEqual(ve.esCorreoDeVentas(p), true);
});
test("NO confunde una factura (PDF) con ventas", () => {
  const p = { subject: "Factura Makro 123", attachments: [{ filename: "factura.pdf", mediaType: "application/pdf" }] };
  assert.strictEqual(ve.esCorreoDeVentas(p), false);
});
test("una hoja SIN marca de ventas no se trata como ventas (evita falsos positivos)", () => {
  const p = { subject: "hoja de datos", attachments: [{ filename: "datos.csv", mediaType: "text/csv" }] };
  assert.strictEqual(ve.esCorreoDeVentas(p), false);
});

// ── Importación real ────────────────────────────────────────────────────────────
const SNAP = {};
["productos", "ventas", "docs_agora", "materias", "stock_movements", "sincronizaciones"].forEach((e) => { SNAP[e] = (store.readAll(e) || []).slice(); });

function fixtures() {
  store.writeAll("productos", [
    { id: "p-cafe", nombre: "Café con leche", categoria: "Cafés", activo: true, ingredientes: [] },
    { id: "p-tosta", nombre: "Tostada", categoria: "Comida", activo: true, ingredientes: [] },
  ]);
  store.writeAll("ventas", []);
  store.writeAll("docs_agora", []);
  store.writeAll("materias", []);
}

// Export "Análisis de Ventas" (día / ticket / producto). Delimitador ';'. Columnas
// A;B;C;D;E;F → C=producto, D=cantidad, E=base(neto), F=total(con IVA).
const CSV_VENTAS = [
  "05/06/2026;;;;;",
  "05/06/2026 -> T/001;;;;;",
  ";;Café con leche;2;3,00;3,30",
  ";;Tostada;1;2,00;2,20",
  "06/06/2026 -> T/002;;;;;",
  ";;Café con leche;1;1,50;1,65",
].join("\n");

function correoVentas() {
  return {
    from: "monica@mdemateria.com",
    subject: "Ventas Ágora (análisis de ventas)",
    attachments: [{ filename: "analisis-ventas.csv", mediaType: "text/csv", base64: Buffer.from(CSV_VENTAS, "utf8").toString("base64") }],
  };
}

test("ingesta: importa el export, registra ventas de junio con neto", async () => {
  fixtures();
  const r = await ve.ingestar(store, correoVentas());
  assert.strictEqual(r.ok, true, "importó algo");
  assert.strictEqual(r.ventas_procesadas, 2, "2 tickets procesados");
  assert.deepStrictEqual(r.meses, ["2026-06"]);
  const ventas = store.readAll("ventas").filter((v) => String(v.fecha).startsWith("2026-06"));
  assert.strictEqual(ventas.length, 3, "3 líneas de venta (2 café + 1 tostada)");
  const cafe = ventas.find((v) => v.producto === "Café con leche" && v.cantidad === 2);
  assert.strictEqual(cafe.importe_neto, 3, "guarda el neto (Base = 3,00)");
});

test("ingesta idempotente: reenviar el mismo correo NO duplica (reemplaza el mes)", async () => {
  fixtures();
  await ve.ingestar(store, correoVentas());
  await ve.ingestar(store, correoVentas());
  const ventas = store.readAll("ventas").filter((v) => String(v.fecha).startsWith("2026-06"));
  assert.strictEqual(ventas.length, 3, "sigue habiendo 3 líneas, no 6");
});

run().then(() => {
  Object.keys(SNAP).forEach((e) => store.writeAll(e, SNAP[e]));
  if (fallos) { console.error(`\n${fallos} fallo(s) en ingesta de ventas por correo`); process.exit(1); }
  console.log("  ingesta de ventas por correo OK");
});
